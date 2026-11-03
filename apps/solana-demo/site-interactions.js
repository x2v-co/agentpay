// Manual illustration only. No fetch, wallet discovery, timers or stored state.
const tabs = [...document.querySelectorAll('[data-frame]')];
const scenes = [...document.querySelectorAll('[data-scene]')];
let active = 0;
function show(index) { active = index; tabs.forEach((tab,i)=>tab.setAttribute('aria-pressed',String(i===index))); scenes.forEach((scene,i)=>scene.hidden=i!==index); }
tabs.forEach((tab,i)=>tab.addEventListener('click',()=>show(i)));
document.getElementById('replay-next')?.addEventListener('click',()=>show((active+1)%scenes.length));
document.getElementById('replay-reset')?.addEventListener('click',()=>show(0));
