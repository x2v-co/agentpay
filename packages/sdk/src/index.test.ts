import { describe, expect, it } from 'vitest';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { privateKeyToAccount } from 'viem/accounts';
import { canonicalDiscoveryKey, createAgentPay, createAiplansDiscovery, createX402PaymentSigner, joinDiscovery, signProcurementPolicy, signReservationIntent } from './index.js';
import { policyTypedData, reservationTypedData } from '@toolkit-fun/agentpay-protocol';
import { verifyTypedData } from 'viem';
import type { ProcurementPolicy, ToolkitMachineOffer } from '@toolkit-fun/agentpay-protocol';

const payTo = '0x000000000000000000000000000000000000000a' as `0x${string}`;
const offer = (overrides: Partial<ToolkitMachineOffer> = {}): ToolkitMachineOffer => ({ offerId: 'o1', providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', route: '/api/agentpay/v1/models/zhipu/GLM-4.7-Flash/invoke', payTo, maxInputTokens: 1000, maxOutputTokens: 1000, inputAtomicPerMillion: '2', outputAtomicPerMillion: '8', x402MaxAtomic: '100', rateVersion: 'v1', manifestDigest: 'sha256:x', validUntil: 4_000_000_000, fulfillment: 'machine', ...overrides });
const wallet = privateKeyToAccount('0x0123456789012345678901234567890123456789012345678901234567890123');
const policyForSigning: ProcurementPolicy = { schema: 'agentpay.policy.v1', policyId: '0x0000000000000000000000000000000000000000000000000000000000000001', owner: wallet.address, agentWallet: wallet.address, chainId: 10143, asset: '0x0000000000000000000000000000000000000004', maxTotalAtomic: '100', maxPerRequestAtomic: '100', allowedPayTo: [payTo], allowedModels: ['zhipu/GLM-4.7-Flash'], validUntil: 4_000_000_000 };

describe('AgentPay discovery', () => {
  it('provides canonical policy and reservation signing helpers', async () => {
    const policySignature = await signProcurementPolicy(policyForSigning, wallet);
    expect(await verifyTypedData({ address: wallet.address, ...({ ...policyTypedData(policyForSigning) } as any), signature: policySignature })).toBe(true);
    const intent = { policyId: policyForSigning.policyId, purchaseId: '0x' + '22'.repeat(16) as `0x${string}`, requestDigest: '0x' + '33'.repeat(32) as `0x${string}`, commerceEnvelopeDigest: '0x' + '44'.repeat(32) as `0x${string}`, maxAtomic: '100', expiresAt: 1_700_000_000 };
    const signature = await signReservationIntent(intent, wallet);
    expect(await verifyTypedData({ address: wallet.address, ...({ ...reservationTypedData(intent) } as any), signature })).toBe(true);
  });
  it('selects machine offers and rejects human checkout', () => {
    const result = joinDiscovery([{ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', currency: 'USD', unit: '1M tokens' }], [offer(), offer({ offerId: 'human', fulfillment: 'human_checkout' as never })]);
    expect(result.recommended?.offerId).toBe('o1');
    expect(result.rejected.some((x) => x.code === 'human_checkout')).toBe(true);
  });

  it('joins the live aiplans Zhipu aliases without treating reseller USD as Zhipu', () => {
    expect(canonicalDiscoveryKey('zhipu-china', 'glm-4.7-flash')).toBe('zhipu/GLM-4.7-Flash');
    const result = joinDiscovery([
      { providerSlug: 'zhipu-china', modelSlug: 'glm-4.7-flash', currency: 'CNY', unit: 'per_1m_tokens' },
      { providerSlug: 'openrouter', modelSlug: 'glm-4.7-flash', currency: 'USD', unit: 'per_1m_tokens' },
    ], [offer()], { policy: policyForSigning });
    expect(result.recommended?.offerId).toBe('o1');
    expect(result.rejected).toHaveLength(0);
  });
  it('fails closed on duplicate model mappings and unsupported currency', () => {
    const result = joinDiscovery([{ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', currency: 'CNY', unit: '1M tokens' }], [offer(), offer({ offerId: 'o2' })]);
    expect(result.recommended).toBeUndefined();
    expect(result.rejected.filter((x) => x.code === 'invalid_price_currency' || x.code === 'ambiguous_mapping')).toHaveLength(2);
  });
  it('does not treat object prototype names as provider aliases', () => {
    const result = joinDiscovery([{ providerSlug: 'toString', modelSlug: 'glm-4.7-flash', currency: 'CNY', unit: 'per_1m_tokens' }], [offer()]);
    expect(result.recommended).toBeUndefined();
    expect(result.rejected[0].code).toBe('unmapped_model');
  });
  it('rejects unsupported pricing unit', () => {
    const result = joinDiscovery([{ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', currency: 'USD', unit: 'per request' }], [offer()]);
    expect(result.recommended).toBeUndefined();
    expect(result.rejected[0].code).toBe('invalid_price_unit');
  });

  it('runs the bounded purchase loop with a quote, reservation, and payment retry', async () => {
    const selected = offer({ x402MaxAtomic: '100' });
    const calls: Array<{ url: string; payment: string; body: any }> = [];
    const fetcher = async (url: string, init: RequestInit = {}) => {
      calls.push({ url, payment: String((init.headers as Record<string, string> | undefined)?.['payment-signature'] || ''), body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('/reservations')) return new Response(JSON.stringify({ reservationReceipt: { reservationId: 'r1' } }), { status: 200 });
      if (!calls.at(-1)?.payment) return new Response(JSON.stringify({ status: 402, code: 'settlement_pending' }), { status: 402 });
      return new Response(JSON.stringify({ purchaseId: 'p1', receipt: { status: 'paid' } }), { status: 200 });
    };
    const client = createAgentPay({
      policy: { schema: 'agentpay.policy.v1', policyId: '0x0000000000000000000000000000000000000000000000000000000000000001', owner: '0x0000000000000000000000000000000000000002', agentWallet: '0x0000000000000000000000000000000000000003', chainId: 10143, asset: '0x0000000000000000000000000000000000000004', maxTotalAtomic: '100', maxPerRequestAtomic: '100', allowedPayTo: [payTo], allowedModels: ['zhipu/GLM-4.7-Flash'], validUntil: 4_000_000_000 },
      discovery: { listModels: async () => [{ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', currency: 'USD', unit: '1M tokens' }], listOffers: async () => [selected] },
      fetch: fetcher as typeof fetch,
      baseUrl: 'http://demo.test',
    });
    const result = await client.buy({ body: { prompt: 'hello' }, inputTokens: 10, outputCap: 10, policyId: '0x1', purchaseId: 'p1' });
    expect(result.purchaseId).toBe('p1');
    expect(result.status).toBe('matched');
    expect(calls.filter((call) => call.url.includes('/invoke'))).toHaveLength(2);
    expect(calls.at(-1)?.payment).toBe('demo-payment-signature');
    expect(calls.find((call) => call.url.includes('/reservations'))?.body.intent).toBeUndefined();
  });

  it('returns an explicit pending result for 202 and can poll reconciliation to matched', async () => {
    const selected = offer({ x402MaxAtomic: '100' });
    let reconciliationCalls = 0;
    const client = createAgentPay({
      policy: policyForSigning,
      discovery: { listModels: async () => [{ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', currency: 'USD', unit: '1M tokens' }], listOffers: async () => [selected] },
      fetch: (async (url: string, init: RequestInit = {}) => {
        if (url.includes('/reservations')) return new Response(JSON.stringify({ reservationReceipt: { reservationId: 'r1' }, progressToken: 'progress-1' }), { status: 200 });
        if (url.includes('/reconciliation')) {
          reconciliationCalls += 1;
          expect(new Headers(init.headers).get('authorization')).toBe('Bearer progress-1');
          return new Response(JSON.stringify({ purchaseId: 'p2', state: reconciliationCalls === 1 ? 'settlement_unknown' : 'matched' }), { status: 200 });
        }
        if (!new Headers(init.headers).get('payment-signature')) return new Response(JSON.stringify({ status: 402 }), { status: 402 });
        return new Response(JSON.stringify({ purchaseId: 'p2', state: 'settlement_unknown', nextAction: 'continue_reconciliation' }), { status: 202 });
      }) as typeof fetch,
      baseUrl: 'http://demo.test',
    });
    const pending = await client.buy({ body: { prompt: 'hello' }, inputTokens: 1, outputCap: 1, policyId: policyForSigning.policyId, purchaseId: 'p2' });
    expect(pending.status).toBe('pending');
    expect((pending as any).pending.nextAction).toBe('continue_reconciliation');
    const matched = await client.waitForSettlement({ purchaseId: 'p2', progressToken: 'progress-1', timeoutMs: 100, pollIntervalMs: 10 });
    expect(matched.status).toBe('matched');
    expect(reconciliationCalls).toBe(2);
  });

  it('binds request digests to the complete provider body', () => {
    const client = createAgentPay({ policy: policyForSigning, discovery: { listModels: async () => [], listOffers: async () => [] } });
    const first = client.preflight(offer(), 10, 20, { prompt: 'a' });
    const second = client.preflight(offer(), 10, 20, { prompt: 'b' });
    expect(first.requestDigest).not.toBe(second.requestDigest);
  });

  it('rejects an explicit offer that discovery did not approve', async () => {
    const client = createAgentPay({
      policy: policyForSigning,
      discovery: { listModels: async () => [{ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', currency: 'USD', unit: '1M tokens' }], listOffers: async () => [offer()] },
      fetch: (async () => new Response('{}', { status: 500 })) as typeof fetch,
      baseUrl: 'http://demo.test',
    });
    await expect(client.buy({ body: { prompt: 'hello' }, inputTokens: 1, outputCap: 1, policyId: policyForSigning.policyId, offer: offer({ offerId: 'unlisted' }) })).rejects.toMatchObject({ problem: { code: 'no_eligible_offer' } });
  });

  it('sends a UUID-bound reservation intent when the wallet signer is provided', async () => {
    const bodies: any[] = [];
    const client = createAgentPay({
      policy: { schema: 'agentpay.policy.v1', policyId: '0x0000000000000000000000000000000000000000000000000000000000000001', owner: '0x0000000000000000000000000000000000000002', agentWallet: '0x0000000000000000000000000000000000000003', chainId: 10143, asset: '0x0000000000000000000000000000000000000004', maxTotalAtomic: '100', maxPerRequestAtomic: '100', allowedPayTo: [payTo], allowedModels: ['zhipu/GLM-4.7-Flash'], validUntil: 4_000_000_000 },
      policySignature: '0xpolicy-signature',
      discovery: { listModels: async () => [{ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', currency: 'USD', unit: '1M tokens' }], listOffers: async () => [offer()] },
      fetch: async (url, init = {}) => {
        if (String(url).includes('/reservations')) { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ reservationReceipt: { reservationId: 'r1' } }), { status: 200 }); }
        if (!bodies.length || !String((init.headers as Record<string, string> | undefined)?.['payment-signature'] || '')) return new Response(JSON.stringify({}), { status: 402 });
        return new Response(JSON.stringify({ purchaseId: '550e8400-e29b-41d4-a716-446655440000' }), { status: 200 });
      },
      baseUrl: 'http://demo.test',
    });
    await client.buy({ body: { prompt: 'hello' }, inputTokens: 1, outputCap: 1, policyId: '0x0000000000000000000000000000000000000000000000000000000000000001', purchaseId: '550e8400-e29b-41d4-a716-446655440000', signReservation: async (intent) => { expect(intent.purchaseId).toMatch(/^0x[0-9a-f]{32}$/); return '0xreservation-signature'; } });
    expect(bodies[0].intent).toMatchObject({ maxAtomic: '100', requestDigest: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    expect(bodies[0].signature).toBe('0xreservation-signature');
    expect(bodies[0].policySignature).toBe('0xpolicy-signature');
  });

  it('adapts grouped aiplans data and caches it for the freshness window', async () => {
    let calls = 0;
    const discovery = createAiplansDiscovery({ baseUrl: 'https://plans.test', cacheMs: 60_000, fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify([{ id: 7, slug: 'GLM-4.7-Flash', versions: [{ input_price_per_1m: 2, output_price_per_1m: 8, currency: 'USD', price_unit: '1M tokens', providers: { slug: 'zhipu' } }] }]));
    } });
    const first = await discovery.listModels();
    const second = await discovery.listModels();
    expect(first[0]).toMatchObject({ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', productId: 7 });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  it('fails closed when aiplans is unavailable or malformed', async () => {
    const unavailable = createAiplansDiscovery({ fetch: async () => new Response('down', { status: 503 }) });
    await expect(unavailable.listModels()).rejects.toMatchObject({ problem: { code: 'readiness_unavailable' } });
    const malformed = createAiplansDiscovery({ fetch: async () => new Response(JSON.stringify({ products: [] })) });
    await expect(malformed.listModels()).rejects.toMatchObject({ problem: { code: 'readiness_incompatible' } });
  });

  it('reads a model channel detail endpoint with the same normalized record shape', async () => {
    const discovery = createAiplansDiscovery({ baseUrl: 'https://plans.test', fetch: async (url) => {
      if (String(url).includes('/channels/7')) return new Response(JSON.stringify([{ input_price_per_1m: 1, output_price_per_1m: 2, currency: 'USD', price_unit: 'per_1m_tokens', providers: { slug: 'zhipu' }, models: { slug: 'GLM-4.7-Flash' } }]));
      return new Response(JSON.stringify([]));
    } });
    await expect(discovery.listChannels(7)).resolves.toMatchObject([{ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', productId: 7 }]);
  });

  it('recovers a lost progress token with one purchase-scoped SIWX challenge', async () => {
    const calls: RequestInit[] = [];
    const client = createAgentPay({
      policy: { schema: 'agentpay.policy.v1', policyId: '0x0000000000000000000000000000000000000000000000000000000000000001', owner: '0x0000000000000000000000000000000000000002', agentWallet: '0x0000000000000000000000000000000000000003', chainId: 10143, asset: '0x0000000000000000000000000000000000000004', maxTotalAtomic: '100', maxPerRequestAtomic: '100', allowedPayTo: [payTo], allowedModels: ['zhipu/GLM-4.7-Flash'], validUntil: 4_000_000_000 },
      discovery: { listModels: async () => [], listOffers: async () => [] },
      fetch: async (_url, init = {}) => {
        calls.push(init);
        if (calls.length === 1) return new Response(JSON.stringify({ extensions: { 'sign-in-with-x': { info: { domain: 'demo.test', uri: 'http://demo.test/result', statement: 'Recover', version: '1', nonce: 'nonce0001', issuedAt: new Date().toISOString() }, supportedChains: [{ chainId: 'eip155:10143', type: 'eip191' }] } } }), { status: 402 });
        return new Response('ok', { status: 200 });
      },
      baseUrl: 'http://demo.test',
    });
    const response = await client.recoverAccess({ url: 'http://demo.test/result', signer: { address: '0x0000000000000000000000000000000000000003', signMessage: async () => '0xsignature' } });
    expect(response.status).toBe(200);
    expect(new Headers(calls[1].headers).get('sign-in-with-x')).toBeTruthy();
  });

  it('creates a standard Permit2 upto payment header from a quote', async () => {
    const signer = await createX402PaymentSigner({ signer: privateKeyToAccount('0x0123456789012345678901234567890123456789012345678901234567890123') });
    const header = await signer({ x402Version: 2, accepts: [{ scheme: 'upto', network: 'eip155:10143', asset: '0x534b2f3A21130d7a60830c2Df862319e593943A3', amount: '100', payTo, maxTimeoutSeconds: 60, extra: { assetTransferMethod: 'permit2', facilitatorAddress: '0x3333333333333333333333333333333333333333' } }] });
    const payload = decodePaymentSignatureHeader(header);
    expect(payload.x402Version).toBe(2);
    expect((payload.payload as any).permit2Authorization.permitted.amount).toBe('100');
    expect((payload.payload as any).permit2Authorization.witness.facilitator).toBe('0x3333333333333333333333333333333333333333');
  });
});
