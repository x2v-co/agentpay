import crypto from 'node:crypto';
import { createSIWxPayload, encodeSIWxHeader } from '@x402/extensions/sign-in-with-x';
import {
  agentPayActionFor, calculateChargeAtomic, digest, digestToBytes32, normalizePolicy, policyTypedData, problem,
  reservationTypedData, uuidToBytes, AgentPayProblemError, type AgentPayProblem, type ProcurementPolicy, type ReservationIntent, type ToolkitMachineOffer,
} from '@toolkit-fun/agentpay-protocol';

export type AiplansRecord = { providerSlug: string; modelSlug: string; productId?: string | number; inputPrice?: string | number; outputPrice?: string | number; currency?: string; unit?: string; fulfillment?: string; freshness?: 'fresh' | 'stale' | 'unavailable' };
export type DiscoverySource = { listModels(): Promise<AiplansRecord[]>; listOffers(): Promise<ToolkitMachineOffer[]> };
export type DiscoveryChoice = { recommended?: ToolkitMachineOffer; candidates: ToolkitMachineOffer[]; rejected: Array<{ offerId?: string; code: string; detail: string }> };
export type AgentPayRecoverySigner = { address?: string; account?: { address: string }; signMessage: (input: { message: string; account?: unknown }) => Promise<string> | string };
export type AgentPayTypedDataSigner = { signTypedData: (input: any) => Promise<string> | string };
export type AgentPayPending = { purchaseId: string; state?: string; reconciliation?: string; code?: string; nextAction: 'continue_reconciliation'; [key: string]: unknown };

/** Explicit upstream catalog aliases used during discovery joins. */
export const AIPLANS_CANONICAL_ALIASES = Object.freeze({
  providers: Object.freeze({ 'zhipu-china': 'zhipu', 'zhipu-global': 'zhipu' }),
  models: Object.freeze({ 'glm-4.7-flash': 'GLM-4.7-Flash' }),
});

function canonicalDiscoveryPart(value: string, aliases: Record<string, string>) {
  const normalized = String(value || '').trim();
  const aliasKey = normalized.toLowerCase();
  return Object.hasOwn(aliases, aliasKey) ? aliases[aliasKey] : normalized;
}

function isRegionalProviderAlias(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.hasOwn(AIPLANS_CANONICAL_ALIASES.providers, normalized);
}

/** Return the auditable provider/model identity used to join aiplans and offers. */
export function canonicalDiscoveryKey(providerSlug: string, modelSlug: string) {
  return `${canonicalDiscoveryPart(providerSlug, AIPLANS_CANONICAL_ALIASES.providers)}/${canonicalDiscoveryPart(modelSlug, AIPLANS_CANONICAL_ALIASES.models)}`;
}

function policyAllowsModel(policy: ProcurementPolicy, key: string) {
  return policy.allowedModels.some((model) => {
    const [provider, ...modelParts] = model.split('/');
    return modelParts.length > 0 && canonicalDiscoveryKey(provider, modelParts.join('/')) === key;
  });
}

/** Sign the canonical owner policy envelope used by the reservation route. */
export async function signProcurementPolicy(policy: ProcurementPolicy, signer: AgentPayTypedDataSigner) {
  return signer.signTypedData(policyTypedData(normalizePolicy(policy)) as any);
}

/** Sign the canonical agent-wallet reservation intent before payment authorization. */
export async function signReservationIntent(intent: ReservationIntent, signer: AgentPayTypedDataSigner) {
  return signer.signTypedData(reservationTypedData(intent) as any);
}

/** Build an x402 v2 fetch client using the official upto/Permit2 implementation. */
export async function createX402Fetch(input: { signer: unknown; fetch?: typeof fetch; rpcUrl?: string }) {
  const [{ x402Client, wrapFetchWithPayment }, { UptoEvmScheme }] = await Promise.all([import('@x402/fetch'), import('@x402/evm')]);
  const client = new x402Client().register('eip155:10143', new UptoEvmScheme(input.signer as any, input.rpcUrl ? { rpcUrl: input.rpcUrl } : undefined));
  return wrapFetchWithPayment(input.fetch || fetch, client);
}

/** Create the SDK callback that turns a 402 quote into a standard payment header. */
export async function createX402PaymentSigner(input: { signer: unknown; rpcUrl?: string }) {
  const [{ UptoEvmScheme }, { encodePaymentSignatureHeader }] = await Promise.all([import('@x402/evm'), import('@x402/core/http')]);
  const scheme = new UptoEvmScheme(input.signer as any, input.rpcUrl ? { rpcUrl: input.rpcUrl } : undefined);
  return async (quote: any) => {
    const requirements = quote?.accepts?.[0] || quote?.paymentRequirements?.[0];
    if (!requirements) throw new Error('x402 quote does not contain payment requirements');
    const result = await scheme.createPaymentPayload(Number(quote.x402Version || 2), requirements, quote.extensions ? { extensions: quote.extensions } as any : undefined);
    return encodePaymentSignatureHeader({ x402Version: result.x402Version, accepted: requirements, payload: result.payload, ...(result.extensions ? { extensions: result.extensions } : {}) } as any);
  };
}

export function joinDiscovery(models: AiplansRecord[], offers: ToolkitMachineOffer[], options: { policy?: ProcurementPolicy } = {}): DiscoveryChoice {
  const rejected: DiscoveryChoice['rejected'] = [];
  const eligible: ToolkitMachineOffer[] = [];
  const seen = new Map<string, ToolkitMachineOffer>();
  for (const offer of offers) {
    const key = canonicalDiscoveryKey(offer.providerSlug, offer.modelSlug);
    if (offer.validUntil <= Math.floor(Date.now() / 1000)) { rejected.push({ offerId: offer.offerId, code: 'offer_expired', detail: 'offer validity has elapsed' }); continue; }
    if (offer.fulfillment !== 'machine') { rejected.push({ offerId: offer.offerId, code: 'human_checkout', detail: 'route is not machine fulfillable' }); continue; }
    const modelRows = models.filter((m) => canonicalDiscoveryKey(m.providerSlug, m.modelSlug) === key);
    if (!modelRows.length) { rejected.push({ offerId: offer.offerId, code: 'unmapped_model', detail: 'aiplans mapping is not unique' }); continue; }
    // Prefer USD rows. A regional producer may only publish a CNY catalog row
    // (while a different reseller publishes USD); an explicit provider alias
    // can prove model existence, but its CNY numbers never set the x402 rate.
    const usdRows = modelRows.filter((m) => !m.currency || m.currency === 'USD');
    const regionalRows = modelRows.filter((m) => isRegionalProviderAlias(m.providerSlug) && m.currency === 'CNY');
    const usableRows = usdRows.length ? usdRows : regionalRows;
    if (!usableRows.length) { rejected.push({ offerId: offer.offerId, code: 'invalid_price_currency', detail: `unsupported currency ${modelRows[0].currency}` }); continue; }
    if (usableRows.length !== 1) { rejected.push({ offerId: offer.offerId, code: 'ambiguous_mapping', detail: 'aiplans mapping is not unique' }); continue; }
    const row = usableRows[0];
    if (options.policy && !policyAllowsModel(options.policy, key)) { rejected.push({ offerId: offer.offerId, code: 'policy_invalid', detail: 'model is outside owner policy' }); continue; }
    if (options.policy && !options.policy.allowedPayTo.map((value) => value.toLowerCase()).includes(offer.payTo.toLowerCase())) { rejected.push({ offerId: offer.offerId, code: 'policy_invalid', detail: 'merchant is outside owner policy' }); continue; }
    if (options.policy && BigInt(offer.x402MaxAtomic) > BigInt(options.policy.maxPerRequestAtomic)) { rejected.push({ offerId: offer.offerId, code: 'price_exceeds_policy', detail: 'offer ceiling exceeds owner policy' }); continue; }
    if (row.currency && row.currency !== 'USD' && !(row.currency === 'CNY' && isRegionalProviderAlias(row.providerSlug))) { rejected.push({ offerId: offer.offerId, code: 'invalid_price_currency', detail: `unsupported currency ${row.currency}` }); continue; }
    if (row.unit && !/1m[_ -]?tokens?/i.test(row.unit)) { rejected.push({ offerId: offer.offerId, code: 'invalid_price_unit', detail: `unsupported unit ${row.unit}` }); continue; }
    if (seen.has(key)) { rejected.push({ offerId: offer.offerId, code: 'ambiguous_mapping', detail: 'multiple Toolkit offers map to one model' }); continue; }
    seen.set(key, offer); eligible.push(offer);
  }
  eligible.sort((a, b) => BigInt(a.x402MaxAtomic) < BigInt(b.x402MaxAtomic) ? -1 : BigInt(a.x402MaxAtomic) > BigInt(b.x402MaxAtomic) ? 1 : a.modelSlug.localeCompare(b.modelSlug));
  return { recommended: eligible[0], candidates: eligible, rejected };
}

export function createAgentPay(options: { policy: ProcurementPolicy; policySignature?: string; discovery: DiscoverySource; fetch?: typeof fetch; baseUrl?: string }) {
  const policy = normalizePolicy(options.policy);
  const fetcher = options.fetch || fetch;
  const baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
  async function discover(): Promise<DiscoveryChoice> {
    const [models, offers] = await Promise.all([options.discovery.listModels(), options.discovery.listOffers()]);
    const choice = joinDiscovery(models, offers, { policy });
    if (!choice.recommended) throw new AgentPayProblemError(problem({ status: 422, code: 'no_eligible_offer', phase: 'discovery', retryable: true, nextAction: 'requote', title: 'No eligible machine offer', detail: 'Discovery returned no policy-eligible route' }));
    return choice;
  }
  function preflight(offer: ToolkitMachineOffer, inputTokens: number, outputCap: number, body: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    if (policy.validUntil <= now) throw new AgentPayProblemError(problem({ status: 403, code: 'policy_expired', phase: 'preflight', retryable: false, nextAction: 'stop', title: 'Procurement policy has expired' }));
    if (offer.validUntil <= now) throw new AgentPayProblemError(problem({ status: 422, code: 'offer_expired', phase: 'preflight', retryable: true, nextAction: 'requote', title: 'Offer has expired' }));
    if (!Number.isInteger(inputTokens) || inputTokens < 0 || !Number.isInteger(outputCap) || outputCap < 0) throw new AgentPayProblemError(problem({ status: 422, code: 'offer_invalid', phase: 'preflight', retryable: false, nextAction: 'stop', title: 'Token bounds are invalid' }));
    if (!policyAllowsModel(policy, canonicalDiscoveryKey(offer.providerSlug, offer.modelSlug))) throw new AgentPayProblemError(problem({ status: 403, code: 'policy_invalid', phase: 'preflight', retryable: false, nextAction: 'stop', title: 'Model is outside policy' }));
    if (!policy.allowedPayTo.map((v) => v.toLowerCase()).includes(offer.payTo.toLowerCase())) throw new AgentPayProblemError(problem({ status: 403, code: 'policy_invalid', phase: 'preflight', retryable: false, nextAction: 'stop', title: 'Merchant is outside policy' }));
    const worstCase = calculateChargeAtomic(inputTokens, outputCap, offer.inputAtomicPerMillion, offer.outputAtomicPerMillion);
    if (worstCase > BigInt(policy.maxPerRequestAtomic) || worstCase > BigInt(offer.x402MaxAtomic)) throw new AgentPayProblemError(problem({ status: 422, code: 'price_exceeds_policy', phase: 'preflight', retryable: true, nextAction: 'requote', title: 'Offer exceeds delegated budget' }));
    return { worstCaseAtomic: worstCase.toString(), requestDigest: digest({ inputTokens, outputCap, offerId: offer.offerId, body }) };
  }
  async function invoke(offer: ToolkitMachineOffer, body: Record<string, unknown>, purchaseId: string = crypto.randomUUID()) {
    const response = await fetcher(`${baseUrl}${offer.route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agentpay-purchase-id': purchaseId }, body: JSON.stringify(body) });
    if (!response.ok && response.status !== 402) {
      let payload: unknown; try { payload = await response.json(); } catch { payload = null; }
      if (payload && typeof payload === 'object' && 'code' in payload) {
        try { throw new AgentPayProblemError(problem(payload as AgentPayProblem)); } catch (error) { if (error instanceof AgentPayProblemError) throw error; }
      }
      throw new AgentPayProblemError(problem({ status: response.status, code: 'transport_before_dispatch', phase: 'execution', retryable: true, nextAction: 'retry_same_purchase', title: 'AgentPay request failed' }));
    }
    return response;
  }
  async function getReconciliation(input: { purchaseId: string; progressToken: string }) {
    const response = await fetcher(`${baseUrl}/api/agentpay/v1/purchases/${encodeURIComponent(input.purchaseId)}/reconciliation`, { headers: { authorization: `Bearer ${input.progressToken}` } });
    let payload: any = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      if (payload && typeof payload === 'object' && 'code' in payload) throw new AgentPayProblemError(problem(payload as AgentPayProblem));
      throw new AgentPayProblemError(problem({ status: response.status || 503, code: 'settlement_unknown', phase: 'reconciliation', retryable: true, nextAction: 'continue_reconciliation', title: 'Reconciliation status is unavailable', purchaseId: input.purchaseId }));
    }
    return payload;
  }
  async function waitForSettlement(input: { purchaseId: string; progressToken: string; timeoutMs?: number; pollIntervalMs?: number }) {
    const timeoutMs = Math.max(0, input.timeoutMs ?? 60_000);
    const pollIntervalMs = Math.max(10, input.pollIntervalMs ?? 1_000);
    const deadline = Date.now() + timeoutMs;
    let latest: any = null;
    do {
      latest = await getReconciliation(input);
      if (latest?.state === 'matched') return { status: 'matched' as const, purchaseId: input.purchaseId, reconciliation: latest };
      if (['executed_unpaid', 'failed_unsettled', 'reservation_expired'].includes(String(latest?.state || ''))) {
        throw new AgentPayProblemError(problem({ status: 409, code: String(latest.state) as AgentPayProblem['code'], phase: 'reconciliation', retryable: false, nextAction: 'stop', title: 'Purchase reached a terminal state', purchaseId: input.purchaseId }));
      }
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))));
    } while (Date.now() <= deadline);
    return { status: 'pending' as const, purchaseId: input.purchaseId, reconciliation: latest };
  }
  async function buy(input: { body: Record<string, unknown>; inputTokens: number; outputCap: number; policyId: string; offer?: ToolkitMachineOffer; purchaseId?: string; signReservation?: (intent: Record<string, unknown>) => Promise<string> | string; signPayment?: (quote: unknown) => Promise<string> | string; waitForSettlement?: boolean; settlementTimeoutMs?: number; pollIntervalMs?: number }) {
    const choice = await discover();
    const selected = input.offer || choice.recommended;
    if (!selected) throw new AgentPayProblemError(problem({ status: 422, code: 'no_eligible_offer', phase: 'discovery', retryable: true, nextAction: 'requote', title: 'No eligible machine offer' }));
    if (input.offer && !choice.candidates.some((candidate) => candidate.offerId === input.offer?.offerId)) {
      throw new AgentPayProblemError(problem({ status: 422, code: 'no_eligible_offer', phase: 'discovery', retryable: true, nextAction: 'requote', title: 'Selected offer is not in the current eligible discovery set' }));
    }
    const check = preflight(selected, input.inputTokens, input.outputCap, input.body);
    const purchaseId = input.purchaseId || crypto.randomUUID();
    let reservationIntent: Record<string, unknown> | undefined;
    let reservationSignature: string | undefined;
    if (input.signReservation) {
      try {
        reservationIntent = {
          policyId: input.policyId,
          purchaseId: uuidToBytes(purchaseId),
          requestDigest: digestToBytes32(check.requestDigest),
          commerceEnvelopeDigest: digestToBytes32(digest({ offerId: selected.offerId, requestDigest: check.requestDigest })),
          maxAtomic: selected.x402MaxAtomic,
          expiresAt: Math.min(policy.validUntil, Math.floor(Date.now() / 1000) + 300),
        };
        reservationSignature = await input.signReservation(reservationIntent);
      } catch {
        throw new AgentPayProblemError(problem({ status: 403, code: 'policy_invalid', phase: 'authorization', retryable: false, nextAction: 'stop', title: 'Reservation intent could not be signed', purchaseId }));
      }
    }
    const reservationResponse = await fetcher(`${baseUrl}/api/agentpay/v1/policies/${encodeURIComponent(input.policyId)}/reservations`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-agentpay-request-digest': check.requestDigest },
      body: JSON.stringify({ purchaseId, offerId: selected.offerId, request: input.body, inputTokens: input.inputTokens, outputCap: input.outputCap, requestDigest: check.requestDigest, policy, ...(options.policySignature ? { policySignature: options.policySignature } : {}), ...(reservationIntent ? { intent: reservationIntent, signature: reservationSignature } : {}) }),
    });
    if (!reservationResponse.ok) throw new AgentPayProblemError(problem({ status: reservationResponse.status, code: 'reservation_temporarily_unavailable', phase: 'reservation', retryable: true, nextAction: 'retry_same_purchase', title: 'Reservation failed', purchaseId }));
    const reservation = await reservationResponse.json();
    const quoteResponse = await invoke(selected, input.body, purchaseId);
    let quote: unknown = null;
    if (quoteResponse.status === 402) { try { quote = await quoteResponse.json(); } catch { quote = null; } }
    const paymentSignature = await (input.signPayment ? input.signPayment(quote) : 'demo-payment-signature');
    const paidResponse = await fetcher(`${baseUrl}${selected.route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agentpay-purchase-id': purchaseId, 'payment-signature': paymentSignature, 'x-agentpay-reservation': reservation.reservationReceipt?.reservationId || '', 'x-agentpay-request-digest': reservation.reservationReceipt?.requestDigest || check.requestDigest, ...(reservation.progressToken ? { 'x-agentpay-progress-token': reservation.progressToken } : {}) }, body: JSON.stringify(input.body) });
    if (paidResponse.status === 202) {
      let pending: AgentPayPending;
      try { pending = await paidResponse.clone().json() as AgentPayPending; }
      catch { pending = { purchaseId, nextAction: 'continue_reconciliation' }; }
      if (input.waitForSettlement && reservation.progressToken) {
        const settled = await waitForSettlement({ purchaseId, progressToken: reservation.progressToken, timeoutMs: input.settlementTimeoutMs, pollIntervalMs: input.pollIntervalMs });
        return { ...settled, offer: selected, reservation, response: paidResponse, quote, pending };
      }
      return { status: 'pending' as const, purchaseId, offer: selected, reservation, response: paidResponse, quote, pending };
    }
    if (!paidResponse.ok) { let payload: unknown; try { payload = await paidResponse.json(); } catch { payload = null; } if (payload && typeof payload === 'object' && 'code' in payload) throw new AgentPayProblemError(problem(payload as AgentPayProblem)); throw new AgentPayProblemError(problem({ status: paidResponse.status, code: 'settlement_unknown', phase: 'settlement', retryable: true, nextAction: 'continue_reconciliation', title: 'Payment did not reach final state', purchaseId })); }
    return { status: 'matched' as const, purchaseId, offer: selected, reservation, response: paidResponse, quote };
  }
  async function recoverAccess(input: { url: string; signer: AgentPayRecoverySigner; init?: RequestInit }) {
    const challengeResponse = await fetcher(input.url, input.init);
    let challenge: any;
    try { challenge = await challengeResponse.json(); } catch { challenge = null; }
    const extension = challenge?.extensions?.['sign-in-with-x'];
    const chain = extension?.supportedChains?.find((item: any) => item?.chainId?.startsWith('eip155:'));
    if ((challengeResponse.status !== 402 && !challengeResponse.ok) || !extension?.info || !chain) throw new AgentPayProblemError(problem({ status: challengeResponse.status || 502, code: 'access_token_lost', phase: 'access', retryable: true, nextAction: 'recover_access', title: 'Purchase recovery challenge is unavailable' }));
    const payload = await createSIWxPayload({ ...extension.info, chainId: chain.chainId, type: chain.type }, input.signer as any, input.url);
    const headers = new Headers(input.init?.headers);
    headers.set('sign-in-with-x', encodeSIWxHeader(payload));
    return fetcher(input.url, { ...input.init, headers });
  }
  return { policy, discover, preflight, invoke, buy, getReconciliation, waitForSettlement, recoverAccess, explainChoice: (choice: DiscoveryChoice) => ({ recommended: choice.recommended?.offerId || null, rejected: choice.rejected }), actionFor: agentPayActionFor };
}

function unwrapAiplansProducts(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).products)) return (payload as any).products;
  throw new Error('aiplans grouped response is not an array');
}

/** Read-only aiplans adapter with a five-minute cache and fail-closed parsing. */
export function createAiplansDiscovery(input: { baseUrl?: string; toolkitBaseUrl?: string; fetch?: typeof fetch; cacheMs?: number }) {
  const fetcher = input.fetch || fetch;
  const baseUrl = String(input.baseUrl || 'https://aiplans.dev').replace(/\/$/, '');
  const toolkitBaseUrl = String(input.toolkitBaseUrl || '').replace(/\/$/, '');
  const cacheMs = input.cacheMs ?? 5 * 60_000;
  let cache: { at: number; models: AiplansRecord[]; freshness: 'fresh' | 'stale' } | null = null;
  async function getModels() {
    if (cache && Date.now() - cache.at < cacheMs) return cache.models;
    let response: Response;
    try { response = await fetcher(`${baseUrl}/api/products/grouped`, { signal: AbortSignal.timeout(2500) }); }
    catch { throw new AgentPayProblemError(problem({ status: 503, code: 'readiness_unavailable', phase: 'discovery', retryable: false, nextAction: 'stop', title: 'aiplans discovery unavailable' })); }
    if (!response.ok) throw new AgentPayProblemError(problem({ status: 503, code: 'readiness_unavailable', phase: 'discovery', retryable: false, nextAction: 'stop', title: `aiplans returned ${response.status}` }));
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new AgentPayProblemError(problem({ status: 502, code: 'readiness_incompatible', phase: 'discovery', retryable: false, nextAction: 'stop', title: 'aiplans response is not JSON' })); }
    const records: AiplansRecord[] = [];
    for (const product of unwrapAiplansProducts(payload)) {
      const versions = Array.isArray(product.versions) ? product.versions : [];
      for (const version of versions) {
        const provider = version.providers || version.provider || {};
        const providerSlug = String(provider.slug || product.providerSlug || '').trim();
        const modelSlug = String(product.slug || product.model_slug || '').trim();
        if (!providerSlug || !modelSlug) continue;
        records.push({ providerSlug, modelSlug, productId: product.id, inputPrice: version.input_price_per_1m, outputPrice: version.output_price_per_1m, currency: version.currency, unit: version.price_unit || '1M tokens', freshness: 'fresh' });
      }
    }
    if (!records.length) throw new AgentPayProblemError(problem({ status: 502, code: 'readiness_incompatible', phase: 'discovery', retryable: false, nextAction: 'stop', title: 'aiplans returned no usable model rows' }));
    cache = { at: Date.now(), models: records, freshness: 'fresh' };
    return records;
  }
  async function listOffers() {
    if (!toolkitBaseUrl) return [];
    const response = await fetcher(`${toolkitBaseUrl}/api/agentpay/v1/discovery`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new AgentPayProblemError(problem({ status: 503, code: 'readiness_unavailable', phase: 'discovery', retryable: false, nextAction: 'stop', title: 'Toolkit offer feed unavailable' }));
    const payload = await response.json();
    return Array.isArray(payload?.offers) ? payload.offers : [];
  }
  async function listChannels(productId: string | number) {
    let response: Response;
    try { response = await fetcher(`${baseUrl}/api/channels/${encodeURIComponent(String(productId))}`, { signal: AbortSignal.timeout(2500) }); }
    catch { throw new AgentPayProblemError(problem({ status: 503, code: 'readiness_unavailable', phase: 'discovery', retryable: false, nextAction: 'stop', title: 'aiplans channel detail unavailable' })); }
    if (!response.ok) throw new AgentPayProblemError(problem({ status: 503, code: 'readiness_unavailable', phase: 'discovery', retryable: false, nextAction: 'stop', title: `aiplans channel detail returned ${response.status}` }));
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new AgentPayProblemError(problem({ status: 502, code: 'readiness_incompatible', phase: 'discovery', retryable: false, nextAction: 'stop', title: 'aiplans channel detail is malformed' }));
    return payload.map((row: any) => ({ providerSlug: String(row.providers?.slug || ''), modelSlug: String(row.models?.slug || ''), productId, inputPrice: row.input_price_per_1m, outputPrice: row.output_price_per_1m, currency: row.currency, unit: row.price_unit, freshness: 'fresh' as const })).filter((row: AiplansRecord) => row.providerSlug && row.modelSlug);
  }
  return { listModels: getModels, listOffers, listChannels, freshness: () => cache?.freshness || 'unavailable' } satisfies DiscoverySource & { freshness: () => string; listChannels: (productId: string | number) => Promise<AiplansRecord[]> };
}
