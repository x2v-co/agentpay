import express from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createPublicClient, http, erc20Abi, encodeFunctionData, parseEventLogs } from 'viem';
import { monadTestnet } from 'viem/chains';
import { createAgentPay, createAiplansDiscovery, createX402PaymentSigner, signProcurementPolicy, signReservationIntent } from '@toolkit-fun/agentpay-sdk';
import { fileURLToPath } from 'node:url';

export const NETWORK = Object.freeze({ chainId: 10143, rpc: 'https://testnet-rpc.monad.xyz', merchant: 'https://staging.toolkit.fun', asset: '0x534b2f3A21130d7a60830c2Df862319e593943A3', payTo: '0x16E0e71068eb63140aEB56678d6840982b7AFbB1', permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3', maxAtomic: '100000' });
export const BASE_SOURCE = `function createCheckout() {
  const receipts = new Map(); let charges = 0;
  return {
    pay(key) { const receipt = { id: 'receipt-' + (++charges), key }; receipts.set(key, receipt); return receipt; },
    get charges() { return charges; }
  };
}`;
const PROMPT = `Fix this JavaScript checkout so retrying the same key returns the original receipt without a second charge. Different keys must still charge separately. Return ONLY plain JavaScript starting with function createCheckout(), no markdown, imports, exports, networking or explanations. Preserve the pay(key) and charges interface.\n${BASE_SOURCE}`;
const digest = value => createHash('sha256').update(value).digest('hex');
const serialize = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));
export function assertTestnetOffer(offer) {
  if (!offer || offer.network !== 'eip155:10143' || offer.fulfillment !== 'machine' || offer.asset.toLowerCase() !== NETWORK.asset.toLowerCase() || offer.payTo.toLowerCase() !== NETWORK.payTo.toLowerCase() || offer.providerSlug !== 'zhipu' || offer.modelSlug !== 'GLM-4.7-Flash' || BigInt(offer.x402MaxAtomic) > BigInt(NETWORK.maxAtomic) || offer.route !== '/api/agentpay/v1/models/zhipu/GLM-4.7-Flash/invoke') throw new Error('Offer does not match the pinned testnet purchase policy');
}
export function assertQuote(quote) {
  const q = quote?.accepts?.[0];
  if (!q || q.scheme !== 'upto' || q.network !== 'eip155:10143' || String(q.asset).toLowerCase() !== NETWORK.asset.toLowerCase() || String(q.payTo).toLowerCase() !== NETWORK.payTo.toLowerCase() || BigInt(q.amount) < 0n || BigInt(q.amount) > BigInt(NETWORK.maxAtomic) || q.extra?.assetTransferMethod !== 'permit2' || !Number.isInteger(q.maxTimeoutSeconds) || q.maxTimeoutSeconds <= 0 || q.maxTimeoutSeconds > 900) throw new Error('Payment quote is outside the pinned testnet limit');
}
export function walletTypedData(payload) {
  if (!['Policy', 'ReservationIntent', 'PermitWitnessTransferFrom'].includes(payload.primaryType) || Number(payload.domain?.chainId) !== NETWORK.chainId) throw new Error('Unsupported wallet signing request');
  const fields = [['name', 'string'], ['version', 'string'], ['chainId', 'uint256'], ['verifyingContract', 'address'], ['salt', 'bytes32']];
  return serialize({ ...payload, types: { EIP712Domain: fields.filter(([name]) => payload.domain[name] !== undefined).map(([name, type]) => ({ name, type })), ...payload.types } });
}
export function createOperatorApp({ port, fetcher = fetch, rpc = createPublicClient({ chain: monadTestnet, transport: http(NETWORK.rpc) }) }) {
  const app = express();
  const token = randomBytes(24).toString('hex');
  const session = { status: 'idle', events: [], wallet: null, pending: null, evidence: null };
  let privateProgress = null, client = null, purchaseId = null, resolveSignature = null, rejectSignature = null, signatureTimer = null;
  const log = message => session.events.push({ at: new Date().toISOString(), message });
  app.use((req, res, next) => {
    const actualPort = typeof port === 'function' ? port() : port;
    const origin = `http://127.0.0.1:${actualPort}`;
    if (req.headers.host !== `127.0.0.1:${actualPort}`) return res.status(403).json({ error: 'Loopback host required' });
    res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'");
    if (req.path.startsWith('/api/') && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origin))) return res.status(403).json({ error: 'Same-origin request required' });
    if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['x-operator-token'] !== token)) return res.status(403).json({ error: 'Operator session required' });
    next();
  });
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/session', (_req, res) => res.json({ token, network: NETWORK, baseline: BASE_SOURCE, ...session }));
  app.get('/api/state', (_req, res) => res.json(session));
  app.get('/evaluate-worker.js', (_req, res) => {
    res.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'");
    res.sendFile(fileURLToPath(new URL('./evaluate-worker.js', import.meta.url)));
  });
  const requestSignature = payload => new Promise((resolve, reject) => {
    const id = randomUUID();
    session.pending = { id, typedData: walletTypedData(payload) };
    resolveSignature = resolve; rejectSignature = reject;
    log(`Awaiting wallet signature: ${payload.primaryType}`);
    signatureTimer = setTimeout(() => { session.pending = null; resolveSignature = null; rejectSignature = null; reject(new Error('Wallet signature timed out. No automatic retry.')); }, 180000);
  });
  app.post('/api/signature', (req, res) => {
    if (!session.pending || req.body.id !== session.pending.id) return res.status(409).json({ error: 'No matching signature request' });
    if (!req.body.error && !/^0x[0-9a-fA-F]{130}$/.test(req.body.signature || '')) return res.status(400).json({ error: 'Invalid wallet signature format' });
    clearTimeout(signatureTimer);
    const resolve = resolveSignature, reject = rejectSignature;
    session.pending = null; resolveSignature = null; rejectSignature = null;
    if (req.body.error) reject(new Error('Wallet signature declined')); else resolve(req.body.signature);
    res.json({ ok: true });
  });
  async function balances(wallet) {
    return { balance: String(await rpc.readContract({ address: NETWORK.asset, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] })), allowance: String(await rpc.readContract({ address: NETWORK.asset, abi: erc20Abi, functionName: 'allowance', args: [wallet, NETWORK.permit2] })), gas: String(await rpc.getBalance({ address: wallet })) };
  }
  app.post('/api/preflight', async (req, res) => {
    try {
      const wallet = req.body.wallet;
      if (!/^0x[0-9a-fA-F]{40}$/.test(wallet || '')) throw new Error('Connect a wallet first');
      const response = await fetcher(`${NETWORK.merchant}/api/agentpay/v1/readiness`, { signal: AbortSignal.timeout(20000) });
      const ready = await response.json();
      if (!response.ok || ready.mode !== 'live-capable' || !ready.ok || ready.provider?.mode !== 'zhipu') throw new Error('Merchant is not ready for live provider execution');
      const funds = await balances(wallet);
      res.json({ ...funds, ready: true, approval: { from: wallet, to: NETWORK.asset, value: '0x0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [NETWORK.permit2, BigInt(NETWORK.maxAtomic)] }) } });
    } catch (error) { res.status(422).json({ error: error.message }); }
  });
  async function collectEvidence() {
    if (!privateProgress) throw new Error('No reservation recovery token available; do not issue a second purchase');
    const reconciliation = await client.getReconciliation({ purchaseId, progressToken: privateProgress });
    if (reconciliation.state !== 'matched') { session.status = 'pending'; log(`Settlement remains ${reconciliation.state}`); return; }
    const resultResponse = await fetcher(`${NETWORK.merchant}/api/agentpay/v1/purchases/${purchaseId}/result`, { headers: { authorization: `Bearer ${privateProgress}` }, signal: AbortSignal.timeout(20000) });
    if (!resultResponse.ok) throw new Error('Matched purchase result not yet available');
    const result = await resultResponse.json();
    const proofId = result.proofId || result.receipt?.proofId;
    if (!/^proof_[a-z0-9]+$/i.test(proofId || '')) throw new Error('No public proof ID returned');
    const proofUrl = `${NETWORK.merchant}/api/agentpay/v1/proofs/${proofId}`;
    const proofResponse = await fetcher(proofUrl, { signal: AbortSignal.timeout(20000) });
    const proof = await proofResponse.json();
    if (!proofResponse.ok || proof.purchaseId !== purchaseId || proof.state !== 'matched' || proof.model !== 'zhipu/GLM-4.7-Flash' || BigInt(proof.actualAtomic) > BigInt(NETWORK.maxAtomic)) throw new Error('Public proof does not match this purchase');
    const chainReceipt = await rpc.getTransactionReceipt({ hash: proof.txHash });
    const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: chainReceipt.logs });
    const matched = chainReceipt.status === 'success' && transfers.some(t => t.address.toLowerCase() === NETWORK.asset.toLowerCase() && t.args.from.toLowerCase() === session.wallet.toLowerCase() && t.args.to.toLowerCase() === NETWORK.payTo.toLowerCase() && t.args.value === BigInt(proof.actualAtomic));
    if (!matched) throw new Error('Independent Monad transfer validation failed');
    if (typeof result.output !== 'string' || !result.output.trim() || result.output.length > 30000) throw new Error('Provider returned no bounded repair source');
    session.evidence = { schema: 'agentpay.live-repair.v1', purchaseId, checkedAt: new Date().toISOString(), wallet: session.wallet, request: { prompt: PROMPT, inputEstimate: 2048, outputCap: 1024 }, baseline: BASE_SOURCE, rawOutput: result.output, outputSha256: digest(result.output), proofUrl, proof, chainVerified: true, tests: null, completed: false };
    session.status = 'paid-awaiting-tests';
    log('Provider output recovered; public proof and independent Monad transfer matched. Run isolated tests next.');
  }
  async function run(wallet) {
    try {
      const readyResponse = await fetcher(`${NETWORK.merchant}/api/agentpay/v1/readiness`, { signal: AbortSignal.timeout(20000) });
      const ready = await readyResponse.json();
      if (!readyResponse.ok || !ready.ok || ready.mode !== 'live-capable' || ready.provider?.mode !== 'zhipu') throw new Error('Live provider readiness failed');
      const funds = await balances(wallet);
      if (BigInt(funds.balance) < BigInt(NETWORK.maxAtomic) || BigInt(funds.allowance) < BigInt(NETWORK.maxAtomic)) throw new Error('At least 0.1 test USDC balance and Permit2 allowance are required');
      const discovery = createAiplansDiscovery({ toolkitBaseUrl: NETWORK.merchant, baseUrl: 'https://aiplans.dev' });
      const offers = await discovery.listOffers();
      const offer = offers.find(o => o.offerId === 'toolkit-zhipu-glm-flash');
      assertTestnetOffer(offer);
      const policy = { schema: 'agentpay.policy.v1', policyId: `0x${randomBytes(32).toString('hex')}`, owner: wallet, agentWallet: wallet, chainId: NETWORK.chainId, asset: NETWORK.asset, maxTotalAtomic: NETWORK.maxAtomic, maxPerRequestAtomic: NETWORK.maxAtomic, allowedPayTo: [NETWORK.payTo], allowedModels: ['zhipu/GLM-4.7-Flash'], validUntil: Math.floor(Date.now() / 1000) + 900 };
      const signer = { address: wallet, signTypedData: requestSignature };
      log('Checkpoint and public repair prompt prepared. Owner and agent use the connected wallet in this operator-assisted run.');
      const policySignature = await signProcurementPolicy(policy, signer);
      const signedFetch = async (url, init) => {
        const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(45000) });
        if (String(url).endsWith('/reservations') && response.ok) privateProgress = (await response.clone().json()).progressToken;
        return response;
      };
      client = createAgentPay({ policy, policySignature, discovery, baseUrl: NETWORK.merchant, fetch: signedFetch });
      const signPayment = await createX402PaymentSigner({ signer, rpcUrl: NETWORK.rpc });
      const purchase = await client.buy({ purchaseId, policyId: policy.policyId, offer, body: { prompt: PROMPT }, inputTokens: 2048, outputCap: 1024, signReservation: intent => signReservationIntent(intent, signer), signPayment: quote => { assertQuote(quote); return signPayment(quote); }, waitForSettlement: true, settlementTimeoutMs: 45000 });
      privateProgress = purchase.reservation.progressToken || privateProgress;
      if (purchase.status === 'pending') { session.status = 'pending'; log('Settlement pending; reconcile this purchase, not a new one.'); return; }
      await collectEvidence();
    } catch (error) { session.status = privateProgress ? 'pending' : 'stopped'; log(`Stopped: ${error.message}`); }
  }
  app.post('/api/start', (req, res) => {
    if (session.status !== 'idle') return res.status(409).json({ error: 'One purchase per operator session. Existing purchase must be reconciled, not repeated.' });
    if (req.body.consent !== true || req.body.baselinePassed !== false || !/^0x[0-9a-fA-F]{40}$/.test(req.body.wallet || '')) return res.status(400).json({ error: 'Wallet, failed baseline and explicit testnet consent required' });
    session.wallet = req.body.wallet; purchaseId = randomUUID(); session.purchaseId = purchaseId; session.status = 'running';
    log(`New purchase ${purchaseId}; maximum 0.1 test USDC; no private key received.`);
    void run(session.wallet);
    res.json({ ok: true, purchaseId });
  });
  app.post('/api/reconcile', async (_req, res) => {
    if (!client || !privateProgress || session.status !== 'pending') return res.status(409).json({ error: 'No pending purchase to reconcile' });
    session.status = 'reconciling';
    try { await collectEvidence(); res.json({ ok: true }); }
    catch (error) { session.status = 'pending'; log(error.message); res.status(422).json({ error: error.message }); }
  });
  app.post('/api/tests', (req, res) => {
    if (!session.evidence || !['paid-awaiting-tests', 'complete', 'test-failed'].includes(session.status)) return res.status(409).json({ error: 'No matched provider output' });
    const tests = req.body.tests;
    if (!Array.isArray(tests) || tests.length !== 3 || tests.some(t => typeof t.pass !== 'boolean')) return res.status(400).json({ error: 'Three test results required' });
    session.evidence.tests = tests.map((t, i) => ({ name: ['First request', 'Distinct keys', 'Retry reuses receipt'][i], pass: t.pass }));
    session.evidence.testEnvironment = 'Operator browser Web Worker with network blocked; owner-reported test results, not a cryptographic test attestation';
    session.evidence.completed = tests.every(t => t.pass);
    session.status = session.evidence.completed ? 'complete' : 'test-failed';
    log(session.evidence.completed ? 'Generated provider output passed all three local tests.' : 'Paid model output failed acceptance. No replacement or automatic repurchase.');
    res.json({ ok: true });
  });
  app.use(express.static(fileURLToPath(new URL('./', import.meta.url)), { index: 'index.html', dotfiles: 'deny' }));
  app.use((error, _req, res, _next) => res.status(400).json({ error: 'Invalid operator request' }));
  return { app, dispose: () => { clearTimeout(signatureTimer); if (rejectSignature) rejectSignature(new Error('Operator stopped')); } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.OPERATOR_PORT || 4022);
  const { app } = createOperatorApp({ port });
  app.listen(port, '127.0.0.1', () => console.log(`AgentPay wallet operator: http://127.0.0.1:${port}/ (testnet only; no purchase until explicitly started)`));
}
