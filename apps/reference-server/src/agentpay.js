import crypto from 'node:crypto';
import { buildSIWxSchema, parseSIWxHeader, validateSIWxMessage, verifySIWxSignature } from '@x402/extensions/sign-in-with-x';
import { db } from './db.js';
import { sha256Digest } from './protocol_digests.js';
import { AgentPayPurchaseService } from './purchase_service.js';
import { agentPayMerchantPayTo, agentPayReadiness, buildUptoRequirements, issueAgentPayOffer, issueAgentPayReceipt, merchantPayToReadiness, MONAD_USDC, readMonadSettlement, settleX402Payment, verifyPolicyRevocation, verifyProcurementPolicy, verifyReservationIntent, verifyX402Payment } from './x402.js';
import { invokeZhipu } from './providers/zhipu.js';

const purchaseService = new AgentPayPurchaseService({ dbProvider: () => db });
const offerDefinitions = [
  {
    offerId: 'toolkit-zhipu-glm-flash', providerSlug: 'zhipu', modelSlug: 'GLM-4.7-Flash',
    route: '/api/agentpay/v1/models/zhipu/GLM-4.7-Flash/invoke', payTo: agentPayMerchantPayTo() || '0x0000000000000000000000000000000000000000',
    network: 'eip155:10143', asset: MONAD_USDC, maxInputTokens: 128000, maxOutputTokens: 4096,
    inputAtomicPerMillion: '2', outputAtomicPerMillion: '8', x402MaxAtomic: '100000',
    rateVersion: 'toolkit-demo-2026-09', manifestDigest: 'sha256:toolkit-demo-manifest', fulfillment: 'machine',
  },
  {
    offerId: 'zhipu-coding-plan-human', providerSlug: 'zhipu', modelSlug: 'Coding Plan',
    route: 'https://item.taobao.com/coding-plan', payTo: 'human_checkout', network: 'web2', asset: 'CNY',
    maxInputTokens: 0, maxOutputTokens: 0, inputAtomicPerMillion: '0', outputAtomicPerMillion: '0', x402MaxAtomic: '0',
    rateVersion: 'upstream-human-checkout', manifestDigest: 'sha256:human-checkout', fulfillment: 'human_checkout',
  },
];
function currentOffers() {
  const validUntil = Math.floor(Date.now() / 1000) + 3600;
  return offerDefinitions.map((offer) => ({ ...offer, validUntil }));
}

const AIPLANS_CACHE_MS = 5 * 60_000;
let aiplansCache = null;

function now() { return new Date().toISOString(); }
function hash(value) { return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
function purchaseBytes16(value) {
  const hex = String(value || '').replaceAll('-', '').toLowerCase();
  return /^([0-9a-f]{32})$/.test(hex) ? `0x${hex}` : null;
}
function digestBytes32(value) {
  const normalized = String(value || '').toLowerCase();
  if (/^sha256:[0-9a-f]{64}$/.test(normalized)) return `0x${normalized.slice(7)}`;
  return /^0x[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}
function safePurchase(p) {
  if (!p) return null;
  return {
    purchaseId: p.purchaseId, policyId: p.policyId, state: p.state, reconciliation: p.reconciliation,
    offer: p.offer, events: p.events || [], actualAtomic: p.actualAtomic || null,
    txHash: p.txHash || null, receipt: p.receipt || null, result: p.result || null,
  };
}
async function canReadPurchase(req, purchase) {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const progressTokenValid = purchase?.progressTokenExpiresAt && new Date(purchase.progressTokenExpiresAt).getTime() > Date.now();
  if (token && progressTokenValid && purchase?.progressTokenHash && hash(token) === purchase.progressTokenHash) return true;
  const header = req.get('sign-in-with-x');
  if (!header || !purchase?.accessNonce) return false;
  try {
    const payload = parseSIWxHeader(header);
    const origin = new URL(`${req.protocol}://${req.get('host')}`);
    const validation = await validateSIWxMessage(payload, origin, { checkNonce: (nonce) => nonce === purchase.accessNonce && !purchase.accessNonceUsed });
    if (!validation.isValid) return false;
    const verified = await verifySIWxSignature(payload);
    if (!verified.isValid) return false;
    const expectedPayer = purchase.authorization?.payer || purchase.authorization?.from || purchase.agentWallet;
    if (!expectedPayer || String(verified.payer).toLowerCase() !== String(expectedPayer).toLowerCase()) return false;
    return purchaseService.consumeAccessNonce(purchase.purchaseId, payload.nonce);
  } catch { return false; }
}

function recoveryChallenge(req, purchase) {
  const issuedAt = new Date().toISOString();
  const origin = `${req.protocol}://${req.get('host')}`;
  const uri = `${origin}${req.originalUrl}`;
  return {
    domain: new URL(origin).host,
    uri,
    statement: 'Recover this AgentPay purchase result',
    version: '1',
    nonce: purchase.accessNonce,
    issuedAt,
    expirationTime: purchase.accessNonceExpiresAt instanceof Date ? purchase.accessNonceExpiresAt.toISOString() : new Date(purchase.accessNonceExpiresAt).toISOString(),
    requestId: purchase.purchaseId,
  };
}

function accessChallenge(res, req, purchase) {
  return res.status(402).json({
    type: 'https://toolkit.fun/problems/agentpay/access_token_lost',
    title: 'Purchase access requires wallet recovery',
    status: 402,
    code: 'access_token_lost',
    phase: 'access',
    retryable: true,
    nextAction: 'recover_access',
    purchaseId: purchase.purchaseId,
    extensions: {
      'sign-in-with-x': {
        info: recoveryChallenge(req, purchase),
        supportedChains: [{ chainId: 'eip155:10143', type: 'eip191', signatureScheme: 'eip191' }],
        schema: buildSIWxSchema(),
      },
    },
  });
}

export function compactAiplansProducts(payload) {
  const products = Array.isArray(payload) ? payload : (Array.isArray(payload?.products) ? payload.products : []);
  const rows = [];
  for (const product of products) {
    const versions = Array.isArray(product?.versions) ? product.versions : [];
    for (const version of versions) {
      const provider = version?.providers || version?.provider || product?.providers || {};
      const providerSlug = String(provider?.slug || product?.providerSlug || '').trim();
      const modelSlug = String(product?.slug || product?.model_slug || '').trim();
      if (!providerSlug || !modelSlug) continue;
      rows.push({
        productId: product?.id ?? null,
        providerSlug,
        modelSlug,
        inputPrice: version?.input_price_per_1m ?? null,
        outputPrice: version?.output_price_per_1m ?? null,
        currency: version?.currency || 'USD',
        unit: version?.price_unit || '1M tokens',
      });
    }
  }
  return rows;
}

async function aiplansSnapshot() {
  if (aiplansCache && Date.now() - aiplansCache.cachedAt < AIPLANS_CACHE_MS) {
    return { ...aiplansCache.value, cache: 'hit' };
  }
  const base = String(process.env.AIPLANS_BASE_URL || 'https://aiplans.dev').replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/api/products/grouped`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`aiplans ${response.status}`);
    const payload = await response.json();
    const products = compactAiplansProducts(payload);
    if (!products.length) throw new Error('aiplans returned no usable products');
    const value = { freshness: 'fresh', source: 'aiplans.dev', fetchedAt: new Date().toISOString(), products, offers: currentOffers() };
    aiplansCache = { cachedAt: Date.now(), value };
    return { ...value, cache: 'miss' };
  } catch (error) {
    return { freshness: 'unavailable', source: 'aiplans.dev', error: 'upstream discovery unavailable', offers: currentOffers() };
  }
}

function problem(res, status, code, phase, nextAction, title, purchaseId = '') {
  return res.status(status).json({ type: `https://toolkit.fun/problems/agentpay/${code}`, title, status, code, phase, retryable: nextAction !== 'stop', nextAction, ...(purchaseId ? { purchaseId } : {}) });
}

export function registerAgentPayRoutes(app) {
  app.get('/.well-known/agentpay.json', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(agentPayManifest());
  });
  app.get('/api/agentpay/v1/manifest', (_req, res) => res.json(agentPayManifest()));
  app.get('/api/agentpay/v1/discovery', async (_req, res) => res.json(await aiplansSnapshot()));
  app.get('/api/agentpay/v1/readiness', async (req, res) => res.json(await agentPayReadiness({ skipContracts: req.query.mode === 'recorded' })));

  app.post('/api/agentpay/v1/policies/:policyId/reservations', async (req, res) => {
    const body = req.body || {};
    const purchaseId = String(body.purchaseId || crypto.randomUUID());
    const offer = currentOffers().find((item) => item.offerId === String(body.offerId || ''));
    if (!offer) return problem(res, 422, 'no_eligible_offer', 'discovery', 'requote', 'Offer is not in the current Toolkit offer set', purchaseId);
    const hasAnyRequestBounds = Object.hasOwn(body, 'inputTokens') || Object.hasOwn(body, 'outputCap');
    const hasRequestBounds = Number.isSafeInteger(body.inputTokens) && body.inputTokens >= 0
      && Number.isSafeInteger(body.outputCap) && body.outputCap >= 0;
    if (hasAnyRequestBounds && !hasRequestBounds) return problem(res, 422, 'offer_invalid', 'reservation', 'stop', 'Request token bounds are invalid', purchaseId);
    if (hasRequestBounds) {
      let expectedRequestDigest;
      try { expectedRequestDigest = sha256Digest({ inputTokens: body.inputTokens, outputCap: body.outputCap, offerId: offer.offerId, body: body.request || {} }); }
      catch { return problem(res, 422, 'offer_invalid', 'reservation', 'stop', 'Provider request cannot be canonicalized', purchaseId); }
      if (String(body.requestDigest || '') !== expectedRequestDigest) return problem(res, 409, 'request_digest_conflict', 'reservation', 'retry_same_purchase', 'Request digest does not match the provider request', purchaseId);
    }
    if (process.env.AGENTPAY_RECORDED === '0') {
      const policy = body.policy;
      const verifiedPolicy = await verifyProcurementPolicy({ policy, signature: body.policySignature });
      const verified = await verifyReservationIntent({ intent: body.intent, signature: body.signature, expectedAddress: policy?.agentWallet });
      const expectedPurchase = purchaseBytes16(purchaseId);
      const intent = body.intent || {};
      const expiry = Number(intent.expiresAt || 0);
      const policyExpiry = Number(policy?.validUntil || 0);
      const bound = verifiedPolicy && verified
        && policy?.schema === 'agentpay.policy.v1'
        && Number(policy?.chainId) === 10143
        && String(policy?.asset || '').toLowerCase() === MONAD_USDC.toLowerCase()
        && String(policy?.policyId || '').toLowerCase() === String(req.params.policyId).toLowerCase()
        && (policy?.allowedPayTo || []).map((value) => String(value).toLowerCase()).includes(offer.payTo.toLowerCase())
        && (policy?.allowedModels || []).includes(`${offer.providerSlug}/${offer.modelSlug}`)
        && BigInt(policy?.maxPerRequestAtomic || '0') >= BigInt(offer.x402MaxAtomic)
        && BigInt(policy?.maxTotalAtomic || '0') >= BigInt(offer.x402MaxAtomic)
        && expectedPurchase
        && String(intent.purchaseId || '').toLowerCase() === expectedPurchase
        && String(intent.policyId || '').toLowerCase() === String(policy?.policyId || req.params.policyId).toLowerCase()
        && digestBytes32(body.requestDigest) === String(intent.requestDigest || '').toLowerCase()
        && digestBytes32(sha256Digest({ offerId: offer.offerId, requestDigest: body.requestDigest })) === String(intent.commerceEnvelopeDigest || '').toLowerCase()
        && String(intent.maxAtomic || '') === String(offer.x402MaxAtomic)
        && Number.isSafeInteger(expiry) && expiry > Math.floor(Date.now() / 1000) && expiry <= policyExpiry;
      if (!bound) return problem(res, 403, 'policy_invalid', 'authorization', 'stop', 'Reservation intent signature or binding is invalid', purchaseId);
    }
    try {
      // The plaintext progress token is returned only to the request that won
      // the reservation CAS. Replays receive the immutable receipt without a
      // new credential, and concurrent losers cannot guess the winner's token.
      const progressToken = crypto.randomBytes(32).toString('base64url');
      const purchase = await purchaseService.reservePolicyBudget({
        purchaseId, policyId: req.params.policyId, offer, request: body.request || { prompt: 'Build a Monad demo' },
        requestDigest: body.requestDigest || hash(body.request || {}), inputTokens: body.inputTokens, outputCap: body.outputCap,
        maximumAtomic: offer.x402MaxAtomic, policy: body.policy,
        progressTokenHash: hash(progressToken),
      });
      const response = {
        purchaseId,
        reservationReceipt: {
          reservationId: purchase.reservationId || `rsv_${purchaseId}`,
          maximumAtomic: purchase.maximumAtomic || offer.x402MaxAtomic,
          requestDigest: purchase.requestDigest,
          expiresAt: purchase.reservationExpiresAt ? new Date(purchase.reservationExpiresAt).getTime() : Date.now() + 300000,
        },
        snapshot: safePurchase(purchase),
      };
      if (purchase.progressTokenHash === hash(progressToken)) response.progressToken = progressToken;
      return res.status(200).json(response);
    } catch (error) {
      return problem(res, error.status || 409, error.code || 'reservation_conflict', 'reservation', error.code === 'policy_revoked' ? 'stop' : 'retry_same_purchase', error.message || 'Reservation failed', purchaseId);
    }
  });

  app.post('/api/agentpay/v1/policies/:policyId/revocations', async (req, res) => {
    const revocation = req.body?.revocation || req.body || {};
    if (process.env.AGENTPAY_RECORDED === '0') {
      const storedPolicy = await purchaseService.getPolicy(req.params.policyId);
      if (!storedPolicy?.owner) return problem(res, 404, 'policy_invalid', 'authorization', 'stop', 'Policy does not exist');
      const ownerMatches = String(revocation?.owner || '').toLowerCase() === String(storedPolicy.owner).toLowerCase();
      const verified = ownerMatches && await verifyPolicyRevocation({ revocation, signature: req.body?.signature, expectedAddress: storedPolicy.owner });
      if (!verified || String(revocation?.policyId || '').toLowerCase() !== String(req.params.policyId).toLowerCase()) return problem(res, 403, 'policy_invalid', 'authorization', 'stop', 'Policy revocation signature is invalid');
    }
    try { return res.json(await purchaseService.revokePolicy(req.params.policyId, { owner: revocation.owner || '', revokedAt: revocation.revokedAt || now() })); }
    catch (error) { return problem(res, error.status || 409, error.code || 'policy_revoked', 'authorization', 'stop', error.message || 'Policy revocation failed'); }
  });

  app.post('/api/agentpay/v1/models/:provider/:model/invoke', async (req, res) => {
    const purchaseId = String(req.get('x-agentpay-purchase-id') || '');
    const offer = currentOffers().find((item) => item.providerSlug === req.params.provider && item.modelSlug === req.params.model);
    if (!offer || offer.fulfillment !== 'machine') return problem(res, 422, 'no_eligible_offer', 'discovery', 'requote', 'No machine offer for this model', purchaseId);
    const payToReadiness = merchantPayToReadiness();
    if (process.env.AGENTPAY_RECORDED === '0' && !payToReadiness.ok) return problem(res, 503, 'readiness_unavailable', 'readiness', 'stop', payToReadiness.reason, purchaseId);
    const paymentHeader = req.get('payment-signature');
    if (!paymentHeader) {
      const requirements = buildUptoRequirements({ resource: req.originalUrl, payTo: offer.payTo, maxAmount: offer.x402MaxAtomic, validUntil: offer.validUntil });
      const signedOffer = await issueAgentPayOffer({ resourceUrl: req.originalUrl, requirement: requirements.accepts[0] });
      if (process.env.AGENTPAY_RECORDED === '0' && !signedOffer) return problem(res, 503, 'readiness_unavailable', 'readiness', 'stop', 'Merchant signing key is not configured', purchaseId);
      return res.status(402).json({ ...requirements, ...(signedOffer ? { extensions: { 'offer-receipt': { offers: [signedOffer] } } } : {}), agentPay: { purchaseId, offerId: offer.offerId, commerceEnvelopeDigest: hash(offer), code: 'settlement_pending' } });
    }
    const purchase = await purchaseService.get(purchaseId);
    if (!purchase) return problem(res, 409, 'reservation_conflict', 'reservation', 'retry_same_purchase', 'A reservation is required before payment', purchaseId);
    const reservationHeader = String(req.get('x-agentpay-reservation') || '');
    const expectedReservation = String(purchase.reservationId || `rsv_${purchase.purchaseId}`);
    if (!reservationHeader || reservationHeader !== expectedReservation) return problem(res, 409, 'reservation_conflict', 'reservation', 'retry_same_purchase', 'A matching reservation receipt is required', purchaseId);
    if (purchase.offer?.offerId !== offer.offerId) return problem(res, 409, 'request_digest_conflict', 'reservation', 'retry_same_purchase', 'Reservation is bound to a different offer', purchaseId);
    const requestDigestHeader = String(req.get('x-agentpay-request-digest') || '');
    if (!requestDigestHeader || requestDigestHeader !== String(purchase.requestDigest || '')) return problem(res, 409, 'request_digest_conflict', 'reservation', 'retry_same_purchase', 'Request digest does not match the reservation', purchaseId);
    if (Number.isSafeInteger(purchase.inputTokens) && Number.isSafeInteger(purchase.outputCap)) {
      let paidRequestDigest;
      try { paidRequestDigest = sha256Digest({ inputTokens: purchase.inputTokens, outputCap: purchase.outputCap, offerId: offer.offerId, body: req.body || {} }); }
      catch { return problem(res, 422, 'offer_invalid', 'reservation', 'stop', 'Provider request cannot be canonicalized', purchaseId); }
      if (paidRequestDigest !== String(purchase.requestDigest || '')) return problem(res, 409, 'request_digest_conflict', 'reservation', 'retry_same_purchase', 'Paid provider request differs from the reserved request', purchaseId);
    }
    const progressToken = String(req.get('x-agentpay-progress-token') || '');
    const progressAuthorized = Boolean(progressToken && purchase.progressTokenHash && hash(progressToken) === purchase.progressTokenHash);
    if (purchase.state === 'matched') {
      if (!progressAuthorized) return accessChallenge(res, req, purchase);
      return res.json({ ...purchase.result, purchaseId, receipt: purchase.receipt });
    }
    if (!['reserved', 'authorized', 'settlement_failed'].includes(purchase.state)) {
      return problem(res, 409, 'settlement_pending', 'execution', 'continue_reconciliation', 'This purchase is already being reconciled', purchaseId);
    }
    try {
      let verifiedPayment = null;
      let requirements = null;
      if (process.env.AGENTPAY_RECORDED === '0') {
        requirements = buildUptoRequirements({ resource: req.originalUrl, payTo: offer.payTo, maxAmount: offer.x402MaxAtomic, validUntil: offer.validUntil });
        verifiedPayment = await verifyX402Payment({ header: paymentHeader, requirements });
        if (!verifiedPayment.ok) return problem(res, 402, 'authorization_conflict', 'authorization', 'stop', verifiedPayment.reason, purchaseId);
      }
      const payload = verifiedPayment?.paymentPayload;
      const payer = verifiedPayment?.verification?.payer || payload?.payload?.permit2Authorization?.from || '0x14791697260E4c9A71f18484C9f997B308e59325';
      const nonce = payload?.payload?.permit2Authorization?.nonce || `nonce_${purchaseId}`;
      await purchaseService.bindAuthorization(purchaseId, { payer, nonce, signatureDigest: hash(paymentHeader) }, verifiedPayment && requirements ? { paymentPayload: verifiedPayment.paymentPayload, requirements } : null);
      let actualAtomic = purchase.actualAtomic;
      if (purchase.state !== 'settlement_failed') {
        const executionToken = crypto.randomBytes(16).toString('hex');
        const executionClaim = await purchaseService.startExecution(purchaseId, { model: `${offer.providerSlug}/${offer.modelSlug}`, executionToken });
        if (executionClaim.state !== 'executing' || executionClaim.executionToken !== executionToken) {
          if (executionClaim.state === 'matched') return res.json({ ...executionClaim.result, purchaseId, receipt: executionClaim.receipt });
          return problem(res, 409, 'settlement_pending', 'execution', 'continue_reconciliation', 'Another request owns provider execution for this purchase', purchaseId);
        }
        const providerExecution = await invokeZhipu({ prompt: req.body?.prompt, messages: req.body?.messages, outputCap: purchase.outputCap, model: offer.modelSlug });
        const inputTokens = providerExecution.usage.inputTokens;
        const outputTokens = providerExecution.usage.outputTokens;
        if (Number.isSafeInteger(purchase.outputCap) && outputTokens > purchase.outputCap) { await purchaseService.markFailedUnsettled(purchaseId, { reason: 'provider_output_exceeds_reserved_cap' }); return problem(res, 409, 'disputed_amount', 'execution', 'stop', 'Provider usage exceeds the reserved output cap', purchaseId); }
        const numerator = BigInt(inputTokens) * BigInt(offer.inputAtomicPerMillion) + BigInt(outputTokens) * BigInt(offer.outputAtomicPerMillion);
        actualAtomic = ((numerator + 999999n) / 1000000n).toString();
        if (BigInt(actualAtomic) > BigInt(offer.x402MaxAtomic)) { await purchaseService.markFailedUnsettled(purchaseId, { reason: 'actual_charge_exceeds_upto_ceiling' }); return problem(res, 409, 'disputed_amount', 'settlement', 'stop', 'Actual charge exceeds signed ceiling', purchaseId); }
        await purchaseService.recordExecution(purchaseId, { result: providerExecution.result, usage: providerExecution.usage, actualAtomic });
      }
      if (actualAtomic === undefined || actualAtomic === null) return problem(res, 409, 'execution_unknown', 'execution', 'stop', 'Stored provider execution is missing metered usage', purchaseId);
      let txHash = `0xdemo${purchaseId.replaceAll('-', '').slice(0, 58)}`;
      if (verifiedPayment && requirements) {
        const settlement = await settleX402Payment({ paymentPayload: verifiedPayment.paymentPayload, requirements, actualAmount: actualAtomic });
        if (!settlement.ok) { await purchaseService.recordSettlementFailure(purchaseId, { reason: settlement.reason }); return problem(res, 502, 'settlement_unknown', 'settlement', 'continue_reconciliation', settlement.reason, purchaseId); }
        txHash = settlement.settlement.transaction;
      }
      await purchaseService.recordFacilitatorSettlement(purchaseId, { txHash, facilitator: verifiedPayment ? 'configured-molandak' : 'demo-molandak', facilitatorAddress: requirements?.accepts?.[0]?.extra?.facilitatorAddress || null, scheme: 'upto', amount: actualAtomic });
      if (verifiedPayment && requirements) {
        const chainEvidence = await readMonadSettlement({
          txHash,
          token: offer.asset,
          payTo: offer.payTo,
          maximumAtomic: offer.x402MaxAtomic,
          expectedPayer: payer,
          expectedAmount: actualAtomic,
          expectedFacilitator: requirements.accepts[0].extra?.facilitatorAddress || undefined,
        });
        if (chainEvidence.status === 'pending') {
          await purchaseService.markSettlementUnknown(purchaseId, chainEvidence);
          return problem(res, 202, 'settlement_unknown', 'settlement', 'continue_reconciliation', 'Settlement submitted; Monad receipt is not yet visible', purchaseId);
        }
        if (chainEvidence.status !== 'confirmed') {
          await purchaseService.markSettlementDisputed(purchaseId, chainEvidence);
          return problem(res, 409, 'settlement_disputed', 'settlement', 'stop', 'Independent Monad settlement evidence was rejected', purchaseId);
        }
        await purchaseService.confirmChainSettlement(purchaseId, chainEvidence);
      } else {
        // Recorded mode has no chain to read; its deterministic fixture is
        // explicitly kept separate from the live settlement guarantee.
        await purchaseService.confirmChainSettlement(purchaseId, { txHash, actualAtomic, network: offer.network, token: offer.asset, recipient: offer.payTo });
      }
      const signedReceipt = await issueAgentPayReceipt({ resourceUrl: req.originalUrl, payer, network: offer.network, transaction: txHash });
      const receipt = { usageReceiptId: `usage_${purchaseId}`, status: 'paid', version: 2, actualAtomic, txHash, digest: hash({ purchaseId, actualAtomic, txHash }), proofId: `proof_${crypto.randomBytes(8).toString('hex')}`, ...(signedReceipt ? { standard: { extension: 'offer-receipt', receipt: signedReceipt } } : {}) };
      if (!signedReceipt) {
        await purchaseService.markPendingReceipt(purchaseId, receipt);
        return problem(res, 503, 'pending_receipt', 'receipt', 'continue_reconciliation', 'Payment confirmed; delivery receipt finalization is pending', purchaseId);
      }
      const completed = await purchaseService.recordDeliveryReceipt(purchaseId, receipt);
      return res.json({ ...completed.result, purchaseId, receipt: completed.receipt, proofId: completed.receipt.proofId, ...(signedReceipt ? { extensions: { 'offer-receipt': { receipt: signedReceipt } } } : {}) });
    } catch (error) {
      if (error.code === 'execution_unknown') await purchaseService.markExecutionUnknown(purchaseId, { reason: 'provider_dispatch_ambiguous' }).catch(() => {});
      if (error.code === 'failed_unsettled') await purchaseService.markFailedUnsettled(purchaseId, { reason: 'provider_definitive_failure' }).catch(() => {});
      const nextAction = ['execution_unknown', 'failed_unsettled', 'readiness_unavailable'].includes(error.code) ? 'stop' : 'continue_reconciliation';
      return problem(res, error.status || 500, error.code || 'execution_unknown', 'execution', nextAction, error.message || 'AgentPay execution failed', purchaseId);
    }
  });

  app.get('/api/agentpay/v1/purchases/:purchaseId/events', async (req, res) => {
    const purchase = await purchaseService.get(req.params.purchaseId);
    if (!purchase) return problem(res, 404, 'purchase_not_found', 'access', 'stop', 'Purchase not found', req.params.purchaseId);
    if (!(await canReadPurchase(req, purchase))) return req.get('sign-in-with-x') ? problem(res, 401, 'access_token_invalid', 'access', 'recover_access', 'Purchase access token is invalid', req.params.purchaseId) : accessChallenge(res, req, purchase);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: snapshot\ndata: ${JSON.stringify(safePurchase(purchase))}\n\n`);
    for (const item of purchase.events || []) res.write(`id: ${item.id}\nevent: state\ndata: ${JSON.stringify(item)}\n\n`);
    res.end();
  });
  app.get('/api/agentpay/v1/purchases/:purchaseId/reconciliation', async (req, res) => {
    const p = await purchaseService.get(req.params.purchaseId);
    if (!p) return problem(res, 404, 'purchase_not_found', 'access', 'stop', 'Purchase not found', req.params.purchaseId);
    if (!(await canReadPurchase(req, p))) return req.get('sign-in-with-x') ? problem(res, 401, 'access_token_invalid', 'access', 'recover_access', 'Purchase access token is invalid', req.params.purchaseId) : accessChallenge(res, req, p);
    return res.json({ purchaseId: p.purchaseId, state: p.state, reconciliation: p.reconciliation, actualAtomic: p.actualAtomic || null, txHash: p.txHash || null, receipt: p.receipt || null });
  });
  app.get('/api/agentpay/v1/purchases/:purchaseId/result', async (req, res) => {
    const p = await purchaseService.get(req.params.purchaseId);
    if (!p?.result) return problem(res, 404, 'result_pending', 'access', 'continue_reconciliation', 'Result is not ready', req.params.purchaseId);
    if (!(await canReadPurchase(req, p))) return req.get('sign-in-with-x') ? problem(res, 401, 'access_token_invalid', 'access', 'recover_access', 'Purchase access token is invalid', req.params.purchaseId) : accessChallenge(res, req, p);
    return res.json({ purchaseId: p.purchaseId, ...p.result, receipt: p.receipt || null, proofId: p.receipt?.proofId || null });
  });
  app.get('/api/agentpay/v1/proofs/:publicProofId', async (req, res) => {
    const list = await purchaseService.list();
    const p = list.find((item) => item.receipt?.proofId === req.params.publicProofId);
    if (!p) return problem(res, 404, 'proof_not_found', 'access', 'stop', 'Proof not found');
    return res.json({ proofId: p.receipt.proofId, purchaseId: p.purchaseId, offerId: p.offer.offerId, model: `${p.offer.providerSlug}/${p.offer.modelSlug}`, txHash: p.txHash || null, actualAtomic: p.actualAtomic || null, receiptDigest: p.receipt.digest, state: p.state });
  });
}

/** Machine-readable capability contract for agents discovering AgentPay. */
export function agentPayManifest() {
  return {
    schemaVersion: 'toolkit.agentpay.manifest.v1',
    service: 'AgentPay',
    provider: 'toolkit.fun',
    capabilities: ['model_discovery', 'owner_policy_reservation', 'x402_upto_permit2', 'usage_receipts', 'siwx_recovery'],
    network: { namespace: 'eip155:10143', name: 'Monad Testnet', asset: MONAD_USDC, paymentScheme: 'upto', assetTransferMethod: 'permit2' },
    endpoints: {
      discovery: '/api/agentpay/v1/discovery',
      readiness: '/api/agentpay/v1/readiness',
      reservation: '/api/agentpay/v1/policies/{policyId}/reservations',
      invocation: '/api/agentpay/v1/models/{provider}/{model}/invoke',
      events: '/api/agentpay/v1/purchases/{purchaseId}/events',
      reconciliation: '/api/agentpay/v1/purchases/{purchaseId}/reconciliation',
      result: '/api/agentpay/v1/purchases/{purchaseId}/result',
      proof: '/api/agentpay/v1/proofs/{publicProofId}',
    },
    authorization: {
      policy: 'EIP-712 owner-signed Procurement Policy',
      reservation: 'EIP-712 agent-wallet ReservationIntent',
      payment: 'x402 v2 upto with Permit2',
      resultRecovery: 'purchase-scoped SIWX challenge',
    },
    guarantees: [
      'human_checkout offers are rejected before authorization',
      'reservation and request digests are bound before provider execution',
      'settlement is limited to actual metered usage under the signed ceiling',
      'unknown mappings, readiness failures, and disputed chain evidence fail closed',
    ],
    modes: { recorded: 'deterministic fixture for replay', live: 'requires readiness, funded wallet, provider credentials, and facilitator allowlist' },
    links: { product: 'https://toolkit.fun', modelDiscovery: 'https://aiplans.dev', sdk: 'https://github.com/x2v-co/agentpay/tree/main/packages/sdk' },
  };
}

export function agentPayDemoState() { return { purchases: [], offers: currentOffers() }; }
export { purchaseService };
