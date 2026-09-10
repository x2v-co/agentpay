import { describe, it, expect } from 'vitest';
import { hashTypedData } from 'viem';
// @ts-ignore local Node operator module
import { createOperatorApp, assertQuote, assertTestnetOffer, walletTypedData, NETWORK, PROVIDERS, validateRecoveryChallenge, reconciliationStatus } from '../apps/operator/server.mjs';
import { policyTypedData, policyListHashes } from '../packages/protocol/src/index.js';

describe('local wallet operator safety boundary', () => {
  const offer = { fulfillment:'machine', network:'eip155:10143', asset:NETWORK.asset, payTo:NETWORK.payTo, providerSlug:'zhipu', modelSlug:'GLM-4.7-Flash', x402MaxAtomic:'100000', route:'/api/agentpay/v1/models/zhipu/GLM-4.7-Flash/invoke' };
  const quote = { accepts:[{ scheme:'upto', network:offer.network, asset:offer.asset, payTo:offer.payTo, amount:'100000', maxTimeoutSeconds:300, extra:{ assetTransferMethod:'permit2' } }] };
  it('pins the testnet merchant, model, asset and ceiling', () => {
    expect(() => assertTestnetOffer(offer)).not.toThrow();
    for (const change of [{network:'eip155:143'}, {payTo:'0x0000000000000000000000000000000000000001'}, {asset:'0x0000000000000000000000000000000000000001'}, {x402MaxAtomic:'100001'}, {fulfillment:'human_checkout'}, {route:'https://bad.example/invoke'}]) expect(() => assertTestnetOffer({...offer,...change})).toThrow();
  });
  it('accepts only the explicitly selected provider route, never an automatic fallback', () => {
    const openrouter = {...offer, providerSlug:'openrouter', modelSlug:'z-ai/glm-5.3-flash', route:PROVIDERS.openrouter.route};
    expect(() => assertTestnetOffer(openrouter, 'openrouter')).not.toThrow();
    expect(() => assertTestnetOffer(openrouter)).toThrow();
    expect(() => assertTestnetOffer(offer, 'openrouter')).toThrow();
    for (const change of [{modelSlug:'another-model'}, {route:offer.route}, {x402MaxAtomic:'-1'}, {x402MaxAtomic:'100001'}, {network:'eip155:143'}]) expect(() => assertTestnetOffer({...openrouter,...change},'openrouter')).toThrow();
    expect(() => createOperatorApp({port:4023,provider:'unconfigured'})).toThrow(/Unsupported/);
    expect(() => createOperatorApp({port:4023,provider:'constructor'})).toThrow(/Unsupported/);
  });
  it('rejects quotes above the ceiling, wrong rails and unbounded deadlines', () => {
    expect(() => assertQuote(quote)).not.toThrow();
    expect(() => assertQuote({ accepts: [{ ...quote.accepts[0], maxTimeoutSeconds: 3599 }] })).not.toThrow();
    for (const change of [{amount:'100001'}, {amount:'-1'}, {network:'eip155:143'}, {maxTimeoutSeconds:3601}, {maxTimeoutSeconds:0}, {extra:{assetTransferMethod:'eip3009'}}]) expect(() => assertQuote({accepts:[{...quote.accepts[0],...change}]})).toThrow();
  });
  it('preserves the EIP-712 digest when serializing for browser wallets', () => {
    const payload = policyTypedData({schema:'agentpay.policy.v1', policyId:`0x${'1'.repeat(64)}`, owner:NETWORK.payTo, agentWallet:NETWORK.payTo, chainId:10143, asset:NETWORK.asset, maxTotalAtomic:'100000', maxPerRequestAtomic:'100000', allowedPayTo:[NETWORK.payTo], allowedModels:['zhipu/GLM-4.7-Flash'], validUntil:2000000000});
    expect(hashTypedData(walletTypedData(payload))).toBe(hashTypedData(payload));
    expect(() => walletTypedData({...payload,primaryType:'Permit'})).toThrow();
    expect(() => walletTypedData({...payload,domain:{...payload.domain,chainId:1}})).toThrow();
  });
  it('distinguishes reservations and terminal failures from settlement pending', () => {
    expect(reconciliationStatus('reserved')).toBe('reserved-no-payment');
    expect(reconciliationStatus('reservation_expired')).toBe('stopped');
    expect(reconciliationStatus('failed_unsettled')).toBe('stopped');
    expect(reconciliationStatus('execution_unknown')).toBe('execution-unknown');
    expect(reconciliationStatus('facilitator_settled')).toBe('pending');
  });
  const purchaseId = 'eab0d9b6-0372-440c-9c4c-fea04aa09677';
  const recoveryUrl = `${NETWORK.merchant}/api/agentpay/v1/purchases/${purchaseId}/reconciliation`;
  function challenge(expired = false) {
    return { code: 'access_token_lost', extensions: { 'sign-in-with-x': { info: { domain: 'staging.toolkit.fun', uri: recoveryUrl, requestId: purchaseId, statement: 'Recover this AgentPay purchase result', version: '1', nonce: 'nonce0001', issuedAt: new Date().toISOString(), expirationTime: new Date(Date.now() + (expired ? -60000 : 300000)).toISOString() }, supportedChains: [{ chainId: 'eip155:10143', type: 'eip191' }] } } };
  }
  it('rejects expired, cross-origin and cross-purchase recovery messages before signing', () => {
    expect(() => validateRecoveryChallenge(challenge(), recoveryUrl, purchaseId)).not.toThrow();
    expect(() => validateRecoveryChallenge(challenge(true), recoveryUrl, purchaseId)).toThrow(/expired/);
    expect(() => validateRecoveryChallenge(challenge(), recoveryUrl.replace('staging.toolkit.fun', 'evil.example'), purchaseId)).toThrow(/merchant/);
    const wrong = challenge(); wrong.extensions['sign-in-with-x'].info.requestId = 'another-purchase';
    expect(() => validateRecoveryChallenge(wrong, recoveryUrl, purchaseId)).toThrow(/purchase/);
  });
  it.each([false, true])('recovers only the existing purchase; expired challenge=%s never asks for a signature', async expired => {
    let actualPort = 0;
    const calls: Array<{url:string;init:RequestInit}> = [];
    const operator = createOperatorApp({ port: () => actualPort, initialPurchase: { purchaseId, wallet: NETWORK.payTo }, fetcher: async (url:string, init:RequestInit = {}) => {
      calls.push({url,init});
      if (new Headers(init.headers).has('sign-in-with-x')) return Response.json({purchaseId,state:'reserved'});
      return Response.json(challenge(expired), {status:402});
    } });
    const server = operator.app.listen(0,'127.0.0.1');
    await new Promise<void>(resolve => server.once('listening',resolve));
    actualPort = (server.address() as {port:number}).port;
    const base = `http://127.0.0.1:${actualPort}`;
    try {
      const session = await (await fetch(`${base}/api/session`)).json();
      const post = (path:string,body:unknown) => fetch(`${base}/api/${path}`, {method:'POST',headers:{origin:base,'content-type':'application/json','x-operator-token':session.token},body:JSON.stringify(body)});
      expect(session.status).toBe('recovery-required');
      expect((await post('start',{wallet:NETWORK.payTo,consent:true,baselinePassed:false})).status).toBe(409);
      expect((await post('recover',{wallet:'0x0000000000000000000000000000000000000001'})).status).toBe(409);
      expect((await post('recover',{wallet:NETWORK.payTo})).status).toBe(200);
      let state:any;
      await expect.poll(async () => { state = await (await fetch(`${base}/api/state`)).json(); return expired ? state.status : Boolean(state.pending); }).toBe(expired ? 'recovery-blocked' : true);
      if (!expired) {
        expect(state.pending.message).toContain('staging.toolkit.fun');
        expect(state.pending.message).toContain(purchaseId);
        expect(state.pending.typedData).toBeUndefined();
        expect((await post('signature',{id:state.pending.id,signature:`0x${'11'.repeat(65)}`})).status).toBe(200);
        await expect.poll(async () => (await (await fetch(`${base}/api/state`)).json()).status).toBe('reserved-no-payment');
      } else {
        expect(state.pending).toBeNull();
        expect(state.events.at(-1).message).toContain('expired');
      }
      expect(calls.every(call => call.url === recoveryUrl && !call.init.method && !new Headers(call.init.headers).has('payment-signature'))).toBe(true);
      const visible = await (await fetch(`${base}/api/state`)).text();
      expect(visible).not.toContain('sign-in-with-x');
      expect(visible).not.toContain('111111111111111111');
      expect((await post('start',{wallet:NETWORK.payTo,consent:true,baselinePassed:false})).status).toBe(409);
    } finally { operator.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); }
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
      expect((await post('retry-signature',{wallet:NETWORK.payTo},auth)).status).toBe(409);
      const worker = await fetch(`${base}/evaluate-worker.js`,{headers});
      expect(worker.headers.get('content-security-policy')).toContain("connect-src 'none'");
      expect(worker.headers.get('content-security-policy')).toContain("worker-src 'none'");
      expect((await (await fetch(`${base}/api/state`,{headers})).json()).status).toBe('idle');
    } finally { operator.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it.each(['zhipu', 'openrouter'])('binds %s policy and retries only a pre-reservation Policy timeout on the same purchase', async provider => {
    let actualPort = 0;
    const calls: Array<{url:string;init:RequestInit}> = [];
    const selected = PROVIDERS[provider];
    const currentOffer = {...offer, providerSlug:provider, modelSlug:selected.model, route:selected.route, offerId:selected.offerId, validUntil:Math.floor(Date.now()/1000)+3600, maxInputTokens:32000,maxOutputTokens:4096,inputAtomicPerMillion:'75000',outputAtomicPerMillion:'250000',rateVersion:'test',manifestDigest:'sha256:test'};
    const operator = createOperatorApp({port:()=>actualPort, provider, signatureTimeoutMs:400, rpc:{readContract:async()=>100000n,getBalance:async()=>1n}, fetcher:async (url:string,init:RequestInit={}) => {
      calls.push({url,init});
      if(url.endsWith(provider === 'zhipu' ? '/readiness' : '/readiness?provider=openrouter')) return Response.json({ok:true,mode:'live-capable',provider:{mode:provider}});
      if(url.endsWith('/discovery')) return Response.json({offers:[currentOffer]});
      if(url.endsWith('/products/grouped')) return Response.json([{id:1,slug:provider === 'openrouter' ? 'glm-5.3-flash' : selected.model,versions:[{providers:{slug:provider},currency:'USD'}]}]);
      throw new Error('Unexpected merchant write');
    }});
    const server = operator.app.listen(0,'127.0.0.1');
    await new Promise<void>(resolve=>server.once('listening',resolve));
    actualPort = (server.address() as {port:number}).port;
    const base=`http://127.0.0.1:${actualPort}`;
    try {
      const config=await (await fetch(`${base}/api/session`)).json();
      const post=(route:string,body:unknown)=>fetch(`${base}/api/${route}`,{method:'POST',headers:{origin:base,'content-type':'application/json','x-operator-token':config.token},body:JSON.stringify(body)});
      const state=async()=> (await fetch(`${base}/api/state`)).json();
      const started=await (await post('start',{wallet:NETWORK.payTo,consent:true,baselinePassed:false})).json();
      let first:any;
      await expect.poll(async()=>{first=await state();return first.pending?.typedData?.primaryType;},{interval:10}).toBe('Policy');
      const staleId=first.pending.id;
      expect(first.pending.typedData.message.allowedModelsHash).toBe(policyListHashes({allowedPayTo:[NETWORK.payTo],allowedModels:[`${provider}/${selected.model}`]}).allowedModelsHash);
      await expect.poll(async()=>(await state()).status,{interval:10}).toBe('signature-timeout');
      expect((await post('retry-signature',{wallet:'0x0000000000000000000000000000000000000001'})).status).toBe(409);
      expect((await post('retry-signature',{wallet:NETWORK.payTo})).status).toBe(200);
      expect((await post('retry-signature',{wallet:NETWORK.payTo})).status).toBe(409);
      let retried:any;
      await expect.poll(async()=>{retried=await state();return retried.pending?.typedData?.primaryType;},{interval:10}).toBe('Policy');
      expect(retried.purchaseId).toBe(started.purchaseId);
      expect(retried.pending.id).not.toBe(staleId);
      expect(retried.pending.typedData.message.policyId).not.toBe(first.pending.typedData.message.policyId);
      expect((await post('signature',{id:staleId,signature:`0x${'11'.repeat(65)}`})).status).toBe(409);
      expect((await post('signature',{id:retried.pending.id,signature:`0x${'11'.repeat(65)}`})).status).toBe(200);
      await expect.poll(async()=>(await state()).pending?.typedData?.primaryType,{interval:10}).toBe('ReservationIntent');
      await expect.poll(async()=>(await state()).status,{interval:10}).toBe('blocked-before-payment');
      expect((await post('retry-signature',{wallet:NETWORK.payTo})).status).toBe(409);
      expect((await post('start',{wallet:NETWORK.payTo,consent:true,baselinePassed:false})).status).toBe(409);
      expect(calls.every(call=>!call.init.method && !new Headers(call.init.headers).has('payment-signature'))).toBe(true);
    } finally {operator.dispose();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
});
