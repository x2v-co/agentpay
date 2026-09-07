import { TRACE, STEPS, freshState, decision, accessibleStep, restoreState, runCheckoutTests, FIX_SOURCE } from './journey-model.mjs';
import { overview, mountOverview } from './overview.js';
const app = document.querySelector('#app');
const key = 'agentpay.journey.v1';
let state;
try { state = restoreState(localStorage.getItem(key)); } catch { state = freshState(); }
let timers = [], busy = false;
let disposeOverview = null;
const money = n => (n / 1e6).toFixed(6);
const external = (href, label) => `<a href="${href}" target="_blank" rel="noopener">${label} ↗</a>`;
const button = (action, label, cls = '') => `<button type="button" class="btn ${cls}" data-action="${action}">${label}</button>`;
const evidence = `<p class="note">Historical trace · September 7, 2026. This payment belongs to the recorded provider request, not your current local task.</p><div class="actions">${external(TRACE.proof,'Public proof')}${external(TRACE.tx,'Monad transaction')}</div>`;
function save() { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Session still works without storage. */ } }
function go(step) { state.step = accessibleStep(step,state); save(); if (location.hash.slice(1) === state.step) render(); else location.hash = state.step; }
function head(n,title,copy) { return `<div class="step-head"><div><span class="eyebrow">${n} / YOUR AGENT AT WORK</span><h2>${title}</h2></div><p>${copy}</p></div>`; }
function policy() { return `<div class="policy-strip"><span>YOUR COMMISSION / RETRY FIX</span><b>${money(state.budget)} USDC limit</b><span>${state.mode === 'auto' ? 'Autonomous purchasing' : 'Ask before purchasing'}</span><button data-action="edit" class="text-btn">Edit rules</button></div>`; }
function tests(fixed) { return runCheckoutTests(fixed).map(t => `<div class="test ${t.pass?'pass':'fail'}"><span class="${t.pass?'check':'bad'}">${t.pass?'PASS':'FAIL'}</span>${t.name}</div>`).join(''); }
function hire() {
  return `<section class="screen hire-screen"><div class="eyebrow">A SMALL JOB. A REAL QUESTION ABOUT AUTONOMY.</div><h1 class="hero-title">Give it a job.<br>Let it <em>find a way.</em></h1><p class="lede">Your checkout charges twice when a request retries. Hire KITE-07 to fix it. You set the spending rules. It has to finish within them.</p><div class="hire-grid"><form id="commission" class="card form-card"><span class="eyebrow">YOUR COMMISSION / #418</span><h2>Fix the duplicate charge.</h2><p>Deliver a retry-safe function and three passing tests.</p><label for="budget">Commission budget</label><div class="budget"><input id="budget" type="range" min="0" max="2" step="1" value="${[500000,5000000,25000000].indexOf(state.budget)}"/><output id="budget-label">${money(state.budget)} USDC</output></div><p class="note">This is the task budget for an autonomous coding job. Each inference still uses a separate 0.100000 USDC authorization ceiling.</p><fieldset><legend>If the agent needs another inference…</legend><div class="form-row"><label class="choice ${state.mode==='auto'?'selected':''}"><input type="radio" name="mode" value="auto" ${state.mode==='auto'?'checked':''}/><strong>Let it purchase</strong><small>Only within the rules above.</small></label><label class="choice ${state.mode==='ask'?'selected':''}"><input type="radio" name="mode" value="ask" ${state.mode==='ask'?'checked':''}/><strong>Ask me first</strong><small>Save the work and await approval.</small></label></div></fieldset><button class="btn primary" type="submit">${state.hired?'Save rules & continue':'Hire KITE-07'} →</button>${state.hired?button('resume','Resume saved commission'):''}</form><aside class="hire-aside"><div class="agent-avatar" aria-hidden="true"><div>K7</div><i></i><i></i></div><span class="eyebrow">YOUR NEXT TEAMMATE</span><h3>Skills need resources.<br>Autonomy needs limits.</h3><p>You will inspect its decision, explore real products, and run the delivered tests yourself.</p><span class="note">About 2 minutes · no wallet needed</span><details><summary>What is real in this demo?</summary><p>The checkout tests execute locally. The agent's investigation and repair are scripted teaching fixtures. The provider usage and Monad transaction are historical evidence. Your choices control the simulation; no new model call or payment is made.</p></details></aside></div></section>`;
}
function work() {
  return `<section class="screen">${policy()}${head('01','A retry. Two charges.','KITE-07 starts with your failing checkout. Run the baseline to see the bug before it asks for more resources.')}<div class="step-grid"><div class="card"><div class="panel-title"><span>checkout / retry.mjs</span><span>TEACHING FIXTURE</span></div><div class="incident"><span>order-418</span><i>→</i><span>request + retry</span><i>→</i><b>2 charges</b></div><pre class="codebox">pay(key) {
  const receipt = charge(key);
  receipts.set(key, receipt);
  return receipt;
}</pre><div id="baseline-tests" class="test-list">${state.checkpoint?tests(false):'<p class="note">Run this function against the three acceptance tests.</p>'}</div><div class="actions">${button('baseline',state.checkpoint?'Run baseline again':'Run baseline tests','primary')}</div></div><aside class="card side"><span class="eyebrow">AGENT NOTEBOOK / SCRIPTED</span><h3>Investigate → checkpoint → procure</h3><ol class="notebook"><li>Reproduce the duplicate receipt.</li><li>Locate the missing retry guard.</li><li>Save the task before the next inference.</li></ol><div class="decision" id="checkpoint-note">${state.checkpoint?'Checkpoint saved. The scenario now needs a second inference to continue.':'The scenario allocates one investigation step before procurement. This is a simulation trigger, not a measured provider balance.'}</div><div class="actions">${button('market','Find the next inference →',state.checkpoint?'primary':'')}</div><p class="note">The original file and failing test travel with the checkpoint.</p></aside></div></section>`;
}
function market() {
  const d = decision(state);
  const msg = d==='budget-blocked' ? `I cannot authorize this offer. It requests ${money(TRACE.ceiling)} USDC, above your ${money(state.budget)} limit. Your checkpoint is safe.` : d==='approval-required' ? 'Your policy says to ask first. May I continue with the recorded Toolkit offer in this simulation?' : d==='denied' ? 'You declined. I have saved the work and stopped procurement. No new payment was made.' : 'Toolkit matches the configured merchant policy and supports per-call AgentPay fulfillment. I can proceed within your authorization.';
  return `<section class="screen">${policy()}${head('02','Let it shop.','Inspect the same model across real channels. Machine fulfillment is the selection reason; this demo does not claim the lowest production price.')}<div class="step-grid"><div><div class="product-window"><div class="panel-title"><b>aiplans.dev / API pricing</b>${external('https://aiplans.dev/en/models/glm-4.7-flash','Open model')}</div><img src="./assets/aiplans-api-pricing.png" alt="September 2026 capture of the real aiplans.dev pricing catalog"/><span class="image-caption">REAL PRODUCT CAPTURE / SEP 2026</span></div><div class="offers"><article class="offer-card"><div><strong>Zhipu direct API</strong><small>GLM-4.7-Flash / China channel</small></div><div class="price">CNY 0 / 0<small>input / output per 1M</small></div><span class="tag neutral">REFERENCE</span></article><article class="offer-card"><div><strong>OpenRouter</strong><small>GLM-4.7-Flash</small></div><div class="price">USD 0.06 / 0.40<small>input / output per 1M</small></div><span class="tag neutral">REFERENCE</span></article><article class="offer-card selected"><div><strong>Toolkit metered API</strong><small>TESTNET DEMO RATE / atomic USDC</small></div><div class="price">2 / 8<small>input / output per 1M</small></div><span class="tag">SELECTED</span></article></div><details><summary>Why pay when Zhipu lists this model as free?</summary><p>The direct channel lists free inference. Toolkit is the merchant integration exercised by this testnet procurement protocol. Its demo fee is not a claim about provider cost or savings. The reference channels are not configured for purchase in this experience.</p></details><p class="note">Prices checked September 7, 2026. ${external('https://aiplans.dev/en/models/glm-4.7-flash','Check current prices')}</p></div><aside class="card side"><span class="eyebrow">KITE-07 / PROCUREMENT DECISION</span><h3>Your rules decide.</h3><div class="facts"><div class="fact"><span>Model / allowed</span><strong>zhipu/GLM-4.7-Flash</strong></div><div class="fact"><span>Merchant / allowed</span><strong>Toolkit</strong></div><div class="fact"><span>Recorded request</span><strong>1,024 input estimate / 256 output cap</strong></div><div class="fact"><span>Required authorization ceiling</span><strong>0.100000 USDC</strong></div></div><div class="decision ${d!=='allowed'?'attention':''}" role="status">${msg}</div><div class="actions">${d==='allowed'?button('connect','Follow the purchase →','primary'):d==='budget-blocked'?button('edit','Adjust my budget','warn'):d==='denied'?button('approve','Approve this simulation','primary'):button('approve','Approve once','primary')+button('deny','Decline')}</div><p class="note">Approval controls this simulation only. No wallet signature or real spending permission is requested.</p></aside></div></section>`;
}
function connect() {
  return `<section class="screen">${policy()}${head('03','Connect the next inference.','Follow the recorded request from authorization to delivery. Each event below explains the historical evidence; it does not broadcast a transaction.')}<div class="api-layout"><div class="card"><div class="product-window compact"><div class="panel-title"><b>toolkit.fun / API + MCP</b>${external('https://toolkit.fun/app#api','Open Toolkit')}</div><img src="./assets/toolkit-api.png" alt="Real Toolkit API and MCP distribution page, captured September 2026"/></div><details><summary>Inspect the SDK request</summary><pre class="codebox">agentpay.buy({
  policyId,
  body: { prompt: "[historical prompt redacted]" },
  inputTokens: 1024,
  outputCap: 256,
  signReservation,
  signPayment,
  waitForSettlement: true
})</pre></details><div class="actions">${button('replay',state.paymentDone?'Replay evidence':'Follow recorded purchase','primary')}${external('./replay.html','Open animated control room')}</div><p class="note">The coding fixture is not the output of this recorded request.</p></div><div class="card receipt"><span class="eyebrow">HISTORICAL EVIDENCE / MONAD TESTNET</span><ol id="purchase-events" class="purchase-events">${purchaseEvents(state.paymentDone?4:0)}</ol><div class="metrics"><div class="metric"><b>273</b><span>17 input + 256 output tokens</span></div><div class="metric"><b>0.000001</b><span>USDC actual historical settlement</span></div></div><details><summary>How the charge is calculated</summary><pre class="codebox">ceil((17 × 2 + 256 × 8) / 1,000,000)
= 1 atomic USDC

Rate: toolkit-demo-2026-09
Permit2 ceiling: 0.100000 USDC
Unused ceiling:  0.099999 USDC</pre></details>${evidence}<div class="actions">${button('delivery','Return to the saved task →',state.paymentDone?'primary':'')}</div></div></div></section>`;
}
function purchaseEvents(count) { return ['Request and token bounds reserved','Permit2 ceiling authorized','Provider reported 17 input + 256 output tokens','1 atomic USDC settlement matched on Monad'].map((t,i)=>`<li class="${i<count?'complete':''}"><span>${i<count?'✓':String(i+1).padStart(2,'0')}</span>${t}</li>`).join(''); }
function delivery() {
  return `<section class="screen">${policy()}${head('04','Your turn to verify.','The teaching fixture resumes at its checkpoint with a retry guard. Run the tests yourself, inspect the change, and take the code with you.')}<div class="step-grid"><div class="card"><div class="panel-title"><span>checkout / retry.mjs</span><span>LOCAL EXECUTABLE FIXTURE</span></div><div class="diff"><pre>// BEFORE
pay(key) {
  const receipt = charge(key);
  receipts.set(key, receipt);
  return receipt;
}</pre><pre>// AFTER
pay(key) {
  if (receipts.has(key))
    return receipts.get(key);
  const receipt = charge(key);
  receipts.set(key, receipt);
  return receipt;
}</pre></div><div class="actions">${button('test','Run acceptance tests','primary')}${button('download','Download runnable fix ↓')}</div><div id="acceptance-tests" class="test-list">${state.tested?tests(true):'<p class="note">The tests execute in your browser. Acceptance unlocks after they pass.</p>'}</div><p class="note">This synchronous, in-memory example demonstrates the bug and fix. It is not production payment code and was not generated by the historical model call.</p></div><aside class="card side"><span class="eyebrow">COMMISSION REVIEW</span><h3>Did it honor your rules?</h3><div class="facts"><div class="fact"><span>Your authorization</span><strong>${money(state.budget)} USDC / ${state.mode==='auto'?'autonomous':'approved once'}</strong></div><div class="fact"><span>This interactive session</span><strong>No real spending or model call</strong></div><div class="fact"><span>Linked historical payment</span><strong>0.000001 USDC / 273 tokens</strong></div><div class="fact"><span>Local test result</span><strong>${state.tested?'3 / 3 passing':'Awaiting your verification'}</strong></div></div><div class="actions">${button('accept',state.accepted?'Accepted ✓':'Accept delivery','primary')}</div><div id="acceptance-result" role="status">${state.accepted?'<div class="success"><h2>You set the rules.<br>It kept the checkpoint.</h2><p>You have inspected the procurement decision and verified the delivered fixture.</p></div>':''}</div></aside></div><section class="counterfactual"><div><span class="eyebrow">ONE MORE QUESTION</span><h3>What if you gave it less freedom?</h3><p>Return to the checkpoint with a different policy. See it stop and preserve the work.</p></div><div class="actions">${button('try-ask','Require my approval')}${button('try-budget','Limit budget to 0.010000')}</div></section></section>`;
}
function render() {
  disposeOverview?.(); disposeOverview = null;
  timers.forEach(clearTimeout); timers=[]; busy=false;
  const current = accessibleStep(location.hash.slice(1)||state.step,state);
  state.step=current; save();
  if(location.hash!==`#${current}`) history.replaceState(null,'',`#${current}`);
  app.innerHTML = ({hire,work,market,connect,delivery,overview:()=>overview(state)})[current]() + `<nav class="progress" aria-label="Commission progress">${STEPS.map((s,i)=>`<button data-step="${s}" ${accessibleStep(s,state)!==s?'disabled':''} ${s===current?'aria-current="step"':''} class="${s===current?'active':''}">${String(i+1).padStart(2,'0')} ${['COMMISSION','WORK','DISCOVER','CONNECT','VERIFY','OVERVIEW'][i]}</button>`).join('')}</nav>`;
  if (current === 'overview') disposeOverview = mountOverview(app.querySelector('.overview-screen'), state);
  if (current === 'delivery' && state.accepted) document.querySelector('#acceptance-result').insertAdjacentHTML('beforeend', '<div class="actions"><button class="btn primary" data-step="overview">See the complete loop &rarr;</button></div>');
  app.querySelector('.screen').animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:380,easing:'ease-out'});
  const form=document.querySelector('#commission');
  if(form) {
    const slider=form.querySelector('#budget');
    slider.addEventListener('input',()=>{form.querySelector('#budget-label').textContent=`${money([500000,5000000,25000000][slider.value])} USDC`;});
    form.addEventListener('change',()=>form.querySelectorAll('.choice').forEach(c=>c.classList.toggle('selected',c.querySelector('input').checked)));
    form.addEventListener('submit',e=>{e.preventDefault(); const budget=[500000,5000000,25000000][slider.value];const mode=new FormData(form).get('mode');const checkpoint=state.checkpoint;const runId=state.runId||crypto.randomUUID();state={...freshState(),hired:true,budget,mode,runId,checkpoint};go(checkpoint?'market':'work');});
  }
  if (current === 'connect') {
    document.querySelector('.receipt .eyebrow').insertAdjacentHTML('afterend', '<div class="commerce-flow" aria-label="Recorded purchase route"><span>KITE-07</span><i></i><span>TOOLKIT</span><i></i><span>MONAD</span></div>');
  }
  document.querySelector('[data-action="market"]')?.toggleAttribute('disabled',!state.checkpoint);
  document.querySelector('[data-action="delivery"]')?.toggleAttribute('disabled',!state.paymentDone);
  document.querySelector('[data-action="accept"]')?.toggleAttribute('disabled',!state.tested || state.accepted);
}
app.addEventListener('click',e=>{
  const el=e.target.closest('button'); if(!el||el.disabled)return;
  if(el.dataset.step){go(el.dataset.step);return;}
  const action=el.dataset.action;
  if(['market','connect','delivery'].includes(action)){go(action);return;}
  if(action==='edit'){go('hire');return;}
  if(action==='resume'){go(state.accepted?'overview':state.paymentDone?'delivery':state.checkpoint?'market':'work');return;}
  if(action==='baseline'){state.checkpoint=true;save();document.querySelector('#baseline-tests').innerHTML=tests(false);document.querySelector('#checkpoint-note').textContent='Checkpoint saved. The scenario needs another inference to continue.';document.querySelector('[data-action="market"]').disabled=false;document.querySelector('[data-action="market"]').classList.add('primary');return;}
  if(action==='approve'){state.approved=true;state.denied=false;save();render();return;}
  if(action==='deny'){state.denied=true;state.approved=false;save();render();return;}
  if(action==='test'){const result=runCheckoutTests(true);state.tested=result.every(t=>t.pass);save();document.querySelector('#acceptance-tests').innerHTML=tests(true);document.querySelector('[data-action="accept"]').disabled=!state.tested;render();return;}
  if(action==='accept'){state.accepted=true;go('overview');return;}
  if(action==='download'){const url=URL.createObjectURL(new Blob([FIX_SOURCE],{type:'text/javascript'}));const a=document.createElement('a');a.href=url;a.download='retry-fixed.mjs';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(action==='try-ask'||action==='try-budget'){state={...state,mode:action==='try-ask'?'ask':'auto',budget:action==='try-budget'?10000:5000000,approved:false,denied:false,paymentDone:false,tested:false,accepted:false};go('market');return;}
  if(action==='replay'&&!busy){busy=true;document.querySelector('.commerce-flow').classList.add('running');el.disabled=true;el.textContent='Following historical evidence…';state.paymentDone=false;save();document.querySelector('[data-action="delivery"]').disabled=true;document.querySelector('#purchase-events').innerHTML=purchaseEvents(0);[1,2,3,4].forEach((n)=>timers.push(setTimeout(()=>{document.querySelector('#purchase-events').innerHTML=purchaseEvents(n);if(n===4){state.paymentDone=true;save();busy=false;document.querySelector('.commerce-flow').classList.remove('running');el.disabled=false;el.textContent='Replay evidence';const next=document.querySelector('[data-action="delivery"]');next.disabled=false;next.classList.add('primary');}},n*1700)));}
});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
render();
