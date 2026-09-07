import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

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
assert.match(html, /id="usage"/);
assert.match(html, /type="range"/);
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
assert.match(html, /DEMO CATALOG VIEW/);
assert.match(html, /HUMAN CHECKOUT/);
assert.match(html, /AGENTPAY READY/);
assert.match(html, /DEMO PROVISIONING VIEW/);
assert.match(html, /delegated \/ no copied key/);
assert.match(html, /\/api\/agentpay\/v1\/models\/zhipu\/GLM-4\.7-Flash\/invoke/);
assert.match(html, /POST<\/span> selectedOffer\.route/);
assert.match(script, /requestAnimationFrame/);
assert.match(script, /getPointAtLength/);
assert.match(script, /SETTLEMENT MATCHED/);
assert.match(script, /3 \/ 3 tests passing/);
assert.match(script, /checkpoint saved at retry\.ts:87/);
assert.match(script, /if \(cursor === frames\.length - 1\) stop\(\)/);
assert.match(script, /experienceState: "selected"/);
assert.match(script, /experienceState: "delivered"/);
assert.match(css, /@media\s*\(max-width:\s*700px\)/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);

console.log("demo structure test: ok");
