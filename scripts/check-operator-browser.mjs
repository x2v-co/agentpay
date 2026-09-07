import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch();
const output = await mkdtemp(path.join(tmpdir(), 'agentpay-operator-qa-'));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.OPERATOR_URL || 'http://127.0.0.1:4022/');
  await page.locator('#baseline').filter({ hasText: 'function createCheckout' }).waitFor();
  await page.locator('#baseline-run').click();
  await page.locator('#baseline-tests .fail').waitFor();
  assert.equal(await page.locator('#baseline-tests .pass').count(), 2);
  assert.ok(await page.locator('#start').isDisabled());
  assert.ok(await page.locator('#approve').isDisabled());
  const state = await page.request.get(new URL('/api/state', page.url()).href);
  assert.equal((await state.json()).status, 'idle');
  const result = await page.evaluate(async () => {
    const source = 'function createCheckout() { const receipts = new Map(); let charges = 0; return { pay(key) { if (receipts.has(key)) return receipts.get(key); const receipt = {id: "receipt-" + (++charges), key}; receipts.set(key,receipt); return receipt; }, get charges(){return charges;} }; }';
    const worker = new Worker('./evaluate-worker.js');
    return await new Promise(resolve => { const timeout = setTimeout(() => { worker.terminate(); resolve({ error: 'timeout' }); }, 3000); worker.onmessage = e => { clearTimeout(timeout); worker.terminate(); resolve(e.data); }; worker.postMessage({source}); });
  });
  assert.ok(result.tests.every(test => test.pass));
  const networkBlocked = await page.evaluate(async () => {
    const worker = new Worker('./evaluate-worker.js');
    return await new Promise(resolve => {
      const timeout = setTimeout(() => { worker.terminate(); resolve(false); }, 3000);
      worker.onmessage = e => { if ('networkBlocked' in e.data) { clearTimeout(timeout); worker.terminate(); resolve(e.data.networkBlocked); } };
      worker.postMessage({source:'function createCheckout() { fetch("/api/session").then(()=>self.postMessage({networkBlocked:false})).catch(()=>self.postMessage({networkBlocked:true})); throw new Error("probe"); }'});
    });
  });
  assert.equal(networkBlocked, true);
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  assert.deepEqual(errors, []);
  console.log(`Operator browser checks passed; no wallet request or payment sent. Screenshots: ${output}`);
} finally { await browser.close(); }
