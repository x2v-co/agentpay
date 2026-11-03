import { orderMemo } from '../../packages/solana-report/src/memo.js';
import { address, getAddressEncoder, getCompiledTransactionMessageDecoder, getTransactionEncoder, getTransactionDecoder, type Transaction, type TransactionPartialSigner } from '@solana/kit';
import { x402Client } from '@x402/core/client';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import type { PaymentRequired } from '@x402/core/types';
import type { getWallets } from '@wallet-standard/app';
import { NETWORK, MINT, PRICE, TOKEN_PROGRAM } from '../../packages/solana-report/src/constants.js';

export type StandardWallet = ReturnType<ReturnType<typeof getWallets>['get']>[number];
export type WalletAccount = StandardWallet['accounts'][number];
export function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function compatible(wallet: StandardWallet) {
  const feature = wallet.features['solana:signTransaction'] as { supportedTransactionVersions?: readonly unknown[] } | undefined;
  return wallet.chains.includes('solana:devnet') && !!wallet.features['standard:connect'] && feature?.supportedTransactionVersions?.includes(0);
}
export type Preview = { payer: string; payTo: string; payerAta: string; merchantAta: string; feePayer: string; orderId: string; requestDigest: string; resource: string; expiresAt: number };
export async function validateQuote(required: PaymentRequired, preview: Preview) {
  check(Date.now() < preview.expiresAt, '报价已过期，请重新检查；不要重复提交旧付款。');
  check(required.x402Version === 2 && required.resource?.url === preview.resource && required.accepts.length === 1, '付款资源与预览不一致。');
  const req = required.accepts[0];
  check(req.scheme === 'exact' && req.network === NETWORK && req.asset === MINT && req.amount === PRICE && req.payTo === preview.payTo, '网络、资产、金额或收款人不匹配。');
  check(req.extra?.feePayer === preview.feePayer && req.extra?.memo === await orderMemo(preview.orderId, preview.requestDigest), '付款 memo 或手续费账户不匹配。');
  check(!req.extra?.paymentFlow || req.extra.paymentFlow === 'authorization', '不支持的支付阶段。');
}
export async function validatePreparedTransaction(tx: Transaction, preview: Preview) {
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  const keys = message.staticAccounts;
  check(keys[0] === preview.feePayer, '钱包不应承担此付款的交易手续费。');
  let transfers = 0, memos = 0;
  for (const instruction of message.instructions) {
    const program = keys[instruction.programAddressIndex];
    const data = new Uint8Array(instruction.data || []);
    if (program === TOKEN_PROGRAM) {
      transfers++;
      check(data.length === 10 && data[0] === 12 && data[9] === 6 && new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(1, true) === BigInt(PRICE), '转账指令不是固定金额 USDC TransferChecked。');
      const accounts = instruction.accountIndices?.map(index => keys[index]);
      check(accounts?.length === 4 && accounts[0] === preview.payerAta && accounts[1] === MINT && accounts[2] === preview.merchantAta && accounts[3] === preview.payer, '转账账户与预览不匹配。');
    } else if (program === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
      memos++; check(new TextDecoder().decode(data) === await orderMemo(preview.orderId, preview.requestDigest), '交易未绑定当前订单。');
    } else if (program === 'ComputeBudget111111111111111111111111111111') {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      check((data.length === 5 && data[0] === 2 && view.getUint32(1, true) <= 200000) || (data.length === 9 && data[0] === 3 && view.getBigUint64(1, true) <= 1000000n), '交易计算预算过高。');
    } else throw new Error('交易含有未允许的程序；不会请求签名。');
  }
  check(transfers === 1 && memos === 1, '交易必须仅包含一笔付款及订单 memo。');
}
export async function verifyWalletOutput(original: Transaction, signedBytes: Uint8Array, payer: string) {
  const signed = getTransactionDecoder().decode(signedBytes);
  check(original.messageBytes.length === signed.messageBytes.length && original.messageBytes.every((b, i) => b === signed.messageBytes[i]), '钱包更改了交易内容，已拒绝。');
  const signature = signed.signatures[address(payer)];
  check(signature && signature.length === 64, '钱包未返回付款方签名。');
  const publicKey = await crypto.subtle.importKey('raw', new Uint8Array(getAddressEncoder().encode(address(payer))), { name: 'Ed25519' }, false, ['verify']);
  check(await crypto.subtle.verify('Ed25519', publicKey, new Uint8Array(signature), new Uint8Array(signed.messageBytes)), '付款方签名验证失败。');
  return { [address(payer)]: signature };
}
/** Called only from the user's explicit sign click; never calls signAndSend. */
export async function signWithWallet(wallet: StandardWallet, account: WalletAccount, required: PaymentRequired, preview: Preview, rpcUrl: string) {
  await validateQuote(required, preview);
  check(compatible(wallet) && account.address === preview.payer && account.chains.includes('solana:devnet') && account.features.includes('solana:signTransaction'), '钱包账户不支持 devnet 单独签名。');
  check(wallet.accounts.some(a => a.address === account.address), '钱包账户已变更，请重新连接并检查。');
  const feature = wallet.features['solana:signTransaction'] as { signTransaction: (...inputs: { account: WalletAccount; chain: string; transaction: Uint8Array }[]) => Promise<{ signedTransaction: Uint8Array }[]> };
  const signer: TransactionPartialSigner = { address: address(account.address), signTransactions: async transactions => {
    check(transactions.length === 1, '仅允许签一笔固定金额付款。');
    await validatePreparedTransaction(transactions[0], preview);
    const outputs = await feature.signTransaction({ account, chain: 'solana:devnet', transaction: new Uint8Array(getTransactionEncoder().encode(transactions[0])) });
    check(outputs.length === 1, '钱包返回了意外的签名数量。');
    return [await verifyWalletOutput(transactions[0], outputs[0].signedTransaction, account.address)];
  } };
  const client = new x402Client().register(NETWORK, new ExactSvmScheme(signer, { rpcUrl }));
  return client.createPaymentPayload(required);
}
