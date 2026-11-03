import { createServer } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { OrderStore, ReportService, Problem, invariant, svmAddress, digest, reportInput, type SvmGateway } from '../../packages/solana-report/src/index.js';
import { createDevnetGateway } from '../../packages/solana-report/src/devnet.js';
import { publicRpc, publicReadiness, walletReadiness, assertReadMethod, type RpcRead } from '../../packages/solana-report/src/readiness.js';
import { NETWORK, MINT, PRICE, FACILITATOR_URL, RPC_URL } from '../../packages/solana-report/src/constants.js';
import { judgeExamples } from './judge-examples.js';
import { readBody } from './server.js';

export const JUDGE_MERCHANT = 's6gS82AnfUCib9emQjVVJPmxD6GwUQJF3hYeter2FR9';
const COOKIE = '__Host-agentpay';
const LIFE = 24 * 60 * 60 * 1000;
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export type JudgeOptions = { origin: string; dbPath: string; sessionSecret: string; gateway: SvmGateway; rpc?: RpcRead; fetcher?: typeof fetch; clock?: () => number; globalLimit?: number; sessionLimit?: number; maxOrders?: number };
/** No startup RPC, secret creation, wallet operation or payment. Start only with explicit configuration. */
export function createJudgeServer(options: JudgeOptions) {
  const url = new URL(options.origin);
  invariant(url.protocol === 'https:' && url.origin === options.origin && !url.username && !url.password, 'https_origin_required');
  invariant(/^[a-f0-9]{64,128}$/.test(options.sessionSecret), 'session_secret_required');
  invariant(options.gateway.payTo === JUDGE_MERCHANT, 'fixed_merchant_required');
  const clock = options.clock || Date.now;
  const rpc = options.rpc || publicRpc();
  const store = new OrderStore(options.dbPath, 'devnet');
  const db = new DatabaseSync(options.dbPath);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS judge_settings(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE IF NOT EXISTS judge_owners(id TEXT PRIMARY KEY,owner TEXT NOT NULL); CREATE TABLE IF NOT EXISTS judge_rates(k TEXT PRIMARY KEY,n INTEGER NOT NULL,until_ms INTEGER NOT NULL);');
  const mac = (s: string) => createHmac('sha256', options.sessionSecret).update(s).digest('hex');
  for (const [k,v] of Object.entries({ origin: options.origin, merchant: JUDGE_MERCHANT, secretFingerprint: createHash('sha256').update(options.sessionSecret).digest('hex') })) {
    db.prepare('INSERT OR IGNORE INTO judge_settings VALUES (?,?)').run(k,v);
    if (db.prepare('SELECT v FROM judge_settings WHERE k=?').get(k)?.v !== v) { db.close(); store.close(); throw new Error('judge_configuration_changed'); }
  }
  const service = new ReportService(store, options.gateway, 'devnet', options.origin, clock);
  function limit(key: string, max: number, window: number) {
    const now = clock();
    const row = db.prepare(`INSERT INTO judge_rates VALUES (?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN until_ms<=? THEN 1 ELSE n+1 END, until_ms=CASE WHEN until_ms<=? THEN excluded.until_ms ELSE until_ms END RETURNING n`).get(key,now+window,now,now);
    invariant(Number(row?.n) <= max, 'rate_limited',429);
  }
  const server = createServer(async (req,res) => {
    const json = (status: number, value: unknown, headers = {}) => { res.writeHead(status, {'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(value)); };
    try {
      invariant(req.headers.host === url.host, 'foreign_host',403);
      invariant(!req.headers.origin || req.headers.origin === options.origin, 'foreign_origin',403);
      const requestPath = new URL(req.url || '/', options.origin).pathname;
      // Permit links/bookmarks to public documents, never cross-site API reads or
      // mutations. Cookies remain SameSite=Strict; private API access is unchanged.
      const publicNavigation = req.method === 'GET' && ['/', '/wallet'].includes(requestPath)
        && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
      invariant(publicNavigation || !['cross-site','same-site'].includes(String(req.headers['sec-fetch-site'])), 'foreign_site',403);
      if (req.method !== 'GET') invariant(req.headers.origin === options.origin, 'origin_required',403);
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Cache-Control','no-store');
      const path = new URL(req.url || '/', options.origin).pathname;
      if (req.method === 'GET' && ['/','/wallet','/wallet.bundle.js','/judge.js','/style.css'].includes(path)) {
        const file = path === '/' ? 'judge.html' : path === '/wallet' ? 'wallet.html' : path === '/judge.js' ? 'judge-public.js' : path.slice(1);
        res.setHeader('content-type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/css');
        return res.end(readFileSync(new URL(file,import.meta.url)));
      }
      if (req.method === 'GET' && path === '/healthz') return json(200,{ok:true,network:NETWORK});
      // Finite static, sanitized evidence. No database state, session or signed payload.
      if (req.method === 'GET' && path === '/evidence.json') { res.setHeader('content-type','application/json');return res.end(readFileSync(new URL('evidence.json',import.meta.url))); }
      db.prepare('DELETE FROM judge_rates WHERE until_ms<=?').run(clock());
      limit('global',options.globalLimit || 120,60000);
      if (req.method==='GET' && path==='/api/examples') { limit('examples',10,60000); return json(200,await judgeExamples()); }
      const cookies = String(req.headers.cookie || '').split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='));
      invariant(cookies.length<=1,'invalid_session',401);
      let value = cookies[0]?.slice(COOKIE.length+1);
      if (!value && req.method === 'GET' && path === '/api/session') {
        limit('issuance',20,60000);
        const plain = `${randomBytes(24).toString('hex')}.${clock()+LIFE}`;
        value = `${plain}.${mac('cookie:'+plain)}`;
        res.setHeader('Set-Cookie',`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`);
      }
      invariant(value && /^[a-f0-9]{48}\.\d{13}\.[a-f0-9]{64}$/.test(value),'session_required',401);
      const [owner,expiry,signature] = value.split('.');
      invariant(equal(signature,mac(`cookie:${owner}.${expiry}`)) && Number(expiry)>clock() && Number(expiry)<=clock()+LIFE,'session_expired_or_invalid',401);
      const csrf = mac('csrf:'+value);
      limit('session:'+owner,options.sessionLimit || 60,60000);
      if(req.method==='GET' && path==='/api/session') return json(200,{token:csrf,merchant:JUDGE_MERCHANT,merchantLocked:true,rpcPath:'/api/rpc',mode:'devnet-judge',network:NETWORK,mint:MINT,amountAtomic:PRICE,expiresAt:Number(expiry)});
      // SDK RPC cannot attach the CSRF header, but must send the secure same-origin
      // cookie and an exact Origin, validated above. Never put bearer tokens in URLs.
      if(req.method==='POST' && path==='/api/rpc') {
        limit('rpc:'+owner,30,60000); const body=await readBody(req); assertReadMethod(body.method);
        invariant(Array.isArray(body.params) && body.params.length<=3 && JSON.stringify(body.params).length<=2048,'rpc_parameters_invalid');
        return json(200,{jsonrpc:'2.0',id:body.id,result:await rpc(body.method,body.params)});
      }
      invariant(equal(String(req.headers.authorization || ''),'Bearer '+csrf),'unauthorized',401);
      if(req.method==='POST' && path==='/api/readiness') { limit('checks:'+owner,6,60000);return json(200,await publicReadiness(rpc,options.fetcher)); }
      if(req.method==='POST' && path==='/api/configure') {
        limit('checks:'+owner,6,60000);const body=await readBody(req);
        invariant(body.payTo===JUDGE_MERCHANT,'fixed_merchant_required',403);
        const payer=svmAddress(body.payer);
        return json(200,{readiness:await publicReadiness(rpc,options.fetcher),accounts:await walletReadiness(rpc,payer,JUDGE_MERCHANT)});
      }
      if(req.method==='POST' && path==='/api/orders') {
        limit('quotes:'+owner,5,3600000);const body=await readBody(req);
        // Reserve a finite lifetime capacity before async quote creation. Failed
        // validation consumes capacity too: fail closed under hostile input.
        limit('lifetime-orders',options.maxOrders || 1000,Number.MAX_SAFE_INTEGER-clock());
        const order=await service.quote(body.input,body.payer);
        db.prepare('INSERT INTO judge_owners VALUES (?,?)').run(order.id,owner);
        return json(201,order);
      }
      const match=/^\/api\/orders\/([a-f0-9-]{36})(?:\/(report|reconcile))?$/.exec(path);
      invariant(match,'not_found',404);const [,id,action]=match;
      // Same response for foreign and absent order IDs; check before all reads/RPC.
      invariant(db.prepare('SELECT owner FROM judge_owners WHERE id=?').get(id)?.owner===owner,'order_not_found',404);
      const order=store.get(id);
      if(req.method==='GET'&&!action)return json(200,order);
      invariant(req.method==='POST','method_not_allowed',405);const body=await readBody(req);
      if(action==='report') {
        invariant(digest(reportInput(body))===order.requestDigest,'request_changed',409);
        const header=req.headers['payment-signature'];
        if(!header) { invariant(order.state==='quoted'&&clock()<order.expiresAt,'quote_unavailable',409);return json(402,service.required(order),{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(service.required(order))}); }
        invariant(typeof header==='string','invalid_payment_header');limit('payments:'+owner,5,60000);
        const result=await service.purchase(id,body,header);
        return json(result.state==='delivered'?200:202,result,result.state==='delivered'&&result.settlement?{'PAYMENT-RESPONSE':encodePaymentResponseHeader(result.settlement)}:{});
      }
      if(action==='reconcile') {
        limit('reconcile:'+owner,10,60000);
        invariant(body.transaction===undefined||(typeof body.transaction==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(body.transaction)),'invalid_transaction_signature');
        const result=await service.reconcile(id,body.transaction);return json(result.state==='delivered'?200:202,result);
      }
      invariant(false,'not_found',404);
    } catch(error) { if(!res.headersSent) json(error instanceof Problem?error.status:503,{error:error instanceof Problem?error.code:'request_failed'});else res.destroy(); }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=40;
  server.on('close',()=>{db.close();store.close();});
  return {server};
}
async function main() {
  const origin=process.env.JUDGE_ORIGIN || '';
  const secret=process.env.JUDGE_SESSION_SECRET || '';
  const dbPath=process.env.JUDGE_DB_PATH || '';
  invariant(dbPath && resolve(dbPath)===dbPath,'absolute_persistent_db_path_required');
  invariant(origin.startsWith('https://') && /^[a-f0-9]{64,128}$/.test(secret),'judge_configuration_required');
  const port=Number(process.env.PORT || 4032);invariant(Number.isInteger(port)&&port>0&&port<65536,'invalid_port');
  mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
  const gateway=createDevnetGateway({allowNetwork:true,facilitatorUrl:FACILITATOR_URL,rpcUrl:RPC_URL,payTo:JUDGE_MERCHANT});
  await gateway.initialize(); // Public supported capability only.
  const {server}=createJudgeServer({origin,dbPath,sessionSecret:secret,gateway});
  const listening=()=>console.log('AgentPay judge service: Devnet only; explicit user signing/submission required');
  if(process.env.JUDGE_LISTEN==='platform')server.listen(port,listening);
  else server.listen(port,'localhost',listening);
  const close=()=>server.close(()=>process.exit(0));process.once('SIGTERM',close);process.once('SIGINT',close);
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Judge startup failed; check explicit configuration and public capability.');process.exitCode=1;});
