import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePaymentSignatureHeader, decodePaymentRequiredHeader, decodePaymentResponseHeader } from '@x402/core/http';
import { getBase64Encoder, getBase64Decoder, getTransactionDecoder, getTransactionEncoder, getBase58Decoder } from '@solana/kit';
import { OrderStore, ReportService, SvmGateway, SolanaChainReader, NETWORK, MINT, calculateReport, svmAddress, type Order } from '../packages/solana-report/src/index.js';
import { OfflineRail, OFFLINE_PAYER, OFFLINE_MERCHANT, fixtureHeader, unsignedFixture, mockAddress } from '../packages/solana-report/src/offline.js';
import { createReportHttpServer } from '../apps/solana-demo/server.js';
import { BudgetReportClient } from '../packages/sdk/src/solana.js';

const INPUT = { budgetAtomic: '5000000', spentAtomic: '1000000', quoteAtomic: '250000', quantity: 3 };
const cleanups: Array<() => void | Promise<void>> = [];
const nativeFetch = globalThis.fetch;
beforeEach(() => {
  // Any accidental external HTTP call fails this suite, including SDK RPC calls.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'localhost') throw new Error(`External network forbidden in offline suite: ${url.hostname}`);
    return nativeFetch(input, init);
  });
});
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup(total = '10000') {
  const dir = mkdtempSync(join(tmpdir(), 'agentpay-solana-'));
  const path = join(dir, 'orders.sqlite');
  const stores: OrderStore[] = [];
  const open = () => { const store = new OrderStore(path, 'offline', total); stores.push(store); return store; };
  const store = open();
  cleanups.push(() => { for (const s of stores) s.close(); rmSync(dir, { recursive: true, force: true }); });
  const rail = new OfflineRail();
  const gateway = new SvmGateway(rail, rail, OFFLINE_MERCHANT);
  await gateway.initialize();
  let now = Date.now();
  const service = new ReportService(store, gateway, 'offline', 'http://localhost:4030', () => now);
  const order = await service.quote(INPUT, OFFLINE_PAYER);
  return { dir, path, store, open, rail, gateway, service, order, advance: (ms: number) => { now += ms; } };
}

describe('fixed-price report and durable purchase lifecycle (mock facilitator/RPC)', () => {
  it('calculates real values using integer arithmetic and rejects malformed input', async () => {
    expect(calculateReport(INPUT)).toMatchObject({ costAtomic: '750000', remainingAtomic: '3250000', affordable: true });
    expect(calculateReport({ ...INPUT, quantity: 20 })).toMatchObject({ affordable: false, remainingAtomic: '-1000000', reason: 'budget_exceeded' });
    const { service } = await setup();
    for (const input of [{ ...INPUT, quantity: 0 }, { ...INPUT, quoteAtomic: '-1' }, { ...INPUT, spentAtomic: '9999999' }, { ...INPUT, injected: true }]) {
      await expect(service.quote(input, OFFLINE_PAYER)).rejects.toThrow();
    }
    expect(svmAddress(OFFLINE_PAYER)).toBe(OFFLINE_PAYER);
    expect(() => svmAddress('0x1111')).toThrow();
  });
  it('delivers only after confirmed mock settlement; identical retry does not settle twice', async () => {
    const { service, rail, order } = await setup();
    const header = fixtureHeader(order);
    const delivered = await service.purchase(order.id, INPUT, header);
    expect(delivered).toMatchObject({ state: 'delivered', mode: 'offline', report: { remainingAtomic: '3250000' } });
    expect(delivered.resultDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(await service.purchase(order.id, INPUT, header)).toEqual(delivered);
    expect(rail.calls.settle).toBe(1);
  });
  it.each(['insufficient_funds', 'invalid_signature', 'expired_transaction'])('rejects facilitator verification failure: %s', async reason => {
    const { service, rail, order } = await setup(); rail.invalidReason = reason;
    await expect(service.purchase(order.id, INPUT, fixtureHeader(order))).rejects.toThrow('payment_invalid');
    expect(rail.calls.settle).toBe(0);
  });
  it.each(['network', 'asset', 'payTo', 'amount', 'scheme'])('rejects modified %s before verification', async field => {
    const { service, order, rail } = await setup();
    const payload = unsignedFixture(order);
    (payload.accepted as unknown as Record<string, unknown>)[field] = 'wrong';
    await expect(service.purchase(order.id, INPUT, encodePaymentSignatureHeader(payload))).rejects.toThrow('payment_requirement_mismatch');
    expect(rail.calls.verify).toBe(0);
  });
  it('rejects expired quote, tampered request, wrong resource and wrong payer', async () => {
    const { service, order, rail, advance } = await setup();
    await expect(service.purchase(order.id, { ...INPUT, quantity: 4 }, fixtureHeader(order))).rejects.toThrow('request_changed');
    const payload = unsignedFixture(order); payload.resource!.url += '/other';
    await expect(service.purchase(order.id, INPUT, encodePaymentSignatureHeader(payload))).rejects.toThrow('resource_mismatch');
    const wrongPayer = unsignedFixture({ ...order, payer: mockAddress(8) });
    await expect(service.purchase(order.id, INPUT, encodePaymentSignatureHeader(wrongPayer))).rejects.toThrow('payer_mismatch');
    advance(120001);
    await expect(service.purchase(order.id, INPUT, fixtureHeader(order))).rejects.toThrow('quote_expired');
    expect(rail.calls.settle).toBe(0);
  });
  it('binds a payment message to one order, even if fee-payer signature bytes change', async () => {
    const { service, order, rail } = await setup();
    const payload = unsignedFixture(order);
    await service.purchase(order.id, INPUT, encodePaymentSignatureHeader(payload));
    const other = await service.quote(INPUT, OFFLINE_PAYER);
    payload.resource = { url: other.resource }; payload.accepted = other.requirements;
    // The zero signature fixture is never signed. Alter the fee-payer slot to
    // exercise SDK message identity, which must ignore signature-byte changes.
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(String(payload.payload.transaction)));
    const first = Object.keys(tx.signatures)[0];
    const changed = { ...tx, signatures: { ...tx.signatures, [first]: new Uint8Array(64).fill(9) } };
    payload.payload.transaction = getBase64Decoder().decode(getTransactionEncoder().encode(changed as typeof tx));
    await expect(service.purchase(other.id, INPUT, encodePaymentSignatureHeader(payload))).rejects.toThrow('payment_memo_mismatch');
    const originalPayload = { ...payload, resource: { url: order.resource }, accepted: order.requirements };
    // Also verify the SQL uniqueness guard independently of the memo guard.
    const paymentId = (await setup()).gateway.identity(originalPayload).paymentId;
    expect(() => service.store.claim(other.id, paymentId, Date.now())).toThrow('payment_replay');
    expect(rail.calls.settle).toBe(1);
  });
  it('serializes concurrent requests across separate store connections', async () => {
    const { service, open, gateway, order, rail } = await setup();
    const other = new ReportService(open(), gateway, 'offline', 'http://localhost:4030');
    const header = fixtureHeader(order);
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? service : other).purchase(order.id, INPUT, header)));
    expect(rail.calls.settle).toBe(1);
    expect((await service.reconcile(order.id)).state).toBe('delivered');
  });
  it('keeps a settle timeout pending across restart without resubmitting', async () => {
    const { service, store, open, gateway, order, rail } = await setup(); rail.timeout = true;
    const header = fixtureHeader(order);
    expect((await service.purchase(order.id, INPUT, header)).state).toBe('pending');
    expect(store.get(order.id).report).toBeUndefined();
    store.close();
    const restarted = new ReportService(open(), gateway, 'offline', 'http://localhost:4030');
    expect((await restarted.purchase(order.id, INPUT, header)).state).toBe('pending');
    expect(rail.calls.settle).toBe(1);
    // Mock operator evidence, not a chain transaction. Only check() can confirm.
    expect((await restarted.reconcile(order.id, 'offline-observed-transaction')).state).toBe('delivered');
    expect(rail.calls.settle).toBe(1);
  });
  it('does not release a resource before confirmation and can resume after restart', async () => {
    const { service, store, open, gateway, order, rail } = await setup(); rail.visible = false;
    const pending = await service.purchase(order.id, INPUT, fixtureHeader(order));
    expect(pending.state).toBe('pending'); expect(pending.report).toBeUndefined();
    store.close();
    const restarted = new ReportService(open(), gateway, 'offline', 'http://localhost:4030');
    rail.visible = true;
    expect((await restarted.reconcile(order.id)).state).toBe('delivered');
    expect(rail.calls.settle).toBe(1);
  });
  it('fails closed after a crash between durable claim and settlement', async () => {
    const { store, open, gateway, order, rail } = await setup();
    store.claim(order.id, gateway.identity(unsignedFixture(order)).paymentId, Date.now());
    store.close();
    const restarted = new ReportService(open(), gateway, 'offline', 'http://localhost:4030');
    expect((await restarted.purchase(order.id, INPUT, fixtureHeader(order))).state).toBe('pending');
    expect(rail.calls.settle).toBe(0);
  });
  it('preserves per-payer budget across restarts and forbids mixing offline/devnet databases', async () => {
    const { service, path, open, gateway, order, rail } = await setup('1000'); rail.timeout = true;
    await service.purchase(order.id, INPUT, fixtureHeader(order));
    const restarted = new ReportService(open(), gateway, 'offline', 'http://localhost:4030');
    await expect(restarted.quote(INPUT, OFFLINE_PAYER)).rejects.toThrow('total_budget_exceeded');
    expect(() => new OrderStore(path, 'devnet')).toThrow('database_mode_mismatch');
  });
  it('does not deliver after a failed settle response or RPC exception', async () => {
    const { service, order, rail, gateway } = await setup();
    vi.spyOn(rail, 'settle').mockResolvedValue({ success: false, network: NETWORK, transaction: '', payer: OFFLINE_PAYER });
    const pending = await service.purchase(order.id, INPUT, fixtureHeader(order));
    expect(pending.state).toBe('pending'); expect(pending.report).toBeUndefined();
    vi.spyOn(gateway.chain, 'check').mockRejectedValue(new Error('RPC unavailable'));
    expect((await service.reconcile(order.id, 'operator-observed-tx')).state).toBe('pending');
  });
  it('does not let incorrect observed evidence poison a pending order', async () => {
    const { service, order, rail, gateway } = await setup(); rail.timeout = true;
    await service.purchase(order.id, INPUT, fixtureHeader(order));
    vi.spyOn(gateway.chain, 'check').mockResolvedValue({ status: 'rejected', reason: 'transfer_mismatch' });
    await expect(service.reconcile(order.id, 'incorrect-tx')).rejects.toThrow('observed_transaction_mismatch');
    expect(service.store.get(order.id).transaction).toBeUndefined();
    expect(service.store.get(order.id).state).toBe('pending');
  });
  it('recovers delivery after a crash following confirmed payment', async () => {
    const { store, open, gateway, order, rail } = await setup();
    store.claim(order.id, gateway.identity(unsignedFixture(order)).paymentId, Date.now());
    store.update(order.id, o => { o.state = 'paid'; o.transaction = 'offline-confirmed'; o.settlement = { success: true, network: NETWORK, transaction: 'offline-confirmed', payer: o.payer }; });
    store.close();
    const restarted = new ReportService(open(), gateway, 'offline', 'http://localhost:4030');
    expect((await restarted.reconcile(order.id)).state).toBe('delivered');
    expect(rail.calls.settle).toBe(0);
  });
  it('gives different offline orders stable distinct transaction names across server restart', async () => {
    const { service, order, store, open } = await setup();
    const first = await service.purchase(order.id, INPUT, fixtureHeader(order));
    store.close();
    const freshRail = new OfflineRail();
    const gateway = new SvmGateway(freshRail, freshRail, OFFLINE_MERCHANT); await gateway.initialize();
    const restarted = new ReportService(open(), gateway, 'offline', 'http://localhost:4030');
    const second = await restarted.quote(INPUT, OFFLINE_PAYER);
    const delivered = await restarted.purchase(second.id, INPUT, fixtureHeader(second));
    expect(delivered.state).toBe('delivered');
    expect(delivered.transaction).not.toBe(first.transaction);
  });
});

describe('independent Solana RPC evidence checks (injected RPC fixture)', () => {
  it('requires the matching network, transaction message, mint, owners, amount and confirmation', async () => {
    const { order, gateway } = await setup();
    const payload = unsignedFixture(order);
    order.paymentId = gateway.identity(payload).paymentId;
    const balance = (owner: string, amount: string) => ({ owner, mint: MINT, uiTokenAmount: { amount, decimals: 6 } });
    const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(String(payload.payload.transaction)));
    const first = Object.keys(decoded.signatures)[0];
    const signatureBytes = new Uint8Array(64).fill(7); // Fabricated bytes, not a signature operation.
    const txid = getBase58Decoder().decode(signatureBytes);
    const wire = getBase64Decoder().decode(getTransactionEncoder().encode({ ...decoded, signatures: { ...decoded.signatures, [first]: signatureBytes } } as typeof decoded));
    const response = { transaction: [wire, 'base64'], meta: { err: null, preTokenBalances: [balance(order.payer, '2000'), balance(OFFLINE_MERCHANT, '0')], postTokenBalances: [balance(order.payer, '1000'), balance(OFFLINE_MERCHANT, '1000')] } };
    let genesis = NETWORK.split(':')[1]; let data: unknown = response;
    const reader = new SolanaChainReader(async method => method === 'getGenesisHash' ? genesis : data);
    expect((await reader.check(order, txid)).status).toBe('confirmed');
    expect((await reader.check(order, 'wrong-signature')).reason).toBe('transaction_signature_mismatch');
    data = null; expect((await reader.check(order, txid)).status).toBe('pending'); data = response;
    genesis = 'mainnet'; expect((await reader.check(order, txid)).reason).toBe('wrong_rpc_network'); genesis = NETWORK.split(':')[1];
    for (const mutate of [
      (r: any) => { r.meta.err = { InstructionError: [0, 'failed'] }; },
      (r: any) => { r.meta.postTokenBalances[1].mint = mockAddress(9); },
      (r: any) => { r.meta.postTokenBalances[1].owner = mockAddress(9); },
      (r: any) => { r.meta.postTokenBalances[1].uiTokenAmount.amount = '999'; },
      (r: any) => { const bytes = getBase64Encoder().encode(String(unsignedFixture(order, 'other-message').payload.transaction)); const other = getTransactionDecoder().decode(bytes); r.transaction[0] = getBase64Decoder().decode(getTransactionEncoder().encode({ ...other, signatures: { ...other.signatures, [first]: signatureBytes } } as typeof other)); },
    ]) { data = structuredClone(response); mutate(data); expect((await reader.check(order, txid)).status).toBe('rejected'); }
  });
});

async function httpSetup() {
  const context = await setup();
  let origin = '';
  // Bind before requests; service origin is updated by using a stable ephemeral URL.
  const serverContext = createReportHttpServer(context.service, () => origin, true);
  await new Promise<void>((resolve, reject) => { serverContext.server.once('error', reject); serverContext.server.listen(0, 'localhost', resolve); });
  const addr = serverContext.server.address(); if (!addr || typeof addr === 'string') throw Error('no port');
  origin = `http://localhost:${addr.port}`;
  // Use the actual origin for resource URLs, preserving the same store/gateway.
  await new Promise<void>(resolve => serverContext.server.close(() => resolve()));
  const service = new ReportService(context.store, context.gateway, 'offline', origin);
  const { server, token } = createReportHttpServer(service, () => origin, true);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(addr.port, 'localhost', resolve); });
  cleanups.push(() => new Promise<void>(resolve => { server.close(resolve as () => void); server.closeAllConnections(); }));
  const post = (path: string, body: unknown, headers = {}) => fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) });
  return { ...context, service, origin, token, post };
}
describe('HTTP transport and bounded client, localhost only', () => {
  it('returns standard x402 headers, forbids foreign origin, and hides unpaid report', async () => {
    const { post, origin, token } = await httpSetup();
    const order = await (await post('/api/orders', { input: INPUT, payer: OFFLINE_PAYER })).json() as Order;
    const path = `/api/orders/${order.id}/report`;
    const quote = await post(path, INPUT);
    expect(quote.status).toBe(402);
    expect(decodePaymentRequiredHeader(quote.headers.get('PAYMENT-REQUIRED')!).accepts[0].network).toBe(NETWORK);
    const paid = await post(path, INPUT, { 'PAYMENT-SIGNATURE': fixtureHeader(order) });
    expect(paid.status).toBe(200);
    expect(decodePaymentResponseHeader(paid.headers.get('PAYMENT-RESPONSE')!).success).toBe(true);
    expect((await paid.json()).report.affordable).toBe(true);
    expect((await fetch(origin + '/api/session', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await post('/api/orders', {}, { authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await fetch(origin + `/api/orders/${order.id}`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    expect((await fetch(origin + '/')).headers.get('content-security-policy')).toContain("connect-src 'self'");
  });
  it('injects a mock payload creator and never signs twice for the same order', async () => {
    const { origin, token, service, rail } = await httpSetup();
    const createPayload = vi.fn(async required => unsignedFixture(service.store.get(required.resource.url.split('/').at(-2))));
    const client = new BudgetReportClient({ baseUrl: origin, token, payer: OFFLINE_PAYER, payTo: OFFLINE_MERCHANT, maxPerRequestAtomic: '1000', maxTotalAtomic: '1000', createPayload, fetch });
    const order = await client.quote(INPUT);
    await Promise.all([client.purchase(order), client.purchase(order)]);
    expect(createPayload).toHaveBeenCalledTimes(1); expect(rail.calls.settle).toBe(1);
    const second = await client.quote(INPUT);
    await expect(client.purchase(second)).rejects.toThrow('client_budget_exceeded');
  });
  it('a declined signer never submits payment; pending never signs again', async () => {
    const { origin, token, rail } = await httpSetup();
    const createPayload = vi.fn(async () => { throw new Error('User declined signing'); });
    const client = new BudgetReportClient({ baseUrl: origin, token, payer: OFFLINE_PAYER, payTo: OFFLINE_MERCHANT, maxPerRequestAtomic: '1000', maxTotalAtomic: '1000', createPayload, fetch });
    const order = await client.quote(INPUT);
    await expect(client.purchase(order)).rejects.toThrow('User declined signing');
    await expect(client.purchase(order)).rejects.toThrow('User declined signing');
    expect(createPayload).toHaveBeenCalledTimes(1); expect(rail.calls.settle).toBe(0);
  });
});
