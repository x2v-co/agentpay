import assert from 'node:assert/strict';
import { createApp } from '../apps/reference-server/src/index.js';
import { agentPayDemoState } from '../apps/reference-server/src/agentpay.js';

process.env.AGENTPAY_RECORDED = '1';
const app = createApp();
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));

try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const manifest = await (await fetch(`${base}/.well-known/agentpay.json`)).json();
  assert.equal(manifest.service, 'AgentPay');
  assert.equal(manifest.network.paymentScheme, 'upto');
  assert.equal(manifest.links.product, 'https://toolkit.fun');
  assert.equal(manifest.links.modelDiscovery, 'https://aiplans.dev');

  const offer = agentPayDemoState().offers.find((item) => item.fulfillment === 'machine');
  assert.ok(offer.validUntil > Math.floor(Date.now() / 1000));
  const purchaseId = '550e8400-e29b-41d4-a716-446655440099';
  const request = { prompt: 'Run the public AgentPay reference flow' };
  const reservationResponse = await fetch(`${base}/api/agentpay/v1/policies/demo-policy/reservations`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ purchaseId, offerId: offer.offerId, request }),
  });
  assert.equal(reservationResponse.status, 200);
  const reservation = await reservationResponse.json();
  const quote = await fetch(`${base}${offer.route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agentpay-purchase-id': purchaseId }, body: JSON.stringify(request) });
  assert.equal(quote.status, 402);
  const paid = await fetch(`${base}${offer.route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agentpay-purchase-id': purchaseId,
      'x-agentpay-reservation': reservation.reservationReceipt.reservationId,
      'x-agentpay-request-digest': reservation.reservationReceipt.requestDigest,
      'x-agentpay-progress-token': reservation.progressToken,
      'payment-signature': 'recorded-fixture',
    },
    body: JSON.stringify(request),
  });
  const paidText = await paid.text();
  assert.equal(paid.status, 200, paidText);
  const proof = JSON.parse(paidText);
  assert.equal(proof.receipt.status, 'paid');
  assert.equal(proof.purchaseId, purchaseId);
  const publicProof = await (await fetch(`${base}/api/agentpay/v1/proofs/${proof.proofId}`)).json();
  assert.ok(publicProof.usage.inputTokens > 0);
  assert.ok(publicProof.usage.outputTokens > 0);
  assert.equal(publicProof.usage.totalTokens, publicProof.usage.inputTokens + publicProof.usage.outputTokens);
  assert.equal(JSON.stringify(publicProof).includes(request.prompt), false);
} finally {
  server.close();
}

console.log('reference server test: ok');
