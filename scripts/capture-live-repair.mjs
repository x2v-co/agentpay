import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.CAPTURE_DIR;
assert(output && path.isAbsolute(output), 'Set an absolute CAPTURE_DIR');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: output, size: { width: 1440, height: 900 } } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.EVIDENCE_URL || 'http://127.0.0.1:4025/live-repair.html');
  await page.getByText('Saved evidence loaded; output digest verified in this browser.', { exact: true }).waitFor();
  assert.equal(await page.locator('#results .pass').count(), 3);
  const captions = [], started = Date.now();
  async function scene(selector, caption, seconds = 8) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    const start = (Date.now() - started) / 1000;
    await page.evaluate(text => {
      let c = document.getElementById('recording-caption');
      if (!c) { c = document.createElement('div'); c.id = 'recording-caption'; c.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:18px 48px;background:#06131ff5;color:white;font:20px/1.5 system-ui;z-index:100'; document.body.append(c); }
      c.textContent = text;
    }, caption);
    await page.waitForTimeout(seconds * 1000);
    captions.push({ start, end: (Date.now() - started) / 1000, text: caption });
  }
  await scene('header', 'A real paid repair, completed September 10. This recording reviews saved evidence; it does not replay signatures or make another purchase.');
  await scene('#payment', 'The owner authorized at most 0.1 test USDC. Actual settlement: 0.000033 test USDC for 131 input and 89 output tokens.');
  await scene('#baseline', 'The baseline charges twice when the same key is retried. First-request and distinct-key tests already pass.');
  await scene('#repair', 'OpenRouter returned this exact JavaScript. The retry guard returns the original receipt before incrementing charges.', 10);
  await scene('#tests', 'The unchanged generated output passed all three tests in a network-blocked browser Worker. These are owner-reported tests, not cryptographic attestations.');
  await scene('#proof', 'The same purchase matched a successful Monad transfer: expected payer, merchant, asset and 33 atomic USDC. Public proof and transaction links are retained.', 10);
  await page.screenshot({ path: path.join(output, 'evidence-desktop.png'), fullPage: true });
  await page.evaluate(() => document.getElementById('recording-caption').remove());
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  const video = page.video(); await context.close();
  await video.saveAs(path.join(output, 'live-repair.webm')); await video.delete();
  const stamp = s => new Date(Math.round(s * 1000)).toISOString().slice(11, 23);
  await writeFile(path.join(output, 'live-repair.vtt'), `WEBVTT\n\n${captions.map(c => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n')}`);
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({ passed: true, evidenceType: 'completed real paid repair; retrospective evidence walkthrough', checks: ['output-digest', 'three-passing-tests', 'mobile-no-overflow', 'no-page-errors'], durationSeconds: captions.at(-1).end }, null, 2));
  console.log('Real repair evidence video recorded and checked.');
} finally { await browser.close(); }
