const byId = id => document.getElementById(id);
const wallets = [];
let provider, wallet, config, current, funding, baselineFailed = false, busy = false;
const request = async (route, body) => {
  const response = await fetch(`/api/${route}`, body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-operator-token': config.token }, body: JSON.stringify(body) } : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed'); return result;
};
function refreshWallets() {
  const select = byId('wallet-choice'); select.replaceChildren();
  for (const [index, entry] of wallets.entries()) { const option = new Option(entry.name, index); select.add(option); }
  if (!wallets.length) select.add(new Option('No browser wallet detected', ''));
  byId('connect').disabled = !wallets.length;
}
window.addEventListener('eip6963:announceProvider', event => {
  if (!event.detail?.provider || wallets.some(w => w.provider === event.detail.provider)) return;
  wallets.push({ name: event.detail.info.name, provider: event.detail.provider }); refreshWallets();
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
setTimeout(() => { if (!wallets.length && window.ethereum) wallets.push({ name: 'Browser wallet', provider: window.ethereum }); refreshWallets(); }, 500);
function renderTests(id, tests) { const root = byId(id); root.replaceChildren(); for (const test of tests) { const line = document.createElement('div'); line.className = `test ${test.pass ? 'pass' : 'fail'}`; line.textContent = `${test.pass ? 'PASS' : 'FAIL'} / ${test.name}`; root.append(line); } }
function isolatedTests(source) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./evaluate-worker.js');
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Generated code exceeded the 2-second test limit')); }, 2000);
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    worker.onmessage = event => { finish(); if (event.data.error) reject(new Error(event.data.error)); else if (Array.isArray(event.data.tests) && event.data.tests.length === 3) resolve(event.data.tests); else reject(new Error('Invalid test report')); };
    worker.onerror = () => { finish(); reject(new Error('Isolated worker failed')); };
    worker.postMessage({ source });
  });
}
async function assertWallet() {
  if (!provider || !wallet) throw new Error('Connect a wallet first');
  if (Number(await provider.request({ method: 'eth_chainId' })) !== config.network.chainId) throw new Error('Switch the wallet to Monad Testnet first');
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!accounts.some(a => a.toLowerCase() === wallet.toLowerCase())) throw new Error('Connected account changed; reconnect');
  if (current?.wallet && current.wallet.toLowerCase() !== wallet.toLowerCase()) throw new Error('This purchase belongs to a different wallet');
}
function buttons() {
  byId('start').disabled = busy || current?.status !== 'idle' || !baselineFailed || !funding || BigInt(funding.balance) < 100000n || BigInt(funding.allowance) < 100000n || !byId('consent').checked;
  byId('preflight').disabled = busy || !wallet;
  byId('approve').disabled = busy || !funding || BigInt(funding.allowance) >= 100000n || current?.status !== 'idle';
}
async function status() {
  current = await request('state');
  byId('run-status').textContent = current.status;
  byId('events').textContent = current.events.map(e => `${e.at} ${e.message}`).join('\n');
  byId('signing').hidden = !current.pending;
  if (current.pending) { byId('signature-title').textContent = current.pending.typedData.primaryType; byId('typed-data').textContent = JSON.stringify(current.pending.typedData, null, 2); }
  byId('reconcile').disabled = busy || current.status !== 'pending';
  byId('test-output').disabled = busy || !current.evidence;
  byId('download').disabled = !current.evidence;
  if (current.evidence) {
    byId('output').textContent = current.evidence.rawOutput;
    if (current.evidence.tests) renderTests('output-tests', current.evidence.tests);
    const root = byId('proof-links'); root.replaceChildren();
    for (const [label, href] of [['Public proof', current.evidence.proofUrl], ['Monad transaction', `https://testnet.monadexplorer.com/tx/${current.evidence.proof.txHash}`]]) { const a = document.createElement('a'); a.textContent = `${label} `; a.href = href; a.target = '_blank'; a.rel = 'noopener'; root.append(a); }
  }
  buttons();
}
function action(id, fn) { byId(id).onclick = async () => { if (busy) return; busy = true; buttons(); try { await fn(); } catch (error) { byId('wallet-status').textContent = error.shortMessage || error.message; } finally { busy = false; await status().catch(() => {}); } }; }
action('connect', async () => {
  provider = wallets[Number(byId('wallet-choice').value)]?.provider;
  if (!provider) throw new Error('Install or enable an Ethereum browser wallet');
  const accounts = await provider.request({ method: 'eth_requestAccounts' }); wallet = accounts[0];
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] }); }
  catch (error) { if (error.code !== 4902) throw error; await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x279f', chainName: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: [config.network.rpc], blockExplorerUrls: ['https://testnet.monadexplorer.com'] }] }); }
  await assertWallet(); byId('wallet-status').textContent = wallet; funding = null;
});
action('preflight', async () => { await assertWallet(); funding = await request('preflight', { wallet }); byId('funds').textContent = `${Number(funding.balance) / 1e6} test USDC / ${Number(funding.allowance) / 1e6} allowed; ${Number(funding.gas) / 1e18} MON gas`; });
action('approve', async () => {
  await assertWallet();
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [funding.approval] });
  byId('wallet-status').textContent = `Approval submitted: ${hash}. Check readiness again after confirmation.`;
  funding = null;
});
action('baseline-run', async () => { const tests = await isolatedTests(config.baseline); renderTests('baseline-tests', tests); baselineFailed = tests[0].pass && tests[1].pass && !tests[2].pass; });
action('start', async () => { await assertWallet(); await request('start', { wallet, consent: byId('consent').checked, baselinePassed: !baselineFailed }); });
action('sign', async () => {
  await assertWallet();
  const pending = current.pending; if (!pending) return;
  try {
    const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [wallet, JSON.stringify(pending.typedData)] });
    await request('signature', { id: pending.id, signature });
  } catch (error) { await request('signature', { id: pending.id, error: true }); throw error; }
});
action('decline', async () => { if (current.pending) await request('signature', { id: current.pending.id, error: true }); });
action('reconcile', async () => { await request('reconcile', {}); });
action('test-output', async () => {
  let tests;
  try { tests = await isolatedTests(current.evidence.rawOutput); }
  catch (error) { tests = ['First request', 'Distinct keys', 'Retry reuses receipt'].map(name => ({ name, pass: false })); byId('wallet-status').textContent = error.message; }
  renderTests('output-tests', tests); await request('tests', { tests });
});
action('download', async () => { const url = URL.createObjectURL(new Blob([JSON.stringify(current.evidence, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `agentpay-${current.evidence.purchaseId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
byId('consent').onchange = buttons;
(async () => { config = await request('session'); byId('baseline').textContent = config.baseline; await status(); const poll = async () => { try { if (!busy) await status(); } catch { byId('run-status').textContent = 'Local server disconnected. Do not create another purchase.'; } setTimeout(poll, 1200); }; setTimeout(poll, 1200); })().catch(error => { byId('run-status').textContent = error.message; });
