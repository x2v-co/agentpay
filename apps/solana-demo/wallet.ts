import { getWallets } from '@wallet-standard/app';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentPayload, PaymentRequired } from '@x402/core/types';
import { compatible, check, signWithWallet, type StandardWallet, type WalletAccount, type Preview } from './wallet-adapter.js';
import { MINT, NETWORK, PRICE } from '../../packages/solana-report/src/constants.js';
import type { Order } from '../../packages/solana-report/src/model.js';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);
const input = (id: string) => $<HTMLInputElement>(id);
let session: { token: string; merchant?: string }; let wallet: StandardWallet | undefined; let account: WalletAccount | undefined;
let wallets: StandardWallet[] = []; let order: Order | undefined; let required: PaymentRequired | undefined; let preview: Preview | undefined; let signed: PaymentPayload | undefined;
let capability: any; let accounts: any; let busy = false; let submitted = false;
const registry = getWallets(); // Discovery only: no connection request.
const status = (text: string) => { $('status').textContent = text; };
const evidence = (value: unknown) => { $('evidence').textContent = JSON.stringify(value, null, 2); };
const format = (value: string) => { const n = BigInt(value), a = n < 0n ? -n : n; return `${n < 0n ? '-' : ''}${a / 1000000n}.${String(a % 1000000n).padStart(6, '0')}`; };
function sync() {
  button('connect').disabled = busy || !wallets.length;
  button('configure').disabled = busy || !account;
  button('create').disabled = busy || !accounts || !!(order && ['settling', 'pending', 'paid'].includes(order.state));
  button('sign').disabled = busy || !preview || !required || !input('confirm').checked || !!signed || submitted;
  button('submit').disabled = busy || !signed || submitted || !input('confirm').checked;
  button('recover').disabled = busy || !accounts || !sessionStorage.getItem('agentpay-devnet-order');
}
async function run(fn: () => Promise<void>) { if (busy) return; busy = true; sync(); try { await fn(); } catch (error) { status(error instanceof Error ? error.message : String(error)); } finally { busy = false; sync(); } }
async function request(path: string, body?: unknown) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); check(response.ok || response.status === 402, data.error || `HTTP ${response.status}`); return { response, data };
}
function refresh() {
  wallets = registry.get().filter(compatible); const select = $<HTMLSelectElement>('wallets');
  select.replaceChildren(...wallets.map((w, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = w.name; return option; }));
  if (!wallets.length) status('未检测到支持 devnet 单独签名的钱包。请自行安装／启用已有可信钱包后刷新；不要在此输入密钥。'); sync();
}
function resetPayment() { order = undefined; preview = undefined; required = undefined; signed = undefined; submitted = false; input('confirm').checked = false; button('download').disabled = true; $('preview').textContent = '账户或收款信息已变化，请重新检查并报价。'; }
function showOrder(value: Order) {
  order = value; evidence({ capability, accounts, order });
  status(`${order.state.toUpperCase()} · ${order.reason || order.id}`);
  $('report-summary').textContent = order.report ? `${order.report.affordable ? '预算充足' : '超出预算'}：采购成本 ${format(order.report.costAtomic)} USDC，剩余 ${format(order.report.remainingAtomic)} USDC。` : '尚未交付报告；只会在独立链上确认后交付。';
  button('download').disabled = order.state !== 'delivered';
}
button('refresh-wallets').onclick = refresh;
button('connect').onclick = () => run(async () => {
  resetPayment(); accounts = undefined;
  wallet = wallets[Number($<HTMLSelectElement>('wallets').value)]; check(wallet, '请选择钱包。');
  const connection = wallet.features['standard:connect'] as { connect: () => Promise<{ accounts: readonly WalletAccount[] }> };
  const result = await connection.connect();
  account = result.accounts.find(a => a.chains.includes('solana:devnet') && a.features.includes('solana:signTransaction'));
  check(account, '钱包未授权 devnet 签名账户。'); $('payer').textContent = `付款公钥：${account.address}`; status('已连接；尚未签名或付款。请检查收款账户。');
});
input('merchant').oninput = () => { accounts = undefined; resetPayment(); sync(); };
button('readiness').onclick = () => run(async () => { capability = (await request('/api/readiness', {})).data; evidence(capability); status('公开能力、devnet 和 mint 检查通过；签名／结算仍未实测。'); });
button('configure').onclick = () => run(async () => { check(account, '请先连接钱包。'); const result = (await request('/api/configure', { payer: account.address, payTo: input('merchant').value.trim() })).data; capability = result.readiness; accounts = result.accounts; evidence(result); resetPayment(); status('双方关联账户和测试余额检查通过；收款人已锁定本次服务会话。'); const previous = sessionStorage.getItem('agentpay-devnet-order'); if (previous) { const restored = (await request(`/api/orders/${previous}`)).data as Order; showOrder(restored); submitted = restored.state !== 'quoted'; } });
function atomic(text: string) { check(/^\d+(\.\d{1,6})?$/.test(text), '金额须为非负数，最多六位小数。'); const [a,b=''] = text.split('.'); return String(BigInt(a) * 1000000n + BigInt(b.padEnd(6, '0'))); }
$('form').onsubmit = event => { event.preventDefault(); void run(async () => {
  check(account && accounts, '请先检查钱包账户。'); resetPayment();
  const requestBody = { budgetAtomic: atomic(input('budget').value), spentAtomic: atomic(input('spent').value), quoteAtomic: atomic(input('quote').value), quantity: Number(input('quantity').value) };
  order = (await request('/api/orders', { input: requestBody, payer: account.address })).data;
  check(order, '未收到订单。'); sessionStorage.setItem('agentpay-devnet-order', order.id);
  const quote = await request(`/api/orders/${order.id}/report`, requestBody);
  check(quote.response.status === 402 && quote.response.headers.has('PAYMENT-REQUIRED'), '缺少标准 x402 报价。');
  required = decodePaymentRequiredHeader(quote.response.headers.get('PAYMENT-REQUIRED')!);
  preview = { payer: account.address, payTo: accounts.payTo, payerAta: accounts.payerAta, merchantAta: accounts.merchantAta, feePayer: capability.feePayer, orderId: order.id, requestDigest: order.requestDigest, resource: `${location.origin}/api/orders/${order.id}/report`, expiresAt: order.expiresAt };
  $('preview').textContent = `网络：${NETWORK}\n资产：${MINT}\n付款方：${preview.payer}\n收款方：${preview.payTo}\n金额：0.001 测试 USDC（${PRICE} atomic）\n交易手续费由 facilitator ${preview.feePayer} 支付；不创建账户，不支付账户租金。\n有效期至：${new Date(order.expiresAt).toLocaleTimeString()}。`;
  showOrder(order); status('HTTP 402 已收到。核对预览后，可由你请求钱包签名。');
}); };
input('confirm').onchange = sync;
button('sign').onclick = () => run(async () => { check(wallet && account && required && preview && input('confirm').checked, '请先核对报价。'); signed = await signWithWallet(wallet, account, required, preview, `${location.origin}/api/rpc/${session.token}`); status('付款方签名已验证，尚未提交。只有点击“提交已签名付款”才会请求结算。'); });
button('submit').onclick = () => run(async () => {
  check(signed && preview && order && account && account.address === preview.payer && wallet?.accounts.some(a => a.address === preview!.payer) && input('confirm').checked, '签名、账户或确认已失效。');
  check(Date.now() < preview.expiresAt, '报价已过期；旧签名不会提交。');
  submitted = true; const payload = signed; signed = undefined;
  status('已发起一次结算。若响应不明，请对账同一订单，不要再次付款。');
  const response = await fetch(`/api/orders/${order.id}/report`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}`, 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) }, body: JSON.stringify(order.request) });
  const data = await response.json(); check(response.ok, `${data.error || '提交响应失败'}；请对账同一订单。`); showOrder(data);
});
button('recover').onclick = () => run(async () => { const id = sessionStorage.getItem('agentpay-devnet-order'); check(id, '当前页面没有保存的订单编号。'); const observed = input('observed').value.trim(); showOrder((await request(`/api/orders/${id}/reconcile`, observed ? { transaction: observed } : {})).data); });
button('download').onclick = () => { if (!order || order.state !== 'delivered') return; const url = URL.createObjectURL(new Blob([JSON.stringify({ evidenceType: 'devnet-confirmed-order', capability, accounts, order }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `agentpay-devnet-${order.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
registry.on('register', refresh); registry.on('unregister', () => { account = undefined; accounts = undefined; resetPayment(); refresh(); });
fetch('/api/session').then(r => r.json()).then(value => { session = value; if (value.merchant) input('merchant').value = value.merchant; refresh(); }).catch(error => status(error.message));
