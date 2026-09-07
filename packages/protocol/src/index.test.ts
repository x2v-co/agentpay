import { describe, expect, it } from 'vitest';
import { agentPayActionFor, assertProblem, buildCommerceEnvelope, calculateChargeAtomic, commerceEnvelopeDigest, digest, digestToBytes32, normalizePolicy, policyDigest, policyListHashes, policyTypedData, reservationTypedData, revocationTypedData, uuidToBytes } from './index.js';

describe('AgentPay protocol', () => {
  it('converts readable sha256 digests to EIP-712 bytes32', () => {
    expect(digestToBytes32(`sha256:${'ab'.repeat(32)}`)).toBe(`0x${'ab'.repeat(32)}`);
    expect(() => digestToBytes32('sha256:not-hex')).toThrow();
  });
  it('calculates integer token charges with one ceiling', () => {
    expect(calculateChargeAtomic(1_000_001n, 2_000_000n, 2n, 8n)).toBe(19n);
  });
  it('normalizes policy limits and stable arrays', () => {
    const policy = normalizePolicy({ schema: 'agentpay.policy.v1', policyId: '0x0000000000000000000000000000000000000000000000000000000000000001', owner: '0x0000000000000000000000000000000000000002', agentWallet: '0x0000000000000000000000000000000000000003', chainId: 10143, asset: '0x0000000000000000000000000000000000000004', maxTotalAtomic: '100', maxPerRequestAtomic: '50', allowedPayTo: ['0x000000000000000000000000000000000000000b', '0x000000000000000000000000000000000000000a'], allowedModels: ['zhipu/GLM-4.7-Flash', 'a/model'], validUntil: 2 });
    expect(policy.allowedPayTo).toEqual(['0x000000000000000000000000000000000000000a', '0x000000000000000000000000000000000000000b']);
    expect(policy.allowedModels).toEqual(['a/model', 'zhipu/GLM-4.7-Flash']);
  });
  it('rejects an invalid error action and maps terminal errors to stop', () => {
    expect(agentPayActionFor('execution_unknown')).toBe('stop');
    expect(() => assertProblem({ type: 'https://toolkit.fun/problems/agentpay/x', title: 'x', status: 500, code: 'execution_unknown', phase: 'execution', retryable: false, nextAction: 'retry_same_purchase' })).toThrow(/action/);
    expect(() => assertProblem({ type: 'https://toolkit.fun/problems/agentpay/x', title: 'x', status: 500, code: 'future_code', phase: 'execution', retryable: false, nextAction: 'stop' })).toThrow(/unknown/);
    expect(() => assertProblem({ type: 'https://toolkit.fun/problems/agentpay/x', title: 'x', status: 500, code: 'execution_unknown', phase: 'future_phase', retryable: false, nextAction: 'stop' })).toThrow(/phase/);
  });
  it('keeps UUID conversion and digest deterministic', () => {
    expect(uuidToBytes('018f1f34-2b83-7e44-9f3b-123456789abc')).toBe('0x018f1f342b837e449f3b123456789abc');
    expect(digest({ b: 2, a: 1 })).toBe(digest({ a: 1, b: 2 }));
  });
  it('produces stable policy list hashes and EIP-712 digest', () => {
    const policy = { schema: 'agentpay.policy.v1' as const, policyId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`, owner: '0x0000000000000000000000000000000000000002' as `0x${string}`, agentWallet: '0x0000000000000000000000000000000000000003' as `0x${string}`, chainId: 10143, asset: '0x0000000000000000000000000000000000000004' as `0x${string}`, maxTotalAtomic: '100', maxPerRequestAtomic: '50', allowedPayTo: ['0x000000000000000000000000000000000000000a' as `0x${string}`], allowedModels: ['zhipu/GLM-4.7-Flash'], validUntil: 4_000_000_000 };
    expect(policyListHashes(policy).allowedPayToHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(policyTypedData(policy).message.allowedModelsHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(policyDigest(policy)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(reservationTypedData({ policyId: policy.policyId, purchaseId: '0x' + '22'.repeat(16) as `0x${string}`, requestDigest: '0x' + '33'.repeat(32) as `0x${string}`, commerceEnvelopeDigest: '0x' + '44'.repeat(32) as `0x${string}`, maxAtomic: '100', expiresAt: 1700000000 }).message.maxAtomic).toBe(100n);
    expect(revocationTypedData({ policyId: policy.policyId, owner: policy.owner, chainId: 10143, revokedAt: 1700000000 }).message.revokedAt).toBe(1700000000n);
  });
  it('binds request, offer, model and rate in a commerce envelope', () => {
    const envelope = buildCommerceEnvelope({ providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash', offerId: 'o1', resource: '/invoke', rateVersion: 'v1', inputAtomicPerMillion: '2', outputAtomicPerMillion: '8', maxInputTokens: 100, maxOutputTokens: 100, manifestDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000', requestDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000', x402OfferDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000', payTo: '0x000000000000000000000000000000000000000a', validUntil: 4000000000 });
    expect(envelope.model).toBe('zhipu/GLM-4.7-Flash');
    expect(commerceEnvelopeDigest(envelope)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
