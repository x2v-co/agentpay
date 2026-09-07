import crypto from 'node:crypto';
import { db as connectedDb, withDbTransaction } from './db.js';

const TERMINAL = new Set(['matched', 'executed_unpaid', 'failed_unsettled', 'reservation_expired']);
const TRANSITIONS = {
  reserved: new Set(['authorized', 'reservation_expired']),
  authorized: new Set(['executing', 'settlement_failed']),
  executing: new Set(['executed_pending_settlement', 'execution_unknown', 'failed_unsettled']),
  execution_unknown: new Set(['executed_unpaid']),
  executed_pending_settlement: new Set(['facilitator_settled', 'settlement_failed', 'executed_unpaid']),
  facilitator_settled: new Set(['chain_confirmed', 'settlement_unknown', 'failed_unsettled']),
  chain_confirmed: new Set(['matched', 'pending_receipt']),
  pending_receipt: new Set(['matched']),
  settlement_failed: new Set(['facilitator_settled', 'executed_unpaid']),
  settlement_unknown: new Set(['chain_confirmed', 'executed_unpaid']),
};

function nowIso(clock) { return new Date(clock()).toISOString(); }
function digest(value) { return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
function conflict(code, detail) { const error = new Error(detail || code); error.status = 409; error.code = code; return error; }
function policyFingerprint(policy = {}) {
  return digest({
    schema: String(policy.schema || ''), policyId: String(policy.policyId || '').toLowerCase(),
    owner: String(policy.owner || '').toLowerCase(), agentWallet: String(policy.agentWallet || '').toLowerCase(),
    chainId: Number(policy.chainId || 0), asset: String(policy.asset || '').toLowerCase(),
    maxTotalAtomic: String(policy.maxTotalAtomic || '0'), maxPerRequestAtomic: String(policy.maxPerRequestAtomic || '0'),
    allowedPayTo: [...(policy.allowedPayTo || [])].map((value) => String(value).toLowerCase()).sort(),
    allowedModels: [...(policy.allowedModels || [])].map(String).sort(), validUntil: Number(policy.validUntil || 0),
  });
}

/**
 * Single write boundary for AgentPay policy projections, purchases, events,
 * authorizations, usage and receipts. The memory mode is used by the recorded
 * demo and unit tests; production receives the connected Mongo database.
 */
export class AgentPayPurchaseService {
  constructor({ dbProvider = () => connectedDb, clock = Date.now, id = () => crypto.randomUUID() } = {}) {
    this.dbProvider = dbProvider;
    this.clock = clock;
    this.id = id;
    this.memory = new Map();
    this.policies = new Map();
  }

  get useMongo() { return Boolean(this.dbProvider?.()); }
  collection() { return this.dbProvider().collection('agentpayPurchases'); }

  async reservePolicyBudget(input) {
    const purchaseId = String(input.purchaseId);
    const requestDigest = String(input.requestDigest || digest(input.request || {}));
    if (!purchaseId) throw conflict('reservation_conflict', 'purchaseId is required');
    const policyId = String(input.policyId || '');
    const policy = input.policy || { policyId, maxTotalAtomic: input.maximumAtomic || '0', maxPerRequestAtomic: input.maximumAtomic || '0' };
    if (!this.useMongo && this.policies.get(policyId)?.revokedAt) throw Object.assign(new Error('policy revoked'), { status: 403, code: 'policy_revoked' });
    if (!this.useMongo) {
      const existing = this.memory.get(purchaseId);
      if (existing) {
        if (existing.requestDigest !== requestDigest || existing.offer?.offerId !== input.offer?.offerId) throw conflict('request_digest_conflict', 'purchase already binds different request evidence');
        return this.clone(existing);
      }
      const existingProjection = this.policies.get(policyId);
      if (existingProjection && policyFingerprint(existingProjection) !== policyFingerprint(policy)) throw conflict('policy_invalid', 'policyId already binds a different owner or policy envelope');
      const projection = existingProjection || { policyId, ...policy, policyFingerprint: policyFingerprint(policy) };
      const maxTotal = BigInt(projection.maxTotalAtomic || input.maximumAtomic || '0');
      const committed = [...this.memory.values()].filter((item) => item.policyId === policyId && item.state === 'matched').reduce((sum, item) => sum + BigInt(item.actualAtomic || '0'), 0n);
      const active = [...this.memory.values()].filter((item) => item.policyId === policyId && !TERMINAL.has(item.state)).reduce((sum, item) => sum + BigInt(item.maximumAtomic || '0'), 0n);
      if (committed + active + BigInt(input.maximumAtomic || '0') > maxTotal) throw conflict('reservation_conflict', 'policy total budget is exhausted');
      this.policies.set(policyId, projection);
      const reservationExpiresAt = new Date(this.clock() + 300000);
      const record = {
        _id: purchaseId,
        purchaseId,
        policyId,
        agentWallet: String(input.agentWallet || '0xDemoAgentWallet'),
        offer: input.offer,
        request: input.request || {},
        requestDigest,
        inputTokens: input.inputTokens,
        outputCap: input.outputCap,
        maximumAtomic: String(input.maximumAtomic || input.offer?.x402MaxAtomic || '0'),
        progressTokenHash: String(input.progressTokenHash || ''),
        progressTokenExpiresAt: new Date(this.clock() + 300000),
        accessNonce: String(input.accessNonce || crypto.randomBytes(16).toString('hex')),
        accessNonceUsed: false,
        accessNonceExpiresAt: new Date(this.clock() + 300000),
        nextReconcileAt: new Date(this.clock()),
        reservationId: `rsv_${purchaseId}`,
        reservationExpiresAt,
        expiresAt: reservationExpiresAt,
        state: 'reserved',
        reconciliation: 'reserved',
        terminal: false,
        createdAt: new Date(this.clock()),
        updatedAt: new Date(this.clock()),
        events: [],
      };
      this.appendEvent(record, 'reserved', 'Policy ceiling reserved', { maximumAtomic: record.maximumAtomic });
      this.memory.set(purchaseId, record);
      return this.clone(record);
    }
    return withDbTransaction(async (session) => {
      const col = this.collection();
      const policyCol = this.dbProvider().collection('agentpayPolicies');
      const existing = await col.findOne({ purchaseId }, { session });
      if (existing) {
        if (existing.requestDigest !== requestDigest || existing.offer?.offerId !== input.offer?.offerId) throw conflict('request_digest_conflict', 'purchase already binds different request evidence');
        return existing;
      }
      const fingerprint = policyFingerprint(policy);
      await policyCol.updateOne({ policyId }, { $setOnInsert: { policyId, ...policy, policyFingerprint: fingerprint, createdAt: new Date(this.clock()) }, $set: { updatedAt: new Date(this.clock()) } }, { upsert: true, session });
      const projection = await policyCol.findOne({ policyId }, { session });
      if (String(projection?.policyFingerprint || policyFingerprint(projection)) !== fingerprint) throw conflict('policy_invalid', 'policyId already binds a different owner or policy envelope');
      const maxTotal = BigInt(projection?.maxTotalAtomic || input.maximumAtomic || '0');
      const totals = await col.aggregate([{ $match: { policyId } }, { $group: { _id: null, committed: { $sum: { $cond: [{ $eq: ['$state', 'matched'] }, { $toLong: { $ifNull: ['$actualAtomic', '0'] } }, 0] } }, active: { $sum: { $cond: [{ $not: [{ $in: ['$state', [...TERMINAL]] }] }, { $toLong: { $ifNull: ['$maximumAtomic', '0'] } }, 0] } } } }], { session }).toArray();
      const total = totals[0] || { committed: 0, active: 0 };
      if (BigInt(total.committed || 0) + BigInt(total.active || 0) + BigInt(input.maximumAtomic || '0') > maxTotal) throw conflict('reservation_conflict', 'policy total budget is exhausted');
      const reservationExpiresAt = new Date(this.clock() + 300000);
      const record = {
        purchaseId,
        policyId,
        agentWallet: String(input.agentWallet || ''),
        offer: input.offer,
        request: input.request || {},
        requestDigest,
        inputTokens: input.inputTokens,
        outputCap: input.outputCap,
        maximumAtomic: String(input.maximumAtomic || input.offer?.x402MaxAtomic || '0'),
        state: 'reserved', reconciliation: 'reserved', terminal: false,
        createdAt: new Date(this.clock()), updatedAt: new Date(this.clock()), events: [],
        progressTokenHash: String(input.progressTokenHash || ''),
        progressTokenExpiresAt: new Date(this.clock() + 300000),
        accessNonce: String(input.accessNonce || crypto.randomBytes(16).toString('hex')),
        accessNonceUsed: false,
        accessNonceExpiresAt: new Date(this.clock() + 300000),
        nextReconcileAt: new Date(this.clock()),
        reservationId: `rsv_${purchaseId}`,
        reservationExpiresAt,
        expiresAt: reservationExpiresAt,
      };
      this.appendEvent(record, 'reserved', 'Policy ceiling reserved', { maximumAtomic: record.maximumAtomic });
      await col.insertOne(record, { session });
      return record;
    }, { allowStandaloneFallback: true });
  }

  async transition(purchaseId, nextState, detail, evidence = {}, fields = {}) {
    if (!this.useMongo) {
      const record = this.memory.get(String(purchaseId));
      if (!record) throw Object.assign(new Error('purchase not found'), { status: 404, code: 'purchase_not_found' });
      if (record.state === nextState) return this.clone(record);
      if (record.state !== nextState && !TRANSITIONS[record.state]?.has(nextState)) throw conflict('authorization_conflict', `invalid AgentPay transition ${record.state} -> ${nextState}`);
      this.appendEvent(record, nextState, detail, evidence);
      Object.assign(record, fields, { updatedAt: new Date(this.clock()), terminal: TERMINAL.has(nextState) });
      if (TERMINAL.has(nextState)) delete record.nextReconcileAt;
      else record.nextReconcileAt = new Date(this.clock());
      return this.clone(record);
    }
    return withDbTransaction(async (session) => {
      const col = this.collection();
      const record = await col.findOne({ purchaseId }, { session });
      if (!record) throw Object.assign(new Error('purchase not found'), { status: 404, code: 'purchase_not_found' });
      if (record.state === nextState) return record;
      if (record.state !== nextState && !TRANSITIONS[record.state]?.has(nextState)) throw conflict('authorization_conflict', `invalid AgentPay transition ${record.state} -> ${nextState}`);
      const item = { id: (record.events?.length || 0) + 1, at: new Date(this.clock()), state: nextState, detail, ...evidence };
      const update = { $set: { ...fields, state: nextState, updatedAt: new Date(this.clock()), terminal: TERMINAL.has(nextState), ...(TERMINAL.has(nextState) ? {} : { nextReconcileAt: new Date(this.clock()) }) }, $push: { events: item } };
      if (TERMINAL.has(nextState)) update.$unset = { nextReconcileAt: '' };
      const result = await col.updateOne({ _id: record._id, state: record.state }, update, { session });
      if (result.modifiedCount !== 1) throw conflict('authorization_conflict', 'purchase changed concurrently');
      return col.findOne({ _id: record._id }, { session });
    }, { allowStandaloneFallback: true });
  }

  async revokePolicy(policyId, revocation = {}) {
    const id = String(policyId || '');
    if (!id) throw Object.assign(new Error('policyId is required'), { status: 400, code: 'policy_invalid' });
    if (!this.useMongo) {
      const existing = this.policies.get(id);
      if (!existing) throw Object.assign(new Error('policy not found'), { status: 404, code: 'policy_invalid' });
      if (!existing.owner || String(existing.owner).toLowerCase() !== String(revocation.owner || '').toLowerCase()) throw Object.assign(new Error('policy owner does not match revocation signer'), { status: 403, code: 'policy_invalid' });
      if (existing?.revokedAt && existing.revokedAt !== revocation.revokedAt) throw conflict('policy_revoked', 'policy revocation is immutable');
      const value = { policyId: id, ...existing, ...revocation, revokedAt: existing?.revokedAt || revocation.revokedAt || new Date(this.clock()).toISOString() };
      this.policies.set(id, value);
      return value;
    }
    return withDbTransaction(async (session) => {
      const col = this.dbProvider().collection('agentpayPolicies');
      const existing = await col.findOne({ policyId: id }, { session });
      if (!existing) throw Object.assign(new Error('policy not found'), { status: 404, code: 'policy_invalid' });
      if (!existing.owner || String(existing.owner).toLowerCase() !== String(revocation.owner || '').toLowerCase()) throw Object.assign(new Error('policy owner does not match revocation signer'), { status: 403, code: 'policy_invalid' });
      if (existing?.revokedAt && String(existing.revokedAt) !== String(revocation.revokedAt)) throw conflict('policy_revoked', 'policy revocation is immutable');
      const value = { policyId: id, ...revocation, revokedAt: existing?.revokedAt || revocation.revokedAt || new Date(this.clock()) };
      await col.updateOne({ policyId: id }, { $set: value, $setOnInsert: { createdAt: new Date(this.clock()) } }, { upsert: true, session });
      return col.findOne({ policyId: id }, { session });
    }, { allowStandaloneFallback: true });
  }

  async getPolicy(policyId) {
    const id = String(policyId || '');
    if (!this.useMongo) return this.clone(this.policies.get(id) || null);
    return this.dbProvider().collection('agentpayPolicies').findOne({ policyId: id });
  }

  appendEvent(record, state, detail, evidence = {}) {
    record.state = state;
    record.events.push({ id: record.events.length + 1, at: new Date(this.clock()), state, detail, ...evidence });
  }

  async bindAuthorization(purchaseId, authorization, settlementRequest) {
    const existing = await this.get(purchaseId);
    const normalizedAuthorization = { ...authorization, payer: String(authorization?.payer || '').toLowerCase(), nonce: String(authorization?.nonce || '') };
    if (existing?.authorization) {
      const same = String(existing.authorization?.payer || '').toLowerCase() === String(authorization?.payer || '').toLowerCase()
        && String(existing.authorization?.nonce || '') === String(authorization?.nonce || '')
        && String(existing.authorization?.signatureDigest || '') === String(authorization?.signatureDigest || '');
      if (!same) throw conflict('authorization_conflict', 'purchase already binds different payment authorization');
      return existing;
    }
    if (!this.useMongo) {
      const reused = [...this.memory.values()].find((item) => item.purchaseId !== String(purchaseId)
        && String(item.offer?.network || '') === String(existing?.offer?.network || '')
        && String(item.authorization?.payer || '').toLowerCase() === normalizedAuthorization.payer
        && String(item.authorization?.nonce || '') === normalizedAuthorization.nonce);
      if (reused) throw conflict('authorization_conflict', 'Permit2 authorization is already bound to another purchase');
    }
    try {
      return await this.transition(purchaseId, 'authorized', 'Permit2 authorization verified', normalizedAuthorization, { authorization: normalizedAuthorization, ...(settlementRequest ? { settlementRequest } : {}) });
    } catch (error) {
      if (error?.code === 11000) throw conflict('authorization_conflict', 'Permit2 authorization is already bound to another purchase');
      throw error;
    }
  }
  async startExecution(purchaseId, evidence = {}) {
    const executionToken = String(evidence.executionToken || '');
    const executionLeaseMs = Number(evidence.executionLeaseMs || process.env.AGENTPAY_EXECUTION_LEASE_MS || 120000);
    const leaseMs = Number.isFinite(executionLeaseMs) && executionLeaseMs > 0 ? Math.min(executionLeaseMs, 15 * 60_000) : 120000;
    return this.transition(purchaseId, 'executing', 'Provider execution started', evidence, { executionStartedAt: new Date(this.clock()), executionLeaseExpiresAt: new Date(this.clock() + leaseMs), ...(executionToken ? { executionToken } : {}) });
  }
  async recordExecution(purchaseId, execution) {
    // Keep provider output in the purchase record only. Progress/events may
    // expose aggregate usage for animation, but never prompt or model content.
    const eventEvidence = { usage: execution.usage, actualAtomic: String(execution.actualAtomic) };
    return this.transition(purchaseId, 'executed_pending_settlement', 'Provider usage persisted; pending receipt created', eventEvidence, { execution, result: execution.result, usage: execution.usage, actualAtomic: String(execution.actualAtomic), reconciliation: 'executed_pending_settlement' });
  }
  async recordFacilitatorSettlement(purchaseId, settlement) { return this.transition(purchaseId, 'facilitator_settled', 'Monad facilitator returned transaction identity', settlement, { settlement, txHash: settlement.txHash, reconciliation: 'pending_chain_confirmation' }); }
  async recordSettlementFailure(purchaseId, failure) { return this.transition(purchaseId, 'settlement_failed', 'Facilitator reported a definitive failure', failure, { settlementFailure: failure, reconciliation: 'settlement_failed' }); }
  async confirmChainSettlement(purchaseId, chain) {
    const existing = await this.get(purchaseId);
    if (existing?.state === 'chain_confirmed' || existing?.state === 'pending_receipt' || existing?.state === 'matched') {
      if (String(existing.actualAtomic || '') !== String(chain.actualAtomic || '') || (existing.txHash && chain.txHash && existing.txHash !== chain.txHash)) throw conflict('disputed_amount', 'chain evidence conflicts with stored settlement');
      return existing;
    }
    if (existing && chain.actualAtomic !== undefined && BigInt(chain.actualAtomic) > BigInt(existing.maximumAtomic || '0')) throw conflict('disputed_amount', 'chain amount exceeds reserved ceiling');
    return this.transition(purchaseId, 'chain_confirmed', 'Monad receipt independently matched', chain, { chainEvidence: chain, actualAtomic: String(chain.actualAtomic), txHash: chain.txHash || existing?.txHash || null, reconciliation: 'pending_receipt' });
  }
  async recordDeliveryReceipt(purchaseId, receipt) {
    const existing = await this.get(purchaseId);
    if (existing?.state === 'matched') {
      if (existing.receipt?.digest && receipt?.digest && existing.receipt.digest !== receipt.digest) throw conflict('receipt_conflict', 'delivery receipt evidence is immutable');
      return existing;
    }
    return this.transition(purchaseId, 'matched', 'Delivery receipt durable; purchase reconciled', { proofId: receipt.proofId }, { receipt, reconciliation: 'matched' });
  }
  async markPendingReceipt(purchaseId, receipt) { return this.transition(purchaseId, 'pending_receipt', 'Payment confirmed; receipt finalization pending', {}, { receipt, reconciliation: 'pending_receipt' }); }
  async markExecutionUnknown(purchaseId, evidence = {}) { return this.transition(purchaseId, 'execution_unknown', 'Execution lease expired without durable provider response', evidence, { reconciliation: 'execution_unknown' }); }
  async closeUnpaid(purchaseId, evidence = {}) { return this.transition(purchaseId, 'executed_unpaid', 'Authorization expired unused; reservation released', evidence, { reconciliation: 'executed_unpaid' }); }
  async expireReservation(purchaseId, evidence = {}) { return this.transition(purchaseId, 'reservation_expired', 'Reservation TTL elapsed before authorization', evidence, { reconciliation: 'reservation_expired' }); }
  async markSettlementUnknown(purchaseId, evidence = {}) { return this.transition(purchaseId, 'settlement_unknown', 'Permit2 nonce consumed but transaction is not yet located', evidence, { reconciliation: 'settlement_unknown' }); }
  async markSettlementDisputed(purchaseId, evidence = {}) { return this.transition(purchaseId, 'failed_unsettled', 'Independent Monad settlement evidence was rejected', evidence, { reconciliation: 'failed_unsettled', settlementFailure: evidence }); }
  async markFailedUnsettled(purchaseId, evidence = {}) { return this.transition(purchaseId, 'failed_unsettled', 'Provider returned a definitive failure before settlement', evidence, { reconciliation: 'failed_unsettled' }); }

  async get(purchaseId) {
    if (!this.useMongo) return this.clone(this.memory.get(String(purchaseId)) || null);
    return this.collection().findOne({ purchaseId });
  }
  async consumeAccessNonce(purchaseId, nonce) {
    const value = String(nonce || '');
    if (!value) return false;
    if (!this.useMongo) {
      const record = this.memory.get(String(purchaseId));
      if (!record || record.accessNonce !== value || record.accessNonceUsed || new Date(record.accessNonceExpiresAt).getTime() <= this.clock()) return false;
      record.accessNonceUsed = true;
      record.updatedAt = new Date(this.clock());
      return true;
    }
    return withDbTransaction(async (session) => {
      const result = await this.collection().updateOne({ purchaseId: String(purchaseId), accessNonce: value, accessNonceUsed: { $ne: true }, accessNonceExpiresAt: { $gt: new Date(this.clock()) } }, { $set: { accessNonceUsed: true, updatedAt: new Date(this.clock()) } }, { session });
      return result.modifiedCount === 1;
    }, { allowStandaloneFallback: true });
  }
  async list() { return this.useMongo ? this.collection().find({}).sort({ createdAt: -1 }).limit(100).toArray() : [...this.memory.values()].map((x) => this.clone(x)); }
  clone(value) { return value ? JSON.parse(JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item)) : value; }
}

export { TRANSITIONS, TERMINAL };
