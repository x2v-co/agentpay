// Loopback-only static review server. No wallet bundle, sessions, RPC or orders.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {renderSite,sitemap} from '../dist/solana/apps/solana-demo/site.js';
const assets = {'/exhibit-player.js':'exhibit-player.js','/site.css':'site.css','/site-interactions.js':'site-interactions.js','/judge.js':'judge-public.js','/evidence.json':'evidence.json'};
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
 if(req.headers.host!=='localhost:4033'){res.writeHead(403);return res.end('Local preview only');}
 const path=new URL(req.url,'http://localhost:4033').pathname;
 if(req.method!=='GET'){res.writeHead(405);return res.end('Preview: no mutations');}
 const page=renderSite(path);
 if(page){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page.replace(/<body[^>]*>/,'$&<aside class="notice" role="note">LOCAL PREVIEW / 本地预览 · 钱包与付款已禁用 / Wallet and payments disabled</aside>'));}
 if(path==='/wallet'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本地预览：付款禁用</title><link rel="stylesheet" href="/site.css"><main><h1>本地预览不连接钱包。</h1><p>Local preview: wallet, RPC, signing and payment are disabled. 生产钱包路由保持不变；本页不代理生产服务。</p><a href="/zh/demo">返回演示 / Back to demo</a></main></html>');}
 if(path==='/api/examples'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({mode:'static-preview',message:'本地静态预览未运行支付状态机。Offline state-machine examples are verified separately by tests; no payment occurred.'}));}
 if(path.startsWith('/api/')){res.writeHead(403);return res.end('Preview has no API access');}
 if(path==='/sitemap.xml'){res.setHeader('Content-Type','application/xml');return res.end(sitemap());}
 if(Object.hasOwn(assets,path)){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.json')?'application/json':'text/javascript');return res.end(readFileSync(new URL('../dist/solana/apps/solana-demo/'+assets[path],import.meta.url)));}
 res.writeHead(404);res.end('Not found');
});
server.listen(4033,'localhost',()=>console.log('Static review: http://localhost:4033/zh — no payments'));
