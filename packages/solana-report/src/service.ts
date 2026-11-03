import { orderMemo } from './memo.js';
import { randomUUID } from 'node:crypto';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentRequired } from '@x402/core/types';
import { calculateReport, canonical, digest, invariant, reportInput, svmAddress, NETWORK, type Mode, type Order } from './model.js';
import { OrderStore } from './store.js';
import { SvmGateway } from './gateway.js';

export class ReportService {
  constructor(readonly store: OrderStore, readonly gateway: SvmGateway, readonly mode: Mode, private origin: string, private clock = Date.now) {}
  async quote(input: unknown, payer: unknown): Promise<Order> {
    const request = reportInput(input);
    const wallet = svmAddress(payer);
    invariant(wallet !== this.gateway.payTo, 'payer_is_merchant');
    const id = randomUUID();
    const now = this.clock();
    return this.store.create({ id, mode: this.mode, request, payer: wallet, requestDigest: digest(request),
      createdAt: now, expiresAt: now + 120000, state: 'quoted',
      resource: `${this.origin}/api/orders/${id}/report`, requirements: await this.gateway.requirements(await orderMemo(id, digest(request))) });
  }
  required(order: Order): PaymentRequired {
    return { x402Version: 2, resource: { url: order.resource, description: 'AgentPay procurement budget report', mimeType: 'application/json' }, accepts: [order.requirements] };
  }
  async purchase(id: string, body: unknown, header: string): Promise<Order> {
    let order = this.store.get(id);
    invariant(digest(reportInput(body)) === order.requestDigest, 'request_changed', 409);
    const payload = decodePaymentSignatureHeader(header);
    invariant(payload.x402Version === 2 && payload.resource?.url === order.resource, 'resource_mismatch', 409);
    invariant(canonical(payload.accepted) === canonical(order.requirements), 'payment_requirement_mismatch', 402);
    const identity = this.gateway.identity(payload);
    invariant(identity.payer === order.payer, 'payer_mismatch', 402);
    if (order.state !== 'quoted') {
      invariant(identity.paymentId === order.paymentId, 'order_payment_conflict', 409);
      return this.reconcile(id);
    }
    invariant(this.clock() < order.expiresAt, 'quote_expired', 409);
    const verified = await this.gateway.verify(payload, order.requirements);
    invariant(verified.isValid && verified.payer === order.payer, 'payment_invalid', 402);
    // Concurrent requests can verify; only one can acquire the durable settle claim.
    if (!this.store.claim(id, identity.paymentId, this.clock())) return this.store.get(id);
    try {
      const result = await this.gateway.settle(payload, order.requirements);
      // Even a failure response can represent ambiguous submission. Never reopen
      // this purchase or release its budget automatically after a settle attempt.
      if (!result.success || !result.transaction || result.network !== NETWORK || result.payer !== order.payer) {
        return this.store.update(id, o => { if (o.state === 'paid' || o.state === 'delivered') return; o.state = 'pending'; o.reason = 'settlement_unconfirmed'; });
      }
      order = this.store.update(id, o => { if (o.state === 'paid' || o.state === 'delivered') return; o.state = 'pending'; o.transaction = result.transaction; o.settlement = result; });
    } catch {
      return this.store.update(id, o => { if (o.state === 'paid' || o.state === 'delivered') return; o.state = 'pending'; o.reason = 'settlement_unknown'; });
    }
    return this.reconcile(order.id);
  }
  /** Read-only reconciliation; never re-signs, re-settles or creates a new purchase.
   * An operator can supply an observed tx after a timeout. Its message and token
   * deltas must match before the transaction is accepted. */
  async reconcile(id: string, observedTransaction?: string): Promise<Order> {
    let order = this.store.get(id);
    if (order.state === 'delivered' || order.state === 'rejected' || order.state === 'quoted') return order;
    if (order.state === 'paid') return this.deliver(id);
    const tx = order.transaction || observedTransaction;
    if (!tx) return this.store.update(id, o => { if (o.state === 'paid' || o.state === 'delivered') return; if (o.state === 'settling') o.state = 'pending'; o.reason = 'settlement_unknown'; });
    let evidence;
    try { evidence = await this.gateway.chain.check(order, tx); }
    catch { return this.store.get(id); }
    if (evidence.status !== 'confirmed') {
      // A mismatching operator-supplied transaction cannot poison the order.
      if (observedTransaction && !order.transaction) invariant(evidence.status !== 'rejected', 'observed_transaction_mismatch', 409);
      return this.store.update(id, o => {
        if (o.state === 'delivered' || o.state === 'paid') return;
        o.state = 'pending'; o.reason = evidence.reason || 'chain_pending';
      });
    }
    order = this.store.update(id, o => {
      if (o.state === 'delivered') return;
      o.state = 'paid'; o.transaction = tx;
      o.settlement = { success: true, network: NETWORK, payer: o.payer, transaction: tx };
      delete o.reason;
    });
    return this.deliver(order.id);
  }
  private deliver(id: string): Order {
    return this.store.update(id, order => {
      if (order.state === 'delivered') return;
      invariant(order.state === 'paid', 'payment_not_confirmed', 409);
      order.report = calculateReport(order.request);
      order.resultDigest = digest(order.report);
      order.state = 'delivered';
    });
  }
}
