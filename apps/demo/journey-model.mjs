export const TRACE = Object.freeze({
  model: 'GLM-4.7-Flash', input: 17, output: 256, inputEstimate: 1024, outputCap: 256,
  inputRate: 2, outputRate: 8, ceiling: 100000, actual: 1,
  proof: 'https://staging.toolkit.fun/api/agentpay/v1/proofs/proof_97ae4853f5eb26ee',
  tx: 'https://testnet.monadexplorer.com/tx/0xc1b583605f251c6141597bbe896406491e9ab08b0e57f3d32eaeca43cf263ed2',
});
export const STEPS = ['hire', 'work', 'market', 'connect', 'delivery'];
export function freshState() {
  return { version: 1, step: 'hire', budget: 5000000, mode: 'auto', hired: false,
    checkpoint: false, approved: false, denied: false, paymentDone: false, tested: false, accepted: false, runId: null };
}
export function decision(s) {
  if (s.budget < TRACE.ceiling) return 'budget-blocked';
  if (s.mode === 'ask' && !s.approved) return s.denied ? 'denied' : 'approval-required';
  return 'allowed';
}
export function accessibleStep(step, s) {
  if (!STEPS.includes(step)) return 'hire';
  if (step === 'hire') return step;
  if (!s.hired) return 'hire';
  if (step === 'work') return step;
  if (!s.checkpoint) return 'work';
  if (step === 'market') return step;
  if (decision(s) !== 'allowed') return 'market';
  if (step === 'delivery' && !s.paymentDone) return 'connect';
  return step;
}
export function restoreState(raw) {
  try {
    const s = JSON.parse(raw);
    if (s?.version !== 1 || ![10000, 500000, 5000000, 25000000].includes(s.budget) || !['auto', 'ask'].includes(s.mode)) return freshState();
    const clean = freshState();
    for (const k of ['hired','checkpoint','approved','denied','paymentDone','tested','accepted']) clean[k] = s[k] === true;
    clean.budget = s.budget; clean.mode = s.mode;
    clean.runId = typeof s.runId === 'string' && /^[a-z0-9-]{1,40}$/i.test(s.runId) ? s.runId : null;
    clean.step = accessibleStep(s.step, clean);
    return clean;
  } catch { return freshState(); }
}
// Executable teaching fixture, independent of the historical provider output.
export function createCheckout(fixed) {
  const receipts = new Map();
  let charges = 0;
  return {
    pay(key) {
      if (fixed && receipts.has(key)) return receipts.get(key);
      const receipt = { id: `receipt-${++charges}`, key };
      receipts.set(key, receipt);
      return receipt;
    },
    get charges() { return charges; },
  };
}
export function runCheckoutTests(fixed) {
  const first = createCheckout(fixed); const receipt = first.pay('order-418');
  const distinct = createCheckout(fixed); distinct.pay('order-a'); distinct.pay('order-b');
  const retry = createCheckout(fixed); const initial = retry.pay('order-418'); const repeated = retry.pay('order-418');
  return [
    { name: 'A first request creates a receipt', pass: receipt.id === 'receipt-1' && first.charges === 1 },
    { name: 'Different orders create separate charges', pass: distinct.charges === 2 },
    { name: 'Retry returns the original receipt, without charging twice', pass: repeated === initial && retry.charges === 1 },
  ];
}
export const FIX_SOURCE = `// AgentPay teaching fixture: in-memory, synchronous idempotency.
// Not production payment code. Durable storage and concurrent request handling
// are required for a production integration.
export function createCheckout() {
  const receipts = new Map();
  let charges = 0;
  return {
    pay(key) {
      if (receipts.has(key)) return receipts.get(key);
      const receipt = { id: 'receipt-' + (++charges), key };
      receipts.set(key, receipt);
      return receipt;
    },
    get charges() { return charges; }
  };
}
`;
