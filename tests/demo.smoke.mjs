import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";

const [html, css, script] = await Promise.all([
  readFile(new URL("../apps/demo/index.html", import.meta.url), "utf8"),
  readFile(new URL("../apps/demo/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../apps/demo/app.js", import.meta.url), "utf8"),
]);

execFileSync(process.execPath, [
  "--check",
  new URL("../apps/demo/app.js", import.meta.url).pathname,
]);

assert.equal(
  (html.match(/class="phase/g) || []).length,
  8,
  "demo must expose all eight working-agent scenes",
);
for (const phase of [
  "WORK",
  "LOW TOKEN",
  "DISCOVER",
  "RESERVE",
  "AUTHORIZE",
  "REFUEL",
  "SETTLE",
  "RESUME",
]) {
  assert.match(html, new RegExp(`>${phase}<`), `missing ${phase} phase`);
}
for (const route of [
  "route-work",
  "route-alert",
  "route-discover",
  "route-reserve",
  "route-authorize",
  "route-refuel",
  "route-settle",
  "route-resume",
]) {
  assert.match(html, new RegExp(`id="${route}"`), `missing animated ${route}`);
}
assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
assert.match(html, /Verified trace economics/);
assert.match(html, /id="proof-id"/);
for (const storyElement of [
  "agent-story",
  "agent-status",
  "fuel-bar",
  "fuel-count",
  "fuel-forecast",
  "mission-progress",
  "runtime-log",
  "story-core",
  "experience-overlay",
  "market-browser",
  "api-console",
  "api-stage-status",
]) {
  assert.match(html, new RegExp(`id="${storyElement}"`), `missing ${storyElement}`);
}
assert.match(html, /actual settlement/i);
assert.match(html, /https:\/\/aiplans\.dev/);
assert.match(html, /https:\/\/toolkit\.fun/);
assert.match(html, /aiplans-api-pricing\.png/);
assert.match(html, /toolkit-api\.png/);
assert.match(html, /LIVE SITE CAPTURE \/ SEP 2026/);
assert.match(html, /OPEN LIVE/);
assert.match(html, /REAL AIPLANS PAGE \+ ILLUSTRATIVE AGENT DECISION OVERLAY/);
assert.match(html, /REAL TOOLKIT PAGE \+ ILLUSTRATIVE PROVISIONING OVERLAY/);
assert.match(html, /ACCOUNT CHECKOUT/);
assert.match(html, /AGENTPAY READY/);
assert.match(html, /delegated \/ no copied key/);
assert.match(html, /\/api\/agentpay\/v1\/models\/zhipu\/GLM-4\.7-Flash\/invoke/);
assert.match(html, /BUY<\/span> agentpay\.buy/);
for (const verifiedValue of [
  "CNY 0 / 0",
  "USD \.06 / \.40",
  "2 / 8 ATOMIC",
  "1,024 input estimate / 256 output cap",
  "17 input + 256 output = 273 tokens",
  "128,000 max input / 4,096 max output",
  "toolkit-demo-2026-09",
  "1 atomic = 0.000001 USDC",
  "0.100000 USDC",
  "0.099999 USDC",
]) {
  assert.ok(html.includes(verifiedValue), `missing verified value: ${verifiedValue}`);
}
for (const inventedValue of ["140 tokens", "2,300 tokens", "CNY 49", "outputCap\": 2300"]) {
  assert.doesNotMatch(html, new RegExp(inventedValue), `invented value remains: ${inventedValue}`);
  assert.doesNotMatch(script, new RegExp(inventedValue), `invented value remains: ${inventedValue}`);
}
assert.doesNotMatch(html, /hypothetical/i);
assert.match(html, /https:\/\/aiplans\.dev\/en\/models\/glm-4\.7-flash/);
for (const timestamp of ["00:00.00", "00:02.60", "00:05.60", "00:11.10", "00:14.90", "00:20.10", "00:23.90", "00:28.10"]) {
  assert.ok(html.includes(timestamp), `missing real scene timestamp: ${timestamp}`);
}
assert.match(script, /requestAnimationFrame/);
assert.match(script, /getPointAtLength/);
assert.doesNotMatch(script, /setInterval/);
assert.match(script, /setTimeout/);
assert.match(script, /duration: 5500/);
assert.match(script, /duration: 5200/);
assert.equal(
  (script.match(/duration: \d+/g) || []).length,
  8,
  "every scene must own its presentation duration",
);
assert.match(script, /SETTLEMENT MATCHED/);
assert.match(script, /3 \/ 3 tests passing/);
assert.match(script, /checkpoint saved at retry\.ts:87/);
assert.match(script, /if \(cursor === frames\.length - 1\)/);
assert.match(script, /experienceState: "selected"/);
assert.match(script, /experienceState: "delivered"/);
assert.match(css, /@media\s*\(max-width:\s*700px\)/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /@keyframes market-camera/);
assert.match(css, /@keyframes provision-reveal/);
assert.match(css, /@keyframes phase-progress/);

for (const asset of ["aiplans-api-pricing.png", "toolkit-api.png"]) {
  const info = await stat(new URL(`../apps/demo/assets/${asset}`, import.meta.url));
  assert.ok(info.size > 50_000, `${asset} must contain a real product capture`);
}

console.log("demo structure test: ok");
