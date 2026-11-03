import { orderMemo } from '../packages/solana-report/src/memo.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBase64Encoder, getTransactionDecoder, getTransactionEncoder } from '@solana/kit';
import { publicReadiness, walletReadiness, publicRpc, associatedTokenAddress } from '../packages/solana-report/src/readiness.js';
import { GENESIS, NETWORK, MINT, TOKEN_PROGRAM, PRICE } from '../packages/solana-report/src/constants.js';
import { OfflineRail, OFFLINE_PAYER, OFFLINE_MERCHANT, OFFLINE_FEE_PAYER, mockAddress, unsignedFixture } from '../packages/solana-report/src/offline.js';
import { OrderStore, ReportService, SvmGateway } from '../packages/solana-report/src/index.js';
import { validateQuote, validatePreparedTransaction, verifyWalletOutput, compatible, type StandardWallet } from '../apps/solana-demo/wallet-adapter.js';
import { createHandoffServer } from '../apps/solana-demo/handoff.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); vi.restoreAllMocks(); });
const supported = { kinds: [{ x402Version: 2, scheme: 'exact', network: NETWORK, extra: { feePayer: OFFLINE_FEE_PAYER, transactionVersions: [0] } }], signers: { 'solana:*': [OFFLINE_FEE_PAYER] } };
const mintAccount = { value: { owner: TOKEN_PROGRAM, data: { parsed: { type: 'mint', info: { decimals: 6, isInitialized: true } } } } };
const tokenAccount = (owner: string, amount = '1000') => ({ value: { owner: TOKEN_PROGRAM, data: { parsed: { type: 'account', info: { owner, mint: MINT, state: 'initialized', tokenAmount: { decimals: 6, amount } } } } } });
const metadataFetch = vi.fn(async () => Response.json(supported)) as unknown as typeof fetch;
async function fixtures() {
  const payerAta = await associatedTokenAddress(OFFLINE_PAYER), merchantAta = await associatedTokenAddress(OFFLINE_MERCHANT);
  const rpc = vi.fn(async (method: string, params: unknown[]) => {
    if (method === 'getGenesisHash') return GENESIS;
    if (method === 'getBalance') return { value: 10000000 };
    if (method === 'getAccountInfo') return params[0] === MINT ? mintAccount : params[0] === payerAta ? tokenAccount(OFFLINE_PAYER) : params[0] === merchantAta ? tokenAccount(OFFLINE_MERCHANT) : { value: null };
    throw Error('Unexpected RPC method');
  });
  return { rpc, payerAta, merchantAta };
}
describe('public devnet readiness, mocked transports only', () => {
  it('checks supported capability, full genesis, mint and fee-payer balance', async () => {
    const { rpc } = await fixtures();
    expect(await publicReadiness(rpc, metadataFetch)).toMatchObject({ ok: true, network: NETWORK, decimals: 6, amountAtomic: PRICE });
    const wrongRpc = async (m: string, p: unknown[]) => m === 'getGenesisHash' ? GENESIS.slice(0, 32) : rpc(m, p);
    await expect(publicReadiness(wrongRpc, metadataFetch)).rejects.toThrow('wrong_rpc_network');
  });
  it('fails closed for unsupported transaction versions and uninitialized mint', async () => {
    const { rpc } = await fixtures();
    const unsupported = structuredClone(supported); unsupported.kinds[0].extra.transactionVersions = [1];
    await expect(publicReadiness(rpc, (async () => Response.json(unsupported)) as typeof fetch)).rejects.toThrow('facilitator_v0_not_supported');
    const badMint = async (m: string, p: unknown[]) => m === 'getAccountInfo' ? { value: null } : rpc(m, p);
    await expect(publicReadiness(badMint, metadataFetch)).rejects.toThrow('mint_not_ready');
  });
  it('requires existing initialized ATAs and sufficient test balance', async () => {
    const { rpc, payerAta, merchantAta } = await fixtures();
    expect(await walletReadiness(rpc, OFFLINE_PAYER, OFFLINE_MERCHANT)).toMatchObject({ ok: true, payerAta, merchantAta });
    await expect(walletReadiness(async () => ({ value: null }), OFFLINE_PAYER, OFFLINE_MERCHANT)).rejects.toThrow('payer_token_account_missing');
    const low = async (m: string, p: unknown[]) => p[0] === payerAta ? tokenAccount(OFFLINE_PAYER, '999') : rpc(m, p);
    await expect(walletReadiness(low, OFFLINE_PAYER, OFFLINE_MERCHANT)).rejects.toThrow('insufficient_test_usdc');
    await expect(walletReadiness(rpc, OFFLINE_PAYER, OFFLINE_PAYER)).rejects.toThrow('payer_is_merchant');
  });
  it('never forwards broadcast or faucet methods', async () => {
    const transport = vi.fn(); const rpc = publicRpc(transport as typeof fetch);
    for (const method of ['sendTransaction', 'requestAirdrop', 'simulateTransaction']) await expect(rpc(method, [])).rejects.toThrow('rpc_method_not_allowed');
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('browser wallet boundary without any signature operation', () => {
  async function setup() {
    const store = new OrderStore(':memory:', 'offline'); cleanups.push(() => store.close());
    const rail = new OfflineRail(); const gateway = new SvmGateway(rail, rail, OFFLINE_MERCHANT); await gateway.initialize();
    const service = new ReportService(store, gateway, 'offline', 'http://localhost:4031');
    const order = await service.quote({ budgetAtomic: '5000000', spentAtomic: '0', quoteAtomic: '100', quantity: 2 }, OFFLINE_PAYER);
    const preview = { payer: OFFLINE_PAYER, payTo: OFFLINE_MERCHANT, payerAta: mockAddress(4), merchantAta: mockAddress(5), feePayer: OFFLINE_FEE_PAYER, orderId: order.id, requestDigest: order.requestDigest, resource: order.resource, expiresAt: order.expiresAt };
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(String(unsignedFixture(order).payload.transaction)));
    return { order, preview, tx, required: service.required(order) };
  }
  it('checks the exact preview and rejects amount, network, recipient, memo or fee payer changes', async () => {
    const { required, preview } = await setup();
    await expect(validateQuote(required, preview)).resolves.toBeUndefined();
    for (const change of [{ amount: '1001' }, { network: 'solana:mainnet' }, { payTo: mockAddress(7) }, { extra: { ...required.accepts[0].extra, memo: 'changed' } }, { extra: { ...required.accepts[0].extra, feePayer: preview.payer } }]) {
      const altered = structuredClone(required); Object.assign(altered.accepts[0], change);
      await expect(validateQuote(altered, preview)).rejects.toThrow();
    }
    await expect(validateQuote(required, { ...preview, expiresAt: 0 })).rejects.toThrow();
  });
  it('inspects the actual unsigned transaction before any wallet interaction', async () => {
    const { tx, preview } = await setup();
    await expect(validatePreparedTransaction(tx, preview)).resolves.toBeUndefined();
    for (const change of [{ payer: mockAddress(9) }, { merchantAta: mockAddress(9) }, { feePayer: preview.payer }, { requestDigest: 'wrong' }]) {
      await expect(validatePreparedTransaction(tx, { ...preview, ...change })).rejects.toThrow();
    }
  });
  it('rejects unsigned wallet output and a wallet-modified transaction', async () => {
    const { tx, preview } = await setup();
    await expect(verifyWalletOutput(tx, new Uint8Array(getTransactionEncoder().encode(tx)), preview.payer)).rejects.toThrow();
    const other = await setup();
    await expect(verifyWalletOutput(tx, new Uint8Array(getTransactionEncoder().encode(other.tx)), preview.payer)).rejects.toThrow('钱包更改了交易内容');
  });
  it('does not accept a wallet that can only sign-and-send or only supports mainnet', () => {
    const base = { chains: ['solana:devnet'], features: { 'standard:connect': {}, 'solana:signTransaction': { supportedTransactionVersions: [0] } } } as unknown as StandardWallet;
    expect(compatible(base)).toBe(true);
    expect(compatible({ ...base, chains: ['solana:mainnet'] })).toBeFalsy();
    expect(compatible({ ...base, features: { 'standard:connect': {}, 'solana:signAndSendTransaction': {} } })).toBeFalsy();
  });
});

describe('local handoff server; all external services mocked', () => {
  it('can configure public accounts without settlement and rejects a broadcasting RPC request', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'agentpay-handoff-')); cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const { rpc } = await fixtures(); const rail = new OfflineRail(); let origin = '';
    const { server, token } = createHandoffServer({ origin: () => origin, dbPath: join(directory, 'devnet.sqlite'), rpc, fetcher: metadataFetch, gatewayFactory: payTo => new SvmGateway(rail, rail, payTo) });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, 'localhost', resolve); });
    const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('no port'); origin = `http://localhost:${addr.port}`;
    cleanups.push(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
    const post = (path: string, body: unknown, auth = true) => fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    expect((await post('/api/configure', { payer: OFFLINE_PAYER, payTo: OFFLINE_MERCHANT })).status).toBe(200);
    expect(rail.calls).toEqual({ verify: 0, settle: 0, check: 0 });
    expect((await post(`/api/rpc/${token}`, { method: 'sendTransaction', params: ['no-tx'] }, false)).status).toBe(403);
    expect((await post('/api/configure', { payer: OFFLINE_PAYER, payTo: mockAddress(8) })).status).toBe(409);
    expect((await fetch(origin + '/api/session', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await post('/api/readiness', {}, false)).status).toBe(401);
    expect((await fetch(origin + '/')).status).toBe(200);
  });
});

// Regression for the real SDK's 20,000 CU limit: the former 110-byte memo exhausted it.
describe('compact order memo', () => {
  it('keeps all 256 hash bits, fits 46 bytes and binds both order and request', async () => {
    const id = '2aa3140c-c529-452e-9bc9-7b7c744c0583';
    const digest = '535811329224289115595e06380039ba287e59e622b158a86013fd4531acc784';
    const memo = await orderMemo(id, digest);
    expect(memo).toBe('ap:RdArdbz5JkYXYGdc3BNmRx8cNpmW2v1D4R6ssLG0Lls');
    expect(new TextEncoder().encode(memo)).toHaveLength(46);
    expect(Buffer.from(memo.slice(3), 'base64url')).toHaveLength(32);
    expect(await orderMemo(id + 'x', digest)).not.toBe(memo);
    expect(await orderMemo(id, digest + 'x')).not.toBe(memo);
  });
});
