import { TRACE } from './journey-model.mjs';

const money = n => (n / 1e6).toFixed(6);
const stages = s => [
  { title: 'Commission', actor: 'YOU', kind: 'Your decision', step: 'hire',
    summary: `${money(s.budget)} USDC budget`, heading: 'You gave it a job and a boundary.',
    copy: `Fix the duplicate charge. Your task budget was ${money(s.budget)} USDC, with ${s.mode === 'auto' ? 'autonomous purchases inside the policy' : 'your approval required before procurement'}. No funds were deposited in this simulation.`,
    artifact: 'TASK #418 / RETRY-SAFE CHECKOUT', value: `${money(s.budget)} USDC`, caption: 'Task budget, not a fee or a payment' },
  { title: 'Checkpoint', actor: 'KITE-07', kind: 'Local executable test', step: 'work',
    summary: 'Failure reproduced; work saved', heading: 'The task stopped. The work survived.',
    copy: 'The baseline produced two charges for a retried order. KITE-07 saved the failing test and task context before the scripted scenario requested another inference. This is not a measured token balance.',
    artifact: 'CHECKOUT BASELINE', value: '2 pass / 1 fail', caption: 'The retry test exposed the duplicate charge' },
  { title: 'Discover', actor: 'AIPLANS.DEV', kind: 'Real product reference', step: 'market',
    summary: 'Compare model channels', heading: 'Discovery became a procurement decision.',
    copy: 'You inspected GLM-4.7-Flash across Zhipu, OpenRouter and Toolkit. Toolkit was selected for its configured AgentPay fulfillment, not because this demo proved it was the cheapest production option.',
    image: './assets/aiplans-api-pricing.png', alt: 'Real aiplans.dev API pricing catalog captured September 2026',
    href: 'https://aiplans.dev/en/models/glm-4.7-flash', link: 'Open aiplans.dev',
    artifact: 'SELECTED MODEL', value: TRACE.model, caption: 'Same model, different procurement channels' },
  { title: 'Authorize', actor: 'AGENTPAY SDK', kind: 'Policy simulation + historical bounds', step: 'connect',
    summary: s.mode === 'auto' ? 'Within your delegated policy' : 'You approved procurement',
    heading: s.mode === 'auto' ? 'Permission came before spending.' : 'The agent waited for your approval.',
    copy: 'The recorded Toolkit request used agentpay.buy() with a 1,024-token input estimate and a 256-token output cap. The policy checks the full authorization ceiling, not the smaller eventual charge. No new credential or wallet signature was issued here.',
    image: './assets/toolkit-api.png', alt: 'Real Toolkit API and MCP page captured September 2026',
    href: 'https://toolkit.fun/app#api', link: 'Open Toolkit',
    artifact: 'PER-INFERENCE AUTHORIZATION CEILING', value: `${money(TRACE.ceiling)} USDC`, caption: 'Separate from your task-level budget' },
  { title: 'Settle', actor: 'TOOLKIT / MONAD', kind: 'Historical testnet evidence', step: 'connect',
    summary: 'Usage matched to payment', heading: 'A receipt tied usage to settlement.',
    copy: 'The September 7 recorded request reported 17 input and 256 output tokens. At the Toolkit demo rate, the rounded charge was 1 atomic USDC. This transaction is historical evidence, not a payment from your current task.',
    href: TRACE.tx, link: 'Inspect Monad transaction',
    artifact: 'HISTORICAL SETTLEMENT / 273 TOKENS', value: `${money(TRACE.actual)} USDC`, caption: '0.099999 USDC remained unused under the ceiling' },
  { title: 'Deliver', actor: 'KITE-07 / YOU', kind: 'Local executable tests', step: 'delivery',
    summary: '3 tests passed; you accepted', heading: 'Back to the job. Back to you.',
    copy: 'The teaching fixture resumed with a retry guard. You ran the three acceptance tests and accepted delivery. The fixture is scripted and separate from the recorded model output; its tests execute in your browser.',
    artifact: 'ACCEPTED DELIVERABLE', value: '3 / 3 passing', caption: 'A retry returns the original receipt without another charge' },
];

export function overviewStages(s, preview = false) {
  const items = stages(s);
  if (!preview) return items;
  const examples = [
    { summary: 'Assign a job and a spending limit', heading: 'Start with a job and a boundary.', copy: 'The example task is a retry-safe checkout. Set a task budget and choose autonomous procurement or approval first. Previewing does not create or accept a commission.', artifact: 'EXAMPLE TASK / RETRY-SAFE CHECKOUT', value: '0.5 / 5 / 25 USDC', caption: 'Available task budgets, not a fee or a payment' },
    { summary: 'Reproduce; preserve; pause', heading: 'Preserve work before procurement.', copy: 'The local baseline can reproduce a duplicate charge. The scenario saves a checkpoint before requesting another inference. This capacity trigger is scripted, not a measured provider token balance.', artifact: 'BASELINE / TEACHING FIXTURE', value: 'Not run in preview', caption: 'The interactive task runs the baseline in your browser' },
    { summary: 'Compare model channels', heading: 'Turn discovery into a procurement decision.', copy: 'Compare GLM-4.7-Flash across Zhipu, OpenRouter and Toolkit. The configured Toolkit route supports machine fulfillment; this does not claim it has the lowest production price.' },
    { summary: 'Check permission before purchase', heading: 'Bound the request before authorizing it.', copy: 'The historical SDK request used a 1,024-token input estimate and 256-token output cap. In the interactive task, your policy can allow, pause or block procurement. Previewing grants no authority.' },
    {},
    { summary: 'Run tests; inspect; accept', heading: 'Verify before accepting delivery.', copy: 'The local teaching fixture adds a retry guard. Run its three tests in the interactive task before accepting delivery. This preview does not execute tests or mark any work accepted.', artifact: 'DELIVERY / PREVIEW ONLY', value: 'Not run in preview', caption: 'The teaching fixture is separate from the historical model output' },
  ];
  return items.map((item, i) => ({ ...item, ...examples[i], kind: i === 4 ? item.kind : `Preview / ${item.kind}` }));
}

export function overview(s, preview = false) {
  const items = overviewStages(s, preview);
  return `<section class="screen overview-screen">
    <div class="overview-heading"><div><span class="eyebrow">${preview ? 'QUICK PREVIEW / NO NEW ACCEPTANCE' : 'COMMISSION ACCEPTED / THE COMPLETE LOOP'}</span><h1>A job. A boundary.<br>A way forward.</h1></div><p>${preview ? 'A spending policy, a machine-fulfillable offer, and a receipt. The AgentPay loop connects all three without a human checkout.' : 'You set the policy. KITE-07 preserved the task, found a fulfillment route, and returned for your verification.'}</p></div>
    <div class="overview-outcome"><span><b>${preview ? 'Example workflow' : `${money(s.budget)} USDC`}</b> ${preview ? 'no task started by preview' : 'task budget'}</span><span><b>${preview ? 'Owner-defined' : s.mode === 'auto' ? 'Autonomous' : 'Approved by you'}</b> procurement policy</span><span><b>${preview ? 'Not run in preview' : '3 / 3 passing'}</b> ${preview ? 'no acceptance recorded' : 'accepted locally'}</span><span><b>No new charge</b> historical payment replay</span></div>
    <div class="overview-toolbar"><h2>The AgentPay loop</h2><div class="recap-controls"><button class="btn" data-recap="previous" aria-label="Previous stage" title="Previous stage">&#8592;</button><button class="btn" data-recap="play" aria-label="Play recap" title="Play recap">&#9654;</button><button class="btn" data-recap="next" aria-label="Next stage" title="Next stage">&#8594;</button><output id="recap-position">01 / 06</output></div></div>
    <ol class="overview-map" aria-label="End-to-end workflow">${items.map((item, i) => `<li><button type="button" data-recap-index="${i}" aria-controls="recap-detail" aria-pressed="${i === 0}"><span class="node-number">0${i + 1}</span><span class="node-actor">${item.actor}</span><strong>${item.title}</strong><small>${item.summary}</small></button></li>`).join('')}</ol>
    <div class="loop-return"><span>${preview ? 'Preserve the checkpoint' : 'Checkpoint preserved'}</span><i></i><span>Resume the same task &#8629;</span></div>
    <div id="recap-detail" class="recap-detail" aria-live="polite" aria-atomic="true"></div>
    <div class="overview-finish"><div><span class="eyebrow">AUTONOMY, WITH ACCOUNTABILITY</span><h2>Permission. Procurement. Proof.</h2><p>AgentPay connects a spending policy to machine fulfillment and verifiable settlement.</p></div><div class="actions"><a class="btn" href="./replay.html" target="_blank" rel="noopener">Open animated control room &#8599;</a><button class="btn" data-step="${preview ? 'hire' : 'delivery'}">${preview ? 'Start a commission' : 'Return to delivery'}</button></div></div>
  </section>`;
}

export function mountOverview(root, s, preview = false) {
  const items = overviewStages(s, preview);
  let index = 0, timer = null;
  const play = root.querySelector('[data-recap="play"]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function stop() {
    clearTimeout(timer); timer = null;
    play.innerHTML = '&#9654;';
    play.setAttribute('aria-label', 'Play recap'); play.title = 'Play recap';
    root.querySelector('.overview-map').classList.remove('playing');
  }
  function show() {
    const item = items[index];
    root.querySelectorAll('[data-recap-index]').forEach((node, i) => {
      node.setAttribute('aria-pressed', String(i === index));
      node.classList.toggle('visited', i < index);
    });
    root.querySelector('#recap-position').textContent = `0${index + 1} / 06`;
    root.querySelector('[data-recap="previous"]').disabled = index === 0;
    root.querySelector('[data-recap="next"]').disabled = index === items.length - 1;
    const detail = root.querySelector('#recap-detail');
    detail.innerHTML = `<div class="recap-story"><span class="eyebrow">${item.kind}</span><h3>${item.heading}</h3><p>${item.copy}</p><div class="actions"><button class="btn" data-step="${preview ? 'hire' : item.step}">${preview ? 'Start a commission' : `Revisit ${item.title.toLowerCase()}`} &#8599;</button>${item.href ? `<a href="${item.href}" target="_blank" rel="noopener">${item.link} &#8599;</a>` : ''}${index === 4 ? `<a href="${TRACE.proof}" target="_blank" rel="noopener">Public proof &#8599;</a>` : ''}</div></div><div class="recap-artifact">${item.image ? `<img src="${item.image}" alt="${item.alt}"/>` : ''}<span>${item.artifact}</span><strong>${item.value}</strong><p>${item.caption}</p></div>`;
    if (!reducedMotion.matches) detail.animate([{ opacity: .25, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out' });
  }
  function advance() {
    timer = setTimeout(() => {
      index++; show();
      if (index === items.length - 1) stop(); else advance();
    }, 5500);
  }
  function click(e) {
    const node = e.target.closest('button');
    if (!node || node.disabled) return;
    if (node.dataset.recapIndex !== undefined) { stop(); index = Number(node.dataset.recapIndex); show(); }
    if (node.dataset.recap === 'play') {
      if (timer !== null) { stop(); return; }
      if (index === items.length - 1) index = 0;
      show(); play.innerHTML = '&#10074;&#10074;';
      play.setAttribute('aria-label', 'Pause recap'); play.title = 'Pause recap';
      root.querySelector('.overview-map').classList.add('playing'); advance();
    }
    if (['previous', 'next'].includes(node.dataset.recap)) { stop(); index += node.dataset.recap === 'next' ? 1 : -1; show(); }
  }
  function pauseWhenHidden() { if (document.hidden) stop(); }
  root.addEventListener('click', click);
  document.addEventListener('visibilitychange', pauseWhenHidden);
  show();
  return () => { stop(); root.removeEventListener('click', click); document.removeEventListener('visibilitychange', pauseWhenHidden); };
}
