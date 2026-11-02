/** OFFLINE FIXTURES ONLY. No keypairs, signatures, wallets, fetch or RPC calls.
 * Structurally serialized transactions contain zero signatures and are invalid
 * on chain. The mock facilitator deliberately accepts them for state testing. */
import { address, blockhash, createTransactionMessage, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstruction, compileTransaction, getTransactionEncoder, getBase64Decoder, getBase58Decoder, AccountRole } from '@solana/kit';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import type { FacilitatorClient } from '@x402/core/server';
import type { PaymentPayload } from '@x402/core/types';
import { TOKEN_PROGRAM_ADDRESS } from '@x402/svm';
import { MINT, NETWORK, digest, type Order } from './model.js';
import type { ChainReader } from './gateway.js';

export const mockAddress = (n: number) => address(getBase58Decoder().decode(new Uint8Array(32).fill(n)));
export const OFFLINE_PAYER = mockAddress(1);
export const OFFLINE_MERCHANT = mockAddress(2);
export const OFFLINE_FEE_PAYER = mockAddress(3);
export function unsignedFixture(order: Order, variant = String(order.requirements.extra?.memo)): PaymentPayload {
  const data = new Uint8Array(10);
  data[0] = 12; // TransferChecked instruction, followed by u64 amount and decimals.
  new DataView(data.buffer).setBigUint64(1, BigInt(order.requirements.amount), true);
  data[9] = 6;
  const message = setTransactionMessageFeePayer(OFFLINE_FEE_PAYER, createTransactionMessage({ version: 0 }));
  const lifetime = setTransactionMessageLifetimeUsingBlockhash({ blockhash: blockhash(mockAddress(6)), lastValidBlockHeight: 1000n }, message);
  const transfer = appendTransactionMessageInstruction({
    programAddress: address(TOKEN_PROGRAM_ADDRESS), accounts: [
      { address: mockAddress(4), role: AccountRole.WRITABLE }, { address: address(MINT), role: AccountRole.READONLY },
      { address: mockAddress(5), role: AccountRole.WRITABLE }, { address: address(order.payer), role: AccountRole.READONLY_SIGNER },
    ], data,
  }, lifetime);
  const withMemo = appendTransactionMessageInstruction({ programAddress: address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), data: new TextEncoder().encode(variant) }, transfer);
  const transaction = getBase64Decoder().decode(getTransactionEncoder().encode(compileTransaction(withMemo)));
  return { x402Version: 2, resource: { url: order.resource, description: 'OFFLINE unsigned fixture', mimeType: 'application/json' }, accepted: order.requirements, payload: { transaction } };
}
export const fixtureHeader = (order: Order, variant?: string) => encodePaymentSignatureHeader(unsignedFixture(order, variant));

export class OfflineRail implements FacilitatorClient, ChainReader {
  calls = { verify: 0, settle: 0, check: 0 };
  invalidReason?: string;
  timeout = false;
  visible = true;
  async getSupported() { return { kinds: [{ x402Version: 2, scheme: 'exact', network: NETWORK, extra: { feePayer: OFFLINE_FEE_PAYER } }], extensions: [], signers: { [NETWORK]: [OFFLINE_FEE_PAYER] } }; }
  async verify(payload: PaymentPayload) {
    this.calls.verify++;
    return this.invalidReason ? { isValid: false, invalidReason: this.invalidReason } : { isValid: true, payer: OFFLINE_PAYER };
  }
  async settle(payload: PaymentPayload) {
    this.calls.settle++;
    if (this.timeout) throw new Error('Simulated facilitator timeout');
    return { success: true, network: NETWORK, transaction: `offline-only-${digest(payload.payload.transaction)}`, payer: OFFLINE_PAYER };
  }
  async check(_order: Order, _tx: string) {
    this.calls.check++;
    return { status: this.visible ? 'confirmed' as const : 'pending' as const };
  }
}
