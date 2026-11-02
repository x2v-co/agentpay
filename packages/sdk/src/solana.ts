import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentPayload, PaymentRequired } from '@x402/core/types';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import type { ClientSvmSigner } from '@x402/svm';
import { MINT, NETWORK, PRICE, atomic, canonical, invariant, svmAddress, type Order, type ReportInput } from '../../solana-report/src/model.js';

export function createSvmPayloadFactory(signer: ClientSvmSigner, rpcUrl: string) {
  const client = new x402Client().register(NETWORK, new ExactSvmScheme(signer, { rpcUrl }));
  return (required: PaymentRequired): Promise<PaymentPayload> => client.createPaymentPayload(required);
}

/** Attended fixed-price client. Signer is injected; no key loading or implicit
 * wallet connection. Server independently enforces a durable per-payer budget. */
export class BudgetReportClient {
  private attempts = new Map<string, Promise<Order>>();
  private reserved = new Map<string, bigint>();
  constructor(private options: {
    baseUrl: string; token: string; payer: string; payTo: string;
    maxPerRequestAtomic: string; maxTotalAtomic: string;
    createPayload: (required: PaymentRequired) => Promise<PaymentPayload>;
    fetch: typeof fetch;
  }) {
    svmAddress(options.payer); svmAddress(options.payTo);
    atomic(options.maxPerRequestAtomic); atomic(options.maxTotalAtomic);
  }
  private headers() { return { 'content-type': 'application/json', authorization: `Bearer ${this.options.token}` }; }
  async quote(input: ReportInput): Promise<Order> {
    const response = await this.options.fetch(`${this.options.baseUrl}/api/orders`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ input, payer: this.options.payer }) });
    invariant(response.ok, 'quote_failed', response.status);
    return response.json() as Promise<Order>;
  }
  purchase(order: Order): Promise<Order> {
    // Reusing the same client/order never invokes the signer a second time.
    const prior = this.attempts.get(order.id);
    if (prior) return prior;
    const attempt = this.perform(order);
    this.attempts.set(order.id, attempt);
    return attempt;
  }
  private async perform(order: Order): Promise<Order> {
    const expectedResource = `${this.options.baseUrl}/api/orders/${order.id}/report`;
    invariant(order.resource === expectedResource && order.payer === this.options.payer, 'untrusted_order');
    invariant(Date.now() < order.expiresAt, 'quote_expired');
    const quote = await this.options.fetch(expectedResource, { method: 'POST', headers: this.headers(), body: JSON.stringify(order.request) });
    invariant(quote.status === 402 && quote.headers.has('PAYMENT-REQUIRED'), 'missing_payment_required');
    const required = decodePaymentRequiredHeader(quote.headers.get('PAYMENT-REQUIRED')!);
    const req = required.accepts[0];
    invariant(required.x402Version === 2 && required.resource.url === expectedResource && required.accepts.length === 1, 'untrusted_resource');
    invariant(req.scheme === 'exact' && req.network === NETWORK && req.asset === MINT && req.payTo === this.options.payTo && req.amount === PRICE, 'untrusted_payment_requirement');
    invariant(canonical(req) === canonical(order.requirements), 'quote_changed');
    const amount = BigInt(atomic(req.amount));
    const reserved = [...this.reserved.values()].reduce((a, b) => a + b, 0n);
    invariant(amount <= BigInt(this.options.maxPerRequestAtomic) && amount + reserved <= BigInt(this.options.maxTotalAtomic), 'client_budget_exceeded');
    this.reserved.set(order.id, amount);
    let payload: PaymentPayload;
    try { payload = await this.options.createPayload(required); }
    catch (error) { this.reserved.delete(order.id); throw error; }
    invariant(payload.resource?.url === expectedResource && canonical(payload.accepted) === canonical(req), 'signer_payload_mismatch');
    // A failed transport after this point is uncertain. Keep the reservation and
    // use reconcile(), never automatically sign or submit a replacement payment.
    const response = await this.options.fetch(expectedResource, { method: 'POST', headers: { ...this.headers(), 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) }, body: JSON.stringify(order.request) });
    invariant(response.ok, 'purchase_failed_reconcile_same_order', response.status);
    return response.json() as Promise<Order>;
  }
  async reconcile(orderId: string): Promise<Order> {
    const response = await this.options.fetch(`${this.options.baseUrl}/api/orders/${encodeURIComponent(orderId)}/reconcile`, { method: 'POST', headers: this.headers(), body: '{}' });
    invariant(response.ok, 'reconciliation_failed', response.status);
    return response.json() as Promise<Order>;
  }
}
