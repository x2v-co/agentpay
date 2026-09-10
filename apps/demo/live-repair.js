const el = id => document.getElementById(id);
async function loadEvidence() {
  const response = await fetch('./assets/live-repair.json');
  if (!response.ok) throw new Error('Evidence unavailable');
  const e = await response.json();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(e.rawOutput))), x => x.toString(16).padStart(2, '0')).join('');
  if (!e.completed || !e.chainVerified || e.proof.state !== 'matched' || e.proof.purchaseId !== e.purchaseId || digest !== e.outputSha256 || e.proof.actualAtomic !== '33' || e.proof.usage.totalTokens !== 220 || e.tests.length !== 3 || !e.tests.every(t => t.pass)) throw new Error('Evidence consistency check failed');
  el('before').textContent = e.baseline;
  el('after').textContent = e.rawOutput;
  el('digest').textContent = digest;
  el('purchase').textContent = e.purchaseId;
  el('transaction').textContent = e.proof.txHash;
  for (const t of e.tests) { const li = document.createElement('li'); li.className = 'pass'; li.textContent = `PASS / ${t.name}`; el('results').append(li); }
  el('public-proof').href = `https://staging.toolkit.fun/api/agentpay/v1/proofs/${encodeURIComponent(e.proof.proofId)}`;
  el('chain').href = `https://testnet.monadexplorer.com/tx/${encodeURIComponent(e.proof.txHash)}`;
  el('verification').textContent = 'Saved evidence loaded; output digest verified in this browser.';
}
loadEvidence().catch(() => { el('verification').textContent = 'Evidence could not be verified. Do not treat this page as a completed acceptance report.'; });
