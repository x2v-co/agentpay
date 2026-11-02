import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { OrderStore, ReportService, SvmGateway, Problem, invariant, digest, reportInput, type Order } from '../../packages/solana-report/src/index.js';
import { OfflineRail, OFFLINE_PAYER, OFFLINE_MERCHANT, fixtureHeader } from '../../packages/solana-report/src/offline.js';

export function createReportHttpServer(service: ReportService, origin: () => string, offline = false) {
  const token = randomBytes(32).toString('hex');
  const json = (res: ServerResponse, status: number, value: unknown, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(value));
  };
  const result = (res: ServerResponse, order: Order) => json(res, order.state === 'delivered' ? 200 : 202, order,
    order.state === 'delivered' && order.settlement ? { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(order.settlement) } : {});
  const server = createServer(async (req, res) => {
    try {
      invariant(req.headers.host === new URL(origin()).host, 'foreign_host', 403);
      invariant(!req.headers.origin || req.headers.origin === origin(), 'foreign_origin', 403);
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const path = new URL(req.url || '/', origin()).pathname;
      if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(path)) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        res.setHeader('content-type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'text/css');
        return res.end(readFileSync(new URL(file, import.meta.url)));
      }
      if (req.method === 'GET' && path === '/api/session') return json(res, 200, { token, mode: service.mode, payer: offline ? OFFLINE_PAYER : null, payTo: service.gateway.payTo });
      invariant(req.headers.authorization === `Bearer ${token}`, 'unauthorized', 401);
      if (req.method === 'POST' && path === '/api/orders') {
        const body = await readBody(req);
        return json(res, 201, await service.quote(body.input, body.payer));
      }
      const match = /^\/api\/orders\/([a-f0-9-]{36})(?:\/(report|reconcile|offline-payment))?$/.exec(path);
      invariant(match, 'not_found', 404);
      const [, id, action] = match;
      const order = service.store.get(id);
      if (req.method === 'GET' && !action) return json(res, 200, order);
      invariant(req.method === 'POST', 'method_not_allowed', 405);
      const body = await readBody(req);
      if (action === 'report') {
        invariant(digest(reportInput(body)) === order.requestDigest, 'request_changed', 409);
        const header = req.headers['payment-signature'];
        if (!header) {
          // Poll the authenticated order endpoint for completed/pending purchases.
          invariant(order.state === 'quoted', 'use_order_reconciliation', 409);
          invariant(Date.now() < order.expiresAt, 'quote_expired', 409);
          return json(res, 402, service.required(order), { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(service.required(order)) });
        }
        invariant(typeof header === 'string', 'invalid_payment_header');
        return result(res, await service.purchase(id, body, header));
      }
      if (action === 'reconcile') {
        invariant(body.transaction === undefined || (typeof body.transaction === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(body.transaction)), 'invalid_transaction_signature');
        return result(res, await service.reconcile(id, body.transaction));
      }
      if (action === 'offline-payment' && offline && service.mode === 'offline') {
        return result(res, await service.purchase(id, order.request, fixtureHeader(order)));
      }
      throw new Problem(404, 'not_found');
    } catch (error) {
      const known = error instanceof Problem;
      json(res, known ? error.status : 400, { error: known ? error.code : 'invalid_request', mode: service.mode });
    }
  });
  return { server, token };
}
async function readBody(req: IncomingMessage): Promise<any> {
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { bytes += chunk.length; invariant(bytes <= 16384, 'body_too_large', 413); chunks.push(chunk); }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  invariant(body && typeof body === 'object' && !Array.isArray(body), 'invalid_body');
  return body;
}
async function main() {
  const port = Number(process.env.SOLANA_DEMO_PORT || 4030);
  invariant(Number.isInteger(port) && port > 0 && port < 65536, 'invalid_port');
  const origin = `http://localhost:${port}`;
  const directory = resolve('.local/solana-report'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const store = new OrderStore(resolve(directory, 'offline.sqlite'), 'offline');
  const rail = new OfflineRail(); const gateway = new SvmGateway(rail, rail, OFFLINE_MERCHANT);
  await gateway.initialize();
  const service = new ReportService(store, gateway, 'offline', origin);
  const { server } = createReportHttpServer(service, () => origin, true);
  server.listen(port, 'localhost', () => console.log(`AgentPay OFFLINE simulation: ${origin} — no wallet, network payments or devnet evidence`));
  const close = () => server.close(() => { store.close(); process.exit(0); });
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
