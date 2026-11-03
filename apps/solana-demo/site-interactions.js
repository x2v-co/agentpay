// Manual illustration only. No fetch, wallet discovery, timers or stored state.
const tabs = [...document.querySelectorAll('[data-frame]')];
const scenes = [...document.querySelectorAll('[data-scene]')];
let active = 0;
function show(index) { active = index; tabs.forEach((tab,i)=>tab.setAttribute('aria-pressed',String(i===index))); scenes.forEach((scene,i)=>scene.hidden=i!==index); }
tabs.forEach((tab,i)=>tab.addEventListener('click',()=>show(i)));
document.getElementById('replay-next')?.addEventListener('click',()=>show((active+1)%scenes.length));
document.getElementById('replay-reset')?.addEventListener('click',()=>show(0));

// Conceptual flow only: no fetch, wallet APIs, credentials or persisted state.
for (const story of document.querySelectorAll('[data-story]')) {
 const zh = document.documentElement.lang.startsWith('zh');
 const sequences = {success:[0,1,2,3,4,5,8],recovery:[0,1,2,3,4,5,6,7,8],denied:[0,1,2,3,4,9]};
 const steps = [...story.querySelectorAll('[data-story-step]')];
 const nodes = [...story.querySelectorAll('[data-node]')];
 const scenarios = [...story.querySelectorAll('[data-outcome]')];
 const play = story.querySelector('[data-story-play]');
 const next = story.querySelector('[data-story-next]');
 const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
 let outcome='success', cursor=0, timer=null;
 function pause(){ if(timer!==null)clearTimeout(timer);timer=null;play.textContent=play.dataset.playLabel;play.setAttribute('aria-pressed','false'); }
 function render(){
  const sequence=sequences[outcome], id=sequence[cursor];
  steps.forEach((step,i)=>step.hidden=i!==id);
  const actor=steps[id].dataset.stepActor, nodeIndex=nodes.findIndex(node=>node.dataset.node===actor);
  nodes.forEach((node,i)=>node.classList.toggle('is-active',i===nodeIndex));
  story.querySelector('[data-packet]').className='story-packet hop-'+nodeIndex;
  story.querySelector('[data-progress]').textContent=String(cursor+1).padStart(2,'0')+' / '+String(sequence.length).padStart(2,'0');
  story.querySelector('[data-attempts]').textContent=sequence.slice(0,cursor+1).includes(5)?'1':'0';
  story.querySelector('[data-release]').textContent=id===8?(zh?'已交付':'Delivered'):id===9?(zh?'已停止':'Stopped'):id===6||id===7?'Pending':(zh?'未放行':'Locked');
  next.disabled=cursor===sequence.length-1;
 }
 function tick(){ cursor++;render();if(cursor===sequences[outcome].length-1)pause();else timer=setTimeout(tick,3400); }
 play.addEventListener('click',()=>{
  if(reduced.matches)return;
  if(timer!==null){pause();return;}
  if(cursor===sequences[outcome].length-1){cursor=0;render();}
  play.textContent=play.dataset.pauseLabel;play.setAttribute('aria-pressed','true');timer=setTimeout(tick,3400);
 });
 next.addEventListener('click',()=>{pause();if(cursor<sequences[outcome].length-1){cursor++;render();}});
 story.querySelector('[data-story-reset]').addEventListener('click',()=>{pause();cursor=0;render();});
 scenarios.forEach(button=>button.addEventListener('click',()=>{pause();outcome=button.dataset.outcome;cursor=0;scenarios.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
 function motion(){pause();play.disabled=reduced.matches;story.querySelector('[data-motion-note]').textContent=reduced.matches?(zh?'已遵循减少动态效果设置。请使用“下一步”查看，无自动播放。':'Reduced motion is enabled. Use Next step; automatic playback is disabled.'):(zh?'点击播放才开始，播放一轮即停止；切换浏览器标签页会暂停。所有流程数值均为示意。':'Starts only when you press Play. Runs once; changing tabs pauses it. All values are illustrative.');}
 reduced.addEventListener('change',motion);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',pause);
 motion();render();
}
