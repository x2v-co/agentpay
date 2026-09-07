import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { registerAgentPayRoutes, purchaseService } from './agentpay.js';
import { startAgentPayReconciliationJob } from './reconciliation_job.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  registerAgentPayRoutes(app);
  app.use('/agentpay', express.static(path.resolve(here, '../../demo')));
  app.get('/', (_req, res) => res.redirect('/agentpay/'));
  return app;
}

export function startServer({ port = Number(process.env.PORT || 4021) } = {}) {
  if (!Object.hasOwn(process.env, 'AGENTPAY_RECORDED')) process.env.AGENTPAY_RECORDED = '1';
  const server = createApp().listen(port, () => console.log(`AgentPay reference server listening on http://127.0.0.1:${port}/agentpay/`));
  const reconciliation = startAgentPayReconciliationJob({ service: purchaseService });
  return { server, reconciliation };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
