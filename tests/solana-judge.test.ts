import { request as httpRequest } from 'node:http';
import { describe,it,expect,afterEach } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJudgeServer,JUDGE_MERCHANT } from '../apps/solana-demo/judge.js';
import { SvmGateway } from '../packages/solana-report/src/index.js';
import { OfflineRail,OFFLINE_PAYER,fixtureHeader } from '../packages/solana-report/src/offline.js';
const INPUT={budgetAtomic:'5000000',spentAtomic:'1000000',quoteAtomic:'250000',quantity:3};
const ORIGIN='https://judge.example';
const SECRET='a'.repeat(64); // Public test fixture only; never a deployment credential.
const cleanups:Array<()=>Promise<void>|void>=[];
afterEach(async()=>{for(const c of cleanups.splice(0).reverse())await c();});
async function setup(extra:Record<string,number>={}) {
 const dir=mkdtempSync(join(tmpdir(),'judge-test-'));cleanups.push(()=>rmSync(dir,{recursive:true,force:true}));
 const rail=new OfflineRail();const gateway=new SvmGateway(rail,rail,JUDGE_MERCHANT);await gateway.initialize();
 let now=Date.now();let server:ReturnType<typeof createJudgeServer>['server'];let base='';
 async function start(){({server}=createJudgeServer({origin:ORIGIN,dbPath:join(dir,'orders.sqlite'),sessionSecret:SECRET,gateway,rpc:async()=>{throw new Error("mock RPC unavailable");},fetcher:(async()=>new Response(null,{status:503})) as typeof fetch,clock:()=>now,...extra}));await new Promise<void>(r=>server.listen(0,'localhost',r));base=`http://localhost:${(server.address() as any).port}`;}
 await start();cleanups.push(()=>new Promise<void>(r=>server.close(()=>r())));
 async function req(path:string,session?:any,body?:any,headers:Record<string,string>={}){return new Promise<Response>((resolve,reject)=>{const r=httpRequest(base+path,{method:body===undefined?'GET':'POST',headers:{host:'judge.example',origin:ORIGIN,...(session?{cookie:session.cookie,authorization:'Bearer '+session.token}:{}),...headers}},response=>{const chunks:Buffer[]=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers as Record<string,string>})));});r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));});}
 async function session(){const r=await req('/api/session');expect(r.status).toBe(200);expect(r.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');return {...await r.json(),cookie:r.headers.get('set-cookie')!.split(';')[0]};}
 async function quote(s:any){const r=await req('/api/orders',s,{input:INPUT,payer:OFFLINE_PAYER});expect(r.status).toBe(201);return r.json();}
 return {rail,gateway,dbPath:join(dir,'orders.sqlite'),req,session,quote,advance:(n:number)=>now+=n,restart:async()=>{await new Promise<void>(r=>server.close(()=>r()));await start();}};
}
describe('judge isolation (mock facilitator/RPC, no wallet)',()=>{
 it('requires explicit HTTPS, external secret and fixed merchant',async()=>{
  const rail=new OfflineRail();const gateway=new SvmGateway(rail,rail,JUDGE_MERCHANT);
  expect(()=>createJudgeServer({origin:'http://judge.example',dbPath:':memory:',sessionSecret:SECRET,gateway})).toThrow('https_origin_required');
  expect(()=>createJudgeServer({origin:ORIGIN,dbPath:':memory:',sessionSecret:'',gateway})).toThrow('session_secret_required');
 });
 it('isolates cookie, CSRF and every order route across sessions',async()=>{
  const s=await setup();const a=await s.session(),b=await s.session();expect(a.token).not.toBe(b.token);expect(a.rpcPath).toBe('/api/rpc');expect(a.merchant).toBe(JUDGE_MERCHANT);
  const order=await s.quote(a);expect(order.requirements).toMatchObject({payTo:JUDGE_MERCHANT,amount:'1000',scheme:'exact'});
  for(const suffix of ['', '/report','/reconcile']){const r=await s.req('/api/orders/'+order.id+suffix,b,suffix?INPUT:undefined);expect(r.status).toBe(404);expect(await r.json()).toEqual({error:'order_not_found'});}
  expect((await s.req('/api/orders/'+order.id,{...a,token:b.token})).status).toBe(401);
  expect((await s.req('/api/orders/'+order.id)).status).toBe(401);expect(s.rail.calls.settle).toBe(0);
 });
 it('rejects merchant changes, cross-origin, missing origin and broadcast RPC',async()=>{
  const s=await setup();const a=await s.session();
  expect((await s.req('/api/configure',a,{payer:OFFLINE_PAYER,payTo:OFFLINE_PAYER})).status).toBe(403);
  expect((await s.req('/api/orders',a,{input:INPUT,payer:OFFLINE_PAYER},{origin:'https://evil.example'})).status).toBe(403);
  expect((await s.req('/api/orders',a,{}, {origin:''})).status).toBe(403);
  expect((await s.req('/api/rpc',a,{method:'sendTransaction',params:['unsigned']})).status).toBe(403);
  expect((await s.req('/api/session',undefined,undefined,{host:'evil.example'})).status).toBe(403);
  expect(s.rail.calls.settle).toBe(0);
 });
 it('verification failure never releases a report',async()=>{
  const s=await setup();const a=await s.session();const o=await s.quote(a);s.rail.invalidReason='insufficient_funds';
  const r=await s.req(`/api/orders/${o.id}/report`,a,INPUT,{'payment-signature':fixtureHeader(o)});expect(r.status).toBe(402);
  const saved=await(await s.req('/api/orders/'+o.id,a)).json();expect(saved.report).toBeUndefined();expect(saved.state).toBe('quoted');expect(s.rail.calls.settle).toBe(0);
 });
 it('concurrent duplicate payments settle once and preserve owner after restart',async()=>{
  const s=await setup();const a=await s.session(),b=await s.session();const o=await s.quote(a);
  const headers={'payment-signature':fixtureHeader(o)};
  const responses=await Promise.all(Array.from({length:4},()=>s.req(`/api/orders/${o.id}/report`,a,INPUT,headers)));
  expect(responses.every(r=>r.status===200||r.status===202)).toBe(true);expect(s.rail.calls.settle).toBe(1);
  await s.restart();expect((await s.req('/api/orders/'+o.id,b)).status).toBe(404);
  const retry=await s.req(`/api/orders/${o.id}/report`,a,INPUT,headers);expect(retry.status).toBe(200);expect((await retry.json()).state).toBe('delivered');expect(s.rail.calls.settle).toBe(1);
 });
 it('uncertain settlement remains pending without repeat after restart',async()=>{
  const s=await setup();const a=await s.session();const o=await s.quote(a);s.rail.timeout=true;const headers={'payment-signature':fixtureHeader(o)};
  expect((await s.req(`/api/orders/${o.id}/report`,a,INPUT,headers)).status).toBe(202);await s.restart();
  const pending=await(await s.req(`/api/orders/${o.id}/report`,a,INPUT,headers)).json();expect(pending.state).toBe('pending');expect(pending.report).toBeUndefined();expect(s.rail.calls.settle).toBe(1);
 });
 it('persistent quote limits and global lifetime cap survive restart',async()=>{
  const s=await setup({maxOrders:2});const a=await s.session();await s.quote(a);await s.quote(a);await s.restart();
  const b=await s.session();expect((await s.req('/api/orders',b,{input:INPUT,payer:OFFLINE_PAYER})).status).toBe(429);expect(s.rail.calls.settle).toBe(0);
 });
 it('retains the per-session quote quota across restart',async()=>{
  const s=await setup();const a=await s.session();for(let i=0;i<5;i++)await s.quote(a);await s.restart();
  expect((await s.req('/api/orders',a,{input:INPUT,payer:OFFLINE_PAYER})).status).toBe(429);
 });
 it('limits session churn and denies tampered or expired cookies',async()=>{
  const s=await setup();const a=await s.session();expect((await s.req('/api/session',{...a,cookie:a.cookie+'f'})).status).toBe(401);
  s.advance(86400001);expect((await s.req('/api/session',a)).status).toBe(401);
  for(let i=0;i<20;i++)await s.session();expect((await s.req('/api/session')).status).toBe(429);
 });
 it('fails closed when persisted origin or secret configuration changes',async()=>{
  const s=await setup();const a=await s.session();const o=await s.quote(a);
  expect(()=>createJudgeServer({origin:ORIGIN,dbPath:s.dbPath,sessionSecret:'b'.repeat(64),gateway:s.gateway})).toThrow('judge_configuration_changed');
  expect(()=>createJudgeServer({origin:'https://other.example',dbPath:s.dbPath,sessionSecret:SECRET,gateway:s.gateway})).toThrow('judge_configuration_changed');
  expect((await s.req('/api/orders/'+o.id,a)).status).toBe(200);
 });
 it('rejects malformed and tampered submissions without delivery',async()=>{
  const s=await setup();const a=await s.session();const o=await s.quote(a);
  expect((await s.req(`/api/orders/${o.id}/report`,a,{...INPUT,quantity:4},{'payment-signature':fixtureHeader(o)})).status).toBe(409);
  expect((await s.req(`/api/orders/${o.id}/report`,a,INPUT,{'payment-signature':'malformed'})).status).toBeGreaterThanOrEqual(400);
  expect((await s.req(`/api/orders/${o.id}/reconcile`,a,{transaction:'invalid'})).status).toBe(400);
  expect((await(await s.req('/api/orders/'+o.id,a)).json()).report).toBeUndefined();expect(s.rail.calls.settle).toBe(0);
 });
 it('does not pay when readiness fails and blocks the old token RPC path',async()=>{
  const s=await setup();const a=await s.session();expect((await s.req('/api/readiness',a,{})).status).toBe(503);
  expect((await s.req('/api/rpc/'+a.token,a,{method:'getGenesisHash',params:[]})).status).toBe(404);
  expect(s.rail.calls.settle).toBe(0);
 });
 it('global rate limits survive restart and ignore forwarded identity headers',async()=>{
  const s=await setup({globalLimit:3});const a=await s.session();await s.req('/api/session',a);await s.req('/api/session',a);await s.restart();
  expect((await s.req('/api/session',a,undefined,{'x-forwarded-for':'spoofed-host'})).status).toBe(429);
  s.advance(60001);expect((await s.req('/api/session',a)).status).toBe(200);
 });
 it('allows only public document navigation from another site',async()=>{
  const s=await setup();const a=await s.session();const o=await s.quote(a);
  const navigation={'sec-fetch-site':'same-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document',origin:''};
  const page=await s.req('/',undefined,undefined,navigation);expect(page.status).toBe(200);
  for(const path of ['/api/session','/api/orders/'+o.id,'/api/examples','/evidence.json']) expect((await s.req(path,a,undefined,navigation)).status).toBe(403);
  expect((await s.req('/api/orders',a,{input:INPUT,payer:OFFLINE_PAYER},navigation)).status).toBe(403);
  expect((await s.req('/',undefined,undefined,{...navigation,'sec-fetch-mode':'cors'})).status).toBe(403);
  expect(s.rail.calls.settle).toBe(0);
 });
 it('serves bilingual public documents without issuing sessions or widening API navigation',async()=>{
  const s=await setup();const nav={'sec-fetch-site':'same-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document',origin:''};
  for(const path of ['/','/zh','/demo','/zh/demo','/developers','/zh/developers','/history/monad','/zh/history/monad','/concepts/multichain','/zh/concepts/multichain']) {
   const r=await s.req(path,undefined,undefined,nav);expect(r.status).toBe(200);expect(r.headers.get('set-cookie')).toBeNull();
   expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
   const html=await r.text();expect(html).toContain('https://agentpay.toolkit.fun'+path);expect(html).toContain('hreflang="zh-CN"');expect(html).toContain('id="main"');expect(html).toContain('data-exhibit');expect(html).toContain('/exhibit-player.js');expect(html).toContain('data-pause-all');
   expect(html).not.toContain('wallet.bundle.js');expect(html).not.toContain('unsafe-inline');
  }
  expect((await s.req('/developers',undefined,undefined,{...nav,'sec-fetch-mode':'cors'})).status).toBe(403);
  for(const path of ['/api/session','/api/rpc','/api/orders','/evidence.json'])expect((await s.req(path,undefined,undefined,nav)).status).toBe(403);
  expect(s.rail.calls.settle).toBe(0);
 });
 it('runs public offline examples without touching the real rail',async()=>{
  const s=await setup();const r=await s.req('/api/examples');expect(r.status).toBe(200);const data=await r.json();expect(data.mode).toBe('offline-simulation');expect(data.failure).toMatchObject({reportReleased:false,settleCalls:0});expect(data.retry).toMatchObject({sameResult:true,settleCalls:1});expect(s.rail.calls.settle).toBe(0);
 });
});
