import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReportHttpServer, readBody } from './server.js';
import { OrderStore, ReportService, Problem, invariant, svmAddress, SvmGateway } from '../../packages/solana-report/src/index.js';
import { createDevnetGateway } from '../../packages/solana-report/src/devnet.js';
import { publicReadiness, walletReadiness, publicRpc, assertReadMethod, type RpcRead } from '../../packages/solana-report/src/readiness.js';
import { FACILITATOR_URL, RPC_URL, NETWORK, MINT, PRICE } from '../../packages/solana-report/src/constants.js';

export function createHandoffServer(options: { origin: () => string; dbPath: string; rpc?: RpcRead; fetcher?: typeof fetch; gatewayFactory?: (payTo: string) => SvmGateway }) {
  const token = randomBytes(32).toString('hex');
  const rpc = options.rpc || publicRpc();
  let configured: Server | undefined; let store: OrderStore | undefined; let merchant: string | undefined;
  let readiness: Awaited<ReturnType<typeof publicReadiness>> | undefined;
  let configuring = false;
  const server = createServer(async (req, res) => {
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const origin = options.origin();
      invariant(req.headers.host === new URL(origin).host, 'foreign_host', 403);
      invariant(!req.headers.origin || req.headers.origin === origin, 'foreign_origin', 403);
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const path = new URL(req.url || '/', origin).pathname;
      if (req.method === 'GET' && ['/', '/wallet.bundle.js', '/style.css'].includes(path)) {
        const file = path === '/' ? 'wallet.html' : path.slice(1);
        res.setHeader('content-type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'text/css');
        return res.end(readFileSync(new URL(file, import.meta.url)));
      }
      if (req.method === 'GET' && path === '/api/session') return json(200, { token, mode: 'devnet-handoff', network: NETWORK, mint: MINT, amountAtomic: PRICE, merchant, readiness: readiness || null });
      // SDK read-only RPC proxy: unguessable per-process token, never persisted.
      if (req.method === 'POST' && path === `/api/rpc/${token}`) {
        const body = await readBody(req);
        assertReadMethod(body.method);
        const result = await rpc(body.method, body.params || []);
        return json(200, { jsonrpc: '2.0', id: body.id, result });
      }
      invariant(req.headers.authorization === `Bearer ${token}`, 'unauthorized', 401);
      if (req.method === 'POST' && path === '/api/readiness') {
        readiness = await publicReadiness(rpc, options.fetcher);
        return json(200, readiness);
      }
      if (req.method === 'POST' && path === '/api/configure') {
        const body = await readBody(req); const payTo = svmAddress(body.payTo); const payer = svmAddress(body.payer);
        invariant(!configuring, 'configuration_in_progress', 409);
        invariant(!merchant || merchant === payTo, 'merchant_locked_for_session', 409);
        configuring = true;
        try {
          readiness = await publicReadiness(rpc, options.fetcher);
          const accounts = await walletReadiness(rpc, payer, payTo);
          if (!configured) {
            const gateway = options.gatewayFactory?.(payTo) || createDevnetGateway({ allowNetwork: true, facilitatorUrl: FACILITATOR_URL, rpcUrl: RPC_URL, payTo });
            await gateway.initialize(); // /supported only; no verify/settle.
            store = new OrderStore(options.dbPath, 'devnet');
            const service = new ReportService(store, gateway, 'devnet', origin);
            configured = createReportHttpServer(service, options.origin, false, token).server;
            merchant = payTo;
          }
          return json(200, { readiness, accounts });
        } finally { configuring = false; }
      }
      invariant(configured, 'configure_wallet_and_merchant_first', 409);
      // Only a user's explicit signed HTTP request can enter the payment route.
      // No server startup, readiness, configure or reconcile action submits payment.
      return configured.emit('request', req, res);
    } catch (error) { json(error instanceof Problem ? error.status : 503, { error: error instanceof Problem ? error.code : 'readiness_or_request_failed' }); }
  });
  server.on('close', () => store?.close());
  return { server, token };
}
async function main() {
  const port = Number(process.env.SOLANA_HANDOFF_PORT || 4031);
  invariant(Number.isInteger(port) && port > 0 && port < 65536, 'invalid_port');
  const origin = `http://localhost:${port}`;
  const directory = resolve('.local/solana-report'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const { server } = createHandoffServer({ origin: () => origin, dbPath: resolve(directory, 'devnet.sqlite') });
  server.listen(port, 'localhost', () => console.log(`AgentPay DEVNET wallet handoff: ${origin} — user must connect, sign, then explicitly submit; no automatic payment`));
  const close = () => server.close(() => process.exit(0)); process.once('SIGINT', close); process.once('SIGTERM', close);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
