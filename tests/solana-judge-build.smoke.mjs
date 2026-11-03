import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createJudgeServer,JUDGE_MERCHANT} from '../dist/solana/apps/solana-demo/judge.js';
import {OfflineRail} from '../dist/solana/packages/solana-report/src/offline.js';
import {SvmGateway} from '../dist/solana/packages/solana-report/src/index.js';
const dir=mkdtempSync(join(tmpdir(),'judge-build-smoke-'));
const rail=new OfflineRail();const gateway=new SvmGateway(rail,rail,JUDGE_MERCHANT);await gateway.initialize();
const {server}=createJudgeServer({origin:'https://judge.example',dbPath:join(dir,'test.sqlite'),sessionSecret:'a'.repeat(64),gateway});
try {
 await new Promise(r=>server.listen(0,'localhost',r));
 const get=(path,headers={})=>new Promise((resolve,reject)=>{const r=request({hostname:'localhost',port:server.address().port,path,headers:{host:'judge.example',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,text:Buffer.concat(chunks).toString(),headers:res.headers}));});r.on('error',reject);r.end();});
 for(const path of ['/','/zh','/demo','/zh/demo','/developers','/zh/developers','/history/monad','/zh/history/monad','/concepts/multichain','/zh/concepts/multichain','/site.css','/site-interactions.js','/sitemap.xml','/robots.txt','/wallet','/judge.js','/wallet.bundle.js','/style.css','/healthz','/evidence.json']){const r=await get(path);assert.equal(r.status,200,path);assert.ok(r.text.length>10);assert.equal(r.headers['x-content-type-options'],'nosniff');}
 for(const site of ['same-site','cross-site'])for(const path of ['/','/wallet'])assert.equal((await get(path,{'sec-fetch-site':site,'sec-fetch-mode':'navigate','sec-fetch-dest':'document'})).status,200);
 const evidence=JSON.parse((await get('/evidence.json')).text);assert.equal(evidence.order.state,'delivered');assert.equal(evidence.order.requirements.amount,'1000');assert.equal(evidence.order.requirements.payTo,JUDGE_MERCHANT);
 const examples=JSON.parse((await get('/api/examples')).text);assert.equal(examples.failure.settleCalls,0);assert.equal(examples.retry.settleCalls,1);assert.equal(rail.calls.settle,0);
 console.log('Judge built assets/evidence/offline examples: passed; real rail settle calls 0');
} finally {await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
