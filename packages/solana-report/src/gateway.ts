import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { ExactSvmScheme } from '@x402/svm/exact/server';
import { getCompiledTransactionMessageDecoder, getSignatureFromTransaction } from '@solana/kit';
import { decodeTransactionFromPayload, getTokenPayerFromTransaction, transactionMessageHash } from '@x402/svm';
import { NETWORK, MINT, PRICE, invariant, svmAddress, type Order } from './model.js';

export type ChainResult = { status: 'pending' | 'confirmed' | 'rejected'; reason?: string };
export interface ChainReader { check(order: Order, transaction: string): Promise<ChainResult> }

/** The resource SDK and facilitator perform scheme verification; the application
 * also binds the resource, request, payer and durable payment identity. */
export class SvmGateway {
  private server: x402ResourceServer;
  constructor(facilitator: FacilitatorClient, readonly chain: ChainReader, readonly payTo: string) {
    svmAddress(payTo);
    // No rpcUrl: constructing a quote cannot silently contact an RPC.
    this.server = new x402ResourceServer(facilitator).register(NETWORK, new ExactSvmScheme());
  }
  async initialize() {
    await this.server.initialize();
    invariant(this.server.getSupportedKind(2, NETWORK, 'exact'), 'unsupported_facilitator', 503);
  }
  async requirements(memo: string): Promise<PaymentRequirements> {
    const requirements = await this.server.buildPaymentRequirements({
      scheme: 'exact', network: NETWORK, payTo: this.payTo,
      price: { amount: PRICE, asset: MINT, extra: { decimals: 6, memo } }, maxTimeoutSeconds: 120,
    });
    invariant(requirements.length === 1 && requirements[0].extra?.feePayer, 'missing_facilitator_fee_payer', 503);
    return requirements[0];
  }
  identity(payload: PaymentPayload) {
    invariant(typeof payload.payload?.transaction === 'string' && payload.payload.transaction.length <= 4096, 'invalid_transaction');
    const decoded = decodeTransactionFromPayload({ transaction: payload.payload.transaction });
    const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
    const memos = message.instructions.filter(ix => message.staticAccounts[ix.programAddressIndex] === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    invariant(memos.length === 1 && new TextDecoder().decode(memos[0].data) === payload.accepted.extra?.memo, 'payment_memo_mismatch', 402);
    return { paymentId: transactionMessageHash(decoded), payer: getTokenPayerFromTransaction(decoded) };
  }
  verify(payload: PaymentPayload, requirements: PaymentRequirements) { return this.server.verifyPayment(payload, requirements); }
  settle(payload: PaymentPayload, requirements: PaymentRequirements) { return this.server.settlePayment(payload, requirements); }
}

/** Inject transport. There is deliberately no default RPC URL or fetch here. */
export class SolanaChainReader implements ChainReader {
  constructor(private rpc: (method: string, params: unknown[]) => Promise<unknown>) {}
  async check(order: Order, transaction: string): Promise<ChainResult> {
    const genesis = await this.rpc('getGenesisHash', []);
    if (typeof genesis !== 'string' || genesis.slice(0, 32) !== NETWORK.split(':')[1]) return { status: 'rejected', reason: 'wrong_rpc_network' };
    const response = await this.rpc('getTransaction', [transaction, { commitment: 'confirmed', encoding: 'base64', maxSupportedTransactionVersion: 0 }]) as {
      transaction: [string, string]; meta: { err: unknown; preTokenBalances: TokenBalance[]; postTokenBalances: TokenBalance[] };
    } | null;
    if (!response) return { status: 'pending', reason: 'transaction_not_visible' };
    if (!response.meta || response.meta.err !== null) return { status: 'rejected', reason: 'transaction_failed' };
    const tx = decodeTransactionFromPayload({ transaction: response.transaction[0] });
    if (getSignatureFromTransaction(tx) !== transaction) return { status: 'rejected', reason: 'transaction_signature_mismatch' };
    if (transactionMessageHash(tx) !== order.paymentId) return { status: 'rejected', reason: 'transaction_message_mismatch' };
    // Network confirmation and transfer amount must both agree with the order.
    // Require pre-created accounts so both pre/post balances identify their owner.
    const delta = (owner: string) => sum(response.meta.postTokenBalances, owner) - sum(response.meta.preTokenBalances, owner);
    if (order.payer === order.requirements.payTo || delta(order.payer) !== -BigInt(order.requirements.amount) || delta(order.requirements.payTo) !== BigInt(order.requirements.amount)) {
      return { status: 'rejected', reason: 'transfer_mismatch' };
    }
    return { status: 'confirmed' };
  }
}
type TokenBalance = { owner?: string; mint: string; uiTokenAmount: { amount: string; decimals: number } };
function sum(balances: TokenBalance[], owner: string): bigint {
  return balances.filter(b => b.owner === owner && b.mint === MINT && b.uiTokenAmount.decimals === 6)
    .reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);
}
