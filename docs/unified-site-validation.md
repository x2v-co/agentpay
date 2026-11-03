# Unified site local validation — 2026-11-03

Branch: `feat/unified-agentpay-site`, based on `604ea12b735d3ab8a3d639d084915898678b564e`.
No push, deployment, production redirect or payment.

## Executed

- `npm run typecheck:solana`: passed.
- `npm run build:solana`: passed.
- `npm run test:offline`: **95/95**, eight test files; general TypeScript check, reference-server smoke and demo structure smoke passed.
- `NODE_OPTIONS='--import=./scripts/offline-network-guard.mjs' node tests/solana-judge-build.smoke.mjs`: passed, including all ten product pages, static assets, sitemap, robots, preserved wallet assets, receipt and isolated offline examples. Real rail settlement calls: zero.
- `npm run check:private-imports`: passed.
- `git diff --check`: passed.
- Local static preview: ten bilingual pages and fifteen unique local links/assets returned HTTP 200; session/RPC/order routes returned 403.

Test runtime: Node 26.12.1 on macOS. Node 22 remains the declared minimum; this revision was not rerun on Node 22. No new dependency was added.
The source workspace dependency read first failed with ETIMEDOUT. A clean archive of HEAD plus the exact local changed/new files was validated in a temporary directory with the previously hydrated locked dependencies. Default sandbox runs could not bind localhost (EPERM); the complete successful rerun used approved local listener access and the external network guard. These environment failures are not counted as passing runs. No production credential was used.

## Browser checks

Chrome on the user's Mac, static preview only:
- Desktop Chinese homepage visually inspected.
- 390 × 844 mobile viewport: homepage and English developer page fit without horizontal overflow (document scroll width 375, viewport 390).
- Chinese historical replay advances to authorization, updates pressed state and visible scene.
- Language switch keeps the historical route and renders English page content/metadata.
- Solana demo shows saved evidence and scope; local example button returns an explicit static-preview notice, not a fake settlement result.
- Wallet CTA reaches the disabled preview handoff, never wallet discovery.
- Concept selector displays Solana's verified report vs planned model-procurement boundary.
- No captured browser console errors; temporary viewport reset after checks.

Accessibility provisions: semantic headings and landmarks, skip link, visible keyboard focus, native buttons, aria-pressed scene state, polite status announcements, manual motion-free replay, responsive layout. This is not a full screen-reader or WCAG conformance audit.

## Remaining scope / release gates

- New marketing/documentation pages are bilingual. Existing wallet controls remain Chinese, explicitly disclosed before entry; wallet code is unchanged.
- Historical replay is a manual accessible adaptation of the original three-act fixture, not a pixel-identical animation migration.
- Existing evidence JSON is unchanged. No new real transaction or production provider readiness test was performed.
- Old Toolkit pages are untouched. Migration mappings and two-stage redirects are proposals in `unified-site-migration.md`.
- Source links target the already-published implementation branch until this local site is approved for publication; pin them to the approved release commit before release.
- Preview is a detached loopback process, not a persistent system service. If stopped, rebuild and run `node scripts/preview-site.mjs`; it does not restart automatically after reboot.

## Narrative animation update

Overview and multichain-concept pages now have a bilingual, finite, user-started walkthrough: Agent → AIPlans → Toolkit → x402 HTTP 402 → wallet consent → settlement evidence → result. Three selectable outcomes cover confirmed delivery, pending/reconciliation and declined authorization. The same illustrative order and attempt counter make the recovery boundary visible. No fetch, wallet API, signing, payment or persisted browser state is used by this animation.

Re-executed `typecheck:solana`, `build:solana`, `test:offline` (95/95 plus reference/demo smoke) and built judge smoke: all passed; real rail settle calls zero. Payment server code and routes were not changed by this animation update.

Chrome checks: Chinese overview has all steps; recovery reaches pending with one attempt and then delivered with the same one attempt; declined authorization reaches stopped with zero attempts. Enter key advances native controls. Emulated prefers-reduced-motion disables Play and retains manual Next; emulation reset after inspection. English concept page at 390×844 fits without horizontal overflow (scroll width 375). Playback advances through stages; finite completion and pause controls are checked in the live preview. No automatic start or infinite looping. Existing manual historical replay remains separate.
