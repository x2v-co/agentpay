// Pure presentation: authored scenes, no network, wallet access or stored state.
const media = matchMedia('(prefers-reduced-motion: reduce)');
const controllers = [];
for (const exhibit of document.querySelectorAll('[data-exhibit]')) {
 const frames=[...exhibit.querySelectorAll('[data-exhibit-frame]')];
 const chapters=[...exhibit.querySelectorAll('[data-exhibit-index]')];
 const play=exhibit.querySelector('[data-exhibit-play]'), next=exhibit.querySelector('[data-exhibit-next]');
 const zh=document.documentElement.lang.startsWith('zh');
 let cursor=0,timer=null,seen=false;
 function pause(){clearTimeout(timer);timer=null;exhibit.classList.remove('is-playing');play.textContent=play.dataset.play;play.setAttribute('aria-pressed','false');}
 function render(manual=false){frames.forEach((f,i)=>f.hidden=i!==cursor);chapters.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===cursor)));exhibit.querySelector('[data-exhibit-count]').textContent=`0${cursor+1} / 0${frames.length}`;next.disabled=cursor===frames.length-1;if(manual)exhibit.querySelector('[data-exhibit-status]').textContent=frames[cursor].querySelector('h2').textContent;}
 function advance(){cursor++;render();if(cursor===frames.length-1)pause();else timer=setTimeout(advance,2800);}
 function start(){if(media.matches||document.hidden||timer!==null)return;if(cursor===frames.length-1){cursor=0;render();}seen=true;exhibit.classList.add('is-playing');play.textContent=play.dataset.pause;play.setAttribute('aria-pressed','true');timer=setTimeout(advance,2800);}
 play.addEventListener('click',()=>{seen=true;if(timer!==null)pause();else start();});
 next.addEventListener('click',()=>{seen=true;pause();if(cursor<frames.length-1)cursor++;render(true);});
 exhibit.querySelector('[data-exhibit-reset]').addEventListener('click',()=>{seen=true;pause();cursor=0;render(true);});
 chapters.forEach((b,i)=>b.addEventListener('click',()=>{seen=true;pause();cursor=i;render(true);}));
 function motion(){pause();play.disabled=media.matches;exhibit.classList.toggle('reduced-motion',media.matches);exhibit.querySelector('[data-exhibit-note]').textContent=media.matches?(zh?'减少动态效果 · 可手动逐步查看':'Reduced motion · manual steps available'):(zh?'自动播放一轮 · 不产生付款':'One automatic playthrough · no payment');}
 media.addEventListener('change',motion);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',pause);
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting&&!seen&&!media.matches)start();else if(!entry.isIntersecting)pause();}},{threshold:.2});observer.observe(exhibit);
 controllers.push(()=>{seen=true;pause();});motion();render();
}
document.querySelector('[data-pause-all]')?.addEventListener('click',()=>{controllers.forEach(pause=>pause());document.dispatchEvent(new Event('agentpay:pause-motion'));});
