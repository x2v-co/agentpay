import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../apps/solana-demo/exhibit-player.js',import.meta.url),'utf8');
function element(dataset:Record<string,string>={}) {
 const listeners:Record<string,()=>void>={};const attrs:Record<string,string>={};const classes=new Set<string>();
 return {dataset,hidden:false,disabled:false,textContent:'',classList:{add:(s:string)=>classes.add(s),remove:(s:string)=>classes.delete(s),toggle:(s:string,v:boolean)=>v?classes.add(s):classes.delete(s)},setAttribute:(k:string,v:string)=>attrs[k]=v,addEventListener:(k:string,f:()=>void)=>listeners[k]=f,fire:(k:string)=>listeners[k]?.(),attrs};
}
function fixture(reduce=false) {
 vi.useFakeTimers();
 const play=element({play:'Play',pause:'Pause'}),next=element(),reset=element(),count=element(),note=element(),status=element(),all=element();
 const chapters=Array.from({length:4},(_,i)=>element({exhibitIndex:String(i)}));
 const frames=Array.from({length:4},(_,i)=>({...element(),querySelector:()=>({textContent:'Scene '+i})}));
 const nodes:Record<string,any>={'[data-exhibit-play]':play,'[data-exhibit-next]':next,'[data-exhibit-reset]':reset,'[data-exhibit-count]':count,'[data-exhibit-note]':note,'[data-exhibit-status]':status};
 const exhibit={...element(),querySelector:(s:string)=>nodes[s],querySelectorAll:(s:string)=>s==='[data-exhibit-frame]'?frames:chapters};
 let observer:(e:Array<{isIntersecting:boolean}>)=>void=()=>{};let mediaChange=()=>{};
 const media={matches:reduce,addEventListener:(_s:string,f:()=>void)=>mediaChange=f};
 const events:Record<string,()=>void>={};
 const document={hidden:false,documentElement:{lang:'en'},querySelectorAll:()=>[exhibit],querySelector:()=>all,addEventListener:(s:string,f:()=>void)=>events[s]=f,dispatchEvent:()=>{}};
 const context={document,window:{addEventListener:(s:string,f:()=>void)=>events[s]=f},matchMedia:()=>media,setTimeout,clearTimeout,Event:class{},IntersectionObserver:class{constructor(f:typeof observer){observer=f;}observe(){}}};
 runInNewContext(script,context);
 return {play,next,reset,count,chapters,frames,all,status,document,events,show:()=>observer([{isIntersecting:true}]),hide:()=>observer([{isIntersecting:false}]),reduce:()=>{media.matches=true;mediaChange();}};
}
afterEach(()=>vi.useRealTimers());
describe('authored exhibit playback without network or wallets',()=>{
 it('waits until visible, plays once and stops on the last scene',()=>{
  const f=fixture();vi.advanceTimersByTime(20000);expect(f.count.textContent).toBe('01 / 04');
  f.show();expect(f.play.textContent).toBe('Pause');vi.advanceTimersByTime(8400);
  expect(f.count.textContent).toBe('04 / 04');expect(f.next.disabled).toBe(true);expect(f.play.textContent).toBe('Play');
  vi.advanceTimersByTime(30000);f.hide();f.show();expect(f.count.textContent).toBe('04 / 04');expect(f.play.textContent).toBe('Play');
 });
 it('respects pause, chapter selection, restart and manual accessibility status',()=>{
  const f=fixture();f.show();vi.advanceTimersByTime(2800);f.play.fire('click');vi.advanceTimersByTime(20000);expect(f.count.textContent).toBe('02 / 04');
  f.chapters[2].fire('click');expect(f.status.textContent).toBe('Scene 2');expect(f.chapters[2].attrs['aria-pressed']).toBe('true');expect(f.play.textContent).toBe('Play');
  f.reset.fire('click');expect(f.count.textContent).toBe('01 / 04');expect(f.next.disabled).toBe(false);expect(f.play.textContent).toBe('Play');
 });
 it('never autoplays under reduced motion and can still step manually',()=>{
  const f=fixture(true);f.show();vi.advanceTimersByTime(20000);expect(f.count.textContent).toBe('01 / 04');expect(f.play.disabled).toBe(true);
  f.next.fire('click');expect(f.count.textContent).toBe('02 / 04');f.play.fire('click');vi.advanceTimersByTime(10000);expect(f.count.textContent).toBe('02 / 04');
 });
 it('pauses for hidden pages and a live reduced-motion change',()=>{
  const f=fixture();f.show();f.document.hidden=true;f.events.visibilitychange();vi.advanceTimersByTime(10000);expect(f.count.textContent).toBe('01 / 04');
  f.document.hidden=false;f.play.fire('click');f.reduce();vi.advanceTimersByTime(10000);expect(f.count.textContent).toBe('01 / 04');expect(f.play.disabled).toBe(true);
 });
 it('global pause suppresses later first-view autoplay',()=>{
  const f=fixture();f.all.fire('click');f.show();vi.advanceTimersByTime(20000);expect(f.count.textContent).toBe('01 / 04');expect(f.play.textContent).toBe('Play');
 });
});
