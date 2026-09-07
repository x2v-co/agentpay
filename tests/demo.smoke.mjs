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
  6,
  "demo must expose all six purchase phases",
);
for (const phase of [
  "DISCOVER",
  "RESERVE",
  "AUTHORIZE",
  "EXECUTE",
  "SETTLE",
  "RECEIPT",
]) {
  assert.match(html, new RegExp(`>${phase}<`), `missing ${phase} phase`);
}
for (const route of [
  "route-discover",
  "route-reserve",
  "route-authorize",
  "route-settle",
  "route-receipt",
]) {
  assert.match(html, new RegExp(`id="${route}"`), `missing animated ${route}`);
}
assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
assert.match(html, /id="usage"/);
assert.match(html, /type="range"/);
assert.match(html, /id="proof-id"/);
assert.match(html, /actual settlement/i);
assert.match(html, /https:\/\/aiplans\.dev/);
assert.match(html, /https:\/\/toolkit\.fun/);
assert.match(script, /requestAnimationFrame/);
assert.match(script, /getPointAtLength/);
assert.match(script, /SETTLEMENT MATCHED/);
assert.match(css, /@media\s*\(max-width:\s*700px\)/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);

console.log("demo structure test: ok");
