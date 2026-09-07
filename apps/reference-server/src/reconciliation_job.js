import crypto from 'node:crypto';
import { db as connectedDb } from './db.js';
import { purchaseService as defaultService } from './agentpay.js';
import { issueAgentPayReceipt, readMonadSettlement, settleX402Payment } from './x402.js';

export const AGENTPAY_RECONCILE_LIMIT = 25;
export const AGENTPAY_RECONCILE_BUDGET_MS = 5000;

function dueFilter(now) {
  return {
    terminal: false,
    nextReconcileAt: { $lte: now },
    $or: [{ leaseExpiresAt: { $exists: false } }, { leaseExpiresAt: { $lte: now } }],
  };
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/**
 * Claims one due purchase at a time. The worker never mutates state directly;
 * every outcome is submitted to AgentPayPurchaseService.
 */
export async function claimDuePurchase({ dbProvider = () => connectedDb, now = new Date(), leaseMs = 30_000 } = {}) {
  const database = dbProvider?.();
  if (!database) return null;
  const leaseToken = crypto.randomBytes(16).toString('hex');
  const collection = database.collection('agentpayPurchases');
  const result = await collection.findOneAndUpdate(
    dueFilter(now),
    { $set: { leaseToken, leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now } },
    { sort: { nextReconcileAt: 1, _id: 1 }, returnDocument: 'after' },
  );
  return result?.value || result || null;
}

async function defaultChainReader(claim) {
  return readMonadSettlement({
    txHash: claim.txHash,
    token: claim.chainEvidence?.token || claim.offer?.asset,
    payTo: claim.chainEvidence?.recipient || claim.offer?.payTo,
    maximumAtomic: claim.maximumAtomic,
    expectedPayer: claim.authorization?.payer || claim.authorization?.from,
    expectedAmount: claim.actualAtomic,
    expectedFacilitator: claim.settlement?.facilitatorAddress || String(process.env.X402_FACILITATOR_ADDRESS || '').trim() || undefined,
  });
}

export async function reconcileClaim(claim, { service = defaultService, chainReader = defaultChainReader, settler = settleX402Payment, now = () => Date.now() } = {}) {
  if (!claim) return null;
  const id = claim.purchaseId;
  const reservationExpiry = claim.reservationExpiresAt || claim.expiresAt;
  if (claim.state === 'reserved' && reservationExpiry && new Date(reservationExpiry).getTime() <= now() && !claim.authorization) return service.expireReservation(id, { reason: 'reservation_ttl' });
  if (claim.state === 'executing' && claim.executionLeaseExpiresAt && new Date(claim.executionLeaseExpiresAt).getTime() <= now() && !claim.execution) return service.markExecutionUnknown(id, { reason: 'execution_lease_expired' });
  const authorizationDeadline = Number(claim.settlementRequest?.paymentPayload?.payload?.permit2Authorization?.deadline || 0) * 1000;
  if (['execution_unknown', 'executed_pending_settlement', 'settlement_failed'].includes(claim.state) && authorizationDeadline > 0 && authorizationDeadline <= now()) return service.closeUnpaid(id, { reason: 'permit2_authorization_expired' });
  if (claim.state === 'executed_pending_settlement' || claim.state === 'settlement_failed') {
    const request = claim.settlementRequest;
    if (!request?.paymentPayload || !request?.requirements || claim.actualAtomic === undefined) return null;
    const settlement = await settler({ paymentPayload: request.paymentPayload, requirements: request.requirements, actualAmount: claim.actualAtomic });
    if (!settlement.ok) return service.recordSettlementFailure(id, { reason: settlement.reason });
    return service.recordFacilitatorSettlement(id, {
      txHash: settlement.settlement.transaction,
      facilitator: 'configured-molandak',
      facilitatorAddress: request.requirements.accepts?.[0]?.extra?.facilitatorAddress || null,
      scheme: 'upto', amount: String(claim.actualAtomic),
    });
  }
  if (claim.state === 'facilitator_settled' || claim.state === 'settlement_unknown') {
    const evidence = await chainReader(claim);
    if (evidence?.status === 'confirmed') return service.confirmChainSettlement(id, evidence);
    if (evidence?.status === 'consumed_without_tx') return service.markSettlementUnknown(id, evidence);
  }
  if (claim.state === 'chain_confirmed' || claim.state === 'pending_receipt') {
    const payer = claim.authorization?.payer || claim.authorization?.from;
    const standard = await issueAgentPayReceipt({ resourceUrl: claim.offer?.route, payer, network: claim.offer?.network, transaction: claim.txHash });
    if (!standard) return null;
    const receipt = claim.receipt || {
      usageReceiptId: `usage_${id}`,
      status: 'paid',
      version: 2,
      actualAtomic: String(claim.actualAtomic || '0'),
      txHash: claim.txHash || null,
      digest: digest({ purchaseId: id, actualAtomic: claim.actualAtomic || '0', txHash: claim.txHash || null }),
      proofId: `proof_${crypto.createHash('sha256').update(String(claim.txHash || id)).digest('hex').slice(0, 16)}`,
    };
    receipt.standard = { extension: 'offer-receipt', receipt: standard };
    return service.recordDeliveryReceipt(id, receipt);
  }
  return null;
}

export function startAgentPayReconciliationJob({ dbProvider = () => connectedDb, service = defaultService, chainReader, intervalMs = Number(process.env.AGENTPAY_RECONCILE_INTERVAL_MS || 5000), runOnStart = true } = {}) {
  let active = false;
  const tick = async () => {
    if (active) return 0;
    active = true;
    const started = Date.now(); let count = 0;
    try {
      while (count < AGENTPAY_RECONCILE_LIMIT && Date.now() - started < AGENTPAY_RECONCILE_BUDGET_MS) {
        const claim = await claimDuePurchase({ dbProvider, now: new Date() });
        if (!claim) break;
        try { await reconcileClaim(claim, { service, chainReader }); }
        catch (error) { console.error('AgentPay reconciliation failed', claim.purchaseId, error); }
        finally {
          const database = dbProvider?.();
          if (database) await database.collection('agentpayPurchases').updateOne({ _id: claim._id, leaseToken: claim.leaseToken }, { $unset: { leaseToken: '', leaseExpiresAt: '' } });
        }
        count += 1;
      }
      return count;
    } finally { active = false; }
  };
  if (runOnStart) tick().catch((error) => console.error('AgentPay reconciliation startup failed', error));
  const timer = setInterval(() => tick().catch((error) => console.error('AgentPay reconciliation tick failed', error)), intervalMs);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}
