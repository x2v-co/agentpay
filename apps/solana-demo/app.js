const $ = id => document.getElementById(id);
let session; let order;
const status = text => { $('status').textContent = text; };
const atomic = text => { if (!/^\d+(\.\d{1,6})?$/.test(text)) throw Error('Enter a non-negative amount with up to six decimals.'); const [a,b=''] = text.split('.'); return String(BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'))); };
async function request(path, body) { const response = await fetch(path, { method: body === undefined ? 'GET':'POST', headers: { 'content-type':'application/json', authorization:`Bearer ${session.token}` }, body:body === undefined ? undefined:JSON.stringify(body) }); const data=await response.json(); if (!response.ok && response.status !== 402) throw Error(data.error || `HTTP ${response.status}`); return { response, data }; }
function timeline(lines) { $('timeline').replaceChildren(...lines.map(text=>{const li=document.createElement('li');li.textContent=text;return li;})); }
const formatAtomic = value => { const n=BigInt(value), sign=n<0n?'-':'', a=n<0n?-n:n; return `${sign}${a/1000000n}.${String(a%1000000n).padStart(6,'0')}`; };
function show(value) {
  order=value; sessionStorage.setItem('agentpay-solana-offline-order',order.id); $('evidence').textContent=JSON.stringify(order,null,2);
  $('pay').disabled=order.state!=='quoted' || session.mode!=='offline'; $('recover').disabled=false; $('download').disabled=order.state!=='delivered';
  timeline(['Request reserved', 'Fixed quote: 0.001 devnet USDC', order.state==='delivered'?'Mock settlement confirmed · report delivered':order.state==='quoted'?'Awaiting offline payment simulation':'Pending · reconcile this order without paying again']);
  $('report-summary').textContent=order.report ? `${order.report.affordable?'Within budget':'Budget exceeded'} · items cost ${formatAtomic(order.report.costAtomic)} USDC · remaining ${formatAtomic(order.report.remainingAtomic)} USDC.` : 'Your report appears after payment confirmation.';
  status(`${order.state.toUpperCase()} · ${order.reason || order.id}`);
}
async function init() { session=await (await fetch('/api/session')).json(); $('mode').textContent=session.mode.toUpperCase(); if(session.mode!=='offline') { $('create').disabled=true; status('This preview supports offline mode only.'); return; } const id=sessionStorage.getItem('agentpay-solana-offline-order'); if(id){ try{show((await request(`/api/orders/${id}`)).data);}catch{sessionStorage.removeItem('agentpay-solana-offline-order');} } }
$('form').addEventListener('submit',async event=>{event.preventDefault();$('create').disabled=true;try{const input={budgetAtomic:atomic($('budget').value),spentAtomic:atomic($('spent').value),quoteAtomic:atomic($('quote').value),quantity:Number($('quantity').value)};show((await request('/api/orders',{input,payer:session.payer})).data);const quote=await request(`/api/orders/${order.id}/report`,order.request);$('timeline').replaceChildren(...['Request reserved',`HTTP ${quote.response.status} · PAYMENT-REQUIRED received`].map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));}catch(error){status(error.message);}finally{$('create').disabled=false;}});
$('pay').onclick=async()=>{$('pay').disabled=true;try{show((await request(`/api/orders/${order.id}/offline-payment`,{})).data);}catch(error){status(error.message);}};
$('recover').onclick=async()=>{try{show((await request(`/api/orders/${order.id}/reconcile`,{})).data);}catch(error){status(error.message);}};
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({evidenceType:'offline-simulation-not-devnet',...order},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`agentpay-offline-${order.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
init().catch(error=>status(error.message));
