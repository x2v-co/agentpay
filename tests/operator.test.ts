import { describe, it, expect } from 'vitest';
import { hashTypedData } from 'viem';
// @ts-ignore local Node operator module
import { createOperatorApp, assertQuote, assertTestnetOffer, walletTypedData, NETWORK } from '../apps/operator/server.mjs';
import { policyTypedData } from '../packages/protocol/src/index.js';

describe('local wallet operator safety boundary', () => {
  const offer = { fulfillment:'machine', network:'eip155:10143', asset:NETWORK.asset, payTo:NETWORK.payTo, providerSlug:'zhipu', modelSlug:'GLM-4.7-Flash', x402MaxAtomic:'100000', route:'/api/agentpay/v1/models/zhipu/GLM-4.7-Flash/invoke' };
  const quote = { accepts:[{ scheme:'upto', network:offer.network, asset:offer.asset, payTo:offer.payTo, amount:'100000', maxTimeoutSeconds:300, extra:{ assetTransferMethod:'permit2' } }] };
  it('pins the testnet merchant, model, asset and ceiling', () => {
    expect(() => assertTestnetOffer(offer)).not.toThrow();
    for (const change of [{network:'eip155:143'}, {payTo:'0x0000000000000000000000000000000000000001'}, {asset:'0x0000000000000000000000000000000000000001'}, {x402MaxAtomic:'100001'}, {fulfillment:'human_checkout'}, {route:'https://bad.example/invoke'}]) expect(() => assertTestnetOffer({...offer,...change})).toThrow();
  });
  it('rejects quotes above the ceiling, wrong rails and unbounded deadlines', () => {
    expect(() => assertQuote(quote)).not.toThrow();
    for (const change of [{amount:'100001'}, {amount:'-1'}, {network:'eip155:143'}, {maxTimeoutSeconds:86400}, {maxTimeoutSeconds:0}, {extra:{assetTransferMethod:'eip3009'}}]) expect(() => assertQuote({accepts:[{...quote.accepts[0],...change}]})).toThrow();
  });
  it('preserves the EIP-712 digest when serializing for browser wallets', () => {
    const payload = policyTypedData({schema:'agentpay.policy.v1', policyId:`0x${'1'.repeat(64)}`, owner:NETWORK.payTo, agentWallet:NETWORK.payTo, chainId:10143, asset:NETWORK.asset, maxTotalAtomic:'100000', maxPerRequestAtomic:'100000', allowedPayTo:[NETWORK.payTo], allowedModels:['zhipu/GLM-4.7-Flash'], validUntil:2000000000});
    expect(hashTypedData(walletTypedData(payload))).toBe(hashTypedData(payload));
    expect(() => walletTypedData({...payload,primaryType:'Permit'})).toThrow();
    expect(() => walletTypedData({...payload,domain:{...payload.domain,chainId:1}})).toThrow();
  });
  it('requires local origin, session token, consent and failed baseline before a run', async () => {
    let actualPort = 0;
    const operator = createOperatorApp({port:()=>actualPort});
    const server = operator.app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as {port:number};
    actualPort = address.port;
    const base = `http://127.0.0.1:${address.port}`;
    const headers = {origin:base,'content-type':'application/json'};
    try {
      expect((await fetch(`${base}/api/session`,{headers:{...headers,origin:'https://evil.example'}})).status).toBe(403);
      const session = await (await fetch(`${base}/api/session`,{headers})).json();
      expect(session.status).toBe('idle');
      const post = (route:string, body:unknown, extra={}) => fetch(`${base}/api/${route}`,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
      expect((await post('start',{wallet:NETWORK.payTo,consent:true,baselinePassed:false})).status).toBe(403);
      const auth = {'x-operator-token':session.token};
      expect((await post('start',{wallet:NETWORK.payTo,consent:false,baselinePassed:false},auth)).status).toBe(400);
      expect((await post('start',{wallet:NETWORK.payTo,consent:true,baselinePassed:true},auth)).status).toBe(400);
      expect((await post('signature',{id:'stale',signature:'0x00'},auth)).status).toBe(409);
      expect((await post('tests',{tests:[{pass:true},{pass:true},{pass:true}]},auth)).status).toBe(409);
      expect((await post('reconcile',{},auth)).status).toBe(409);
      const worker = await fetch(`${base}/evaluate-worker.js`,{headers});
      expect(worker.headers.get('content-security-policy')).toContain("connect-src 'none'");
      expect(worker.headers.get('content-security-policy')).toContain("worker-src 'none'");
      expect((await (await fetch(`${base}/api/state`,{headers})).json()).status).toBe('idle');
    } finally { operator.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
