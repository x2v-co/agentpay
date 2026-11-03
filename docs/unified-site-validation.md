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

Overview and multichain-concept pages now have a bilingual, finite walkthrough: Agent → AIPlans → Toolkit → x402 HTTP 402 → wallet consent → settlement evidence → result. Three selectable outcomes cover confirmed delivery, pending/reconciliation and declined authorization. The same illustrative order and attempt counter make the recovery boundary visible. No fetch, wallet API, signing, payment or persisted browser state is used by this animation.

Re-executed `typecheck:solana`, `build:solana`, `test:offline` (95/95 plus reference/demo smoke) and built judge smoke: all passed; real rail settle calls zero. Payment server code and routes were not changed by this animation update.

Chrome checks: Chinese overview has all steps; recovery reaches pending with one attempt and then delivered with the same one attempt; declined authorization reaches stopped with zero attempts. Enter key advances native controls. Emulated prefers-reduced-motion disables Play and retains manual Next; emulation reset after inspection. English concept page at 390×844 fits without horizontal overflow (scroll width 375). Playback advances through stages; finite completion and pause controls are checked in the live preview. The initial manual-start behavior was superseded by the autoplay update below; there is still no infinite looping. Existing manual historical replay remains separate.


## Autoplay update

Per user request, overview and concept stories automatically play once on page entry. Pause, Next and Reset remain available. Switching outcomes while playing starts that outcome; switching after a manual pause keeps it paused. Reset stays paused for inspection. Reduced-motion users get a static first step and manual Next, never autoplay. Hidden-page/pagehide events pause playback; the historical three-scene replay is unchanged.

Validation: Solana TypeScript compilation/build and built judge smoke passed on this revision (real rail settlement calls zero). Browser checked Chinese load starts with Pause and advances without input; running branch switch continues, keyboard Pause and branch switch preserve paused state. Reload with emulated reduced motion stays on 01/07 with Play disabled, while Enter on Next advances. English concept page starts automatically at mobile 390×844. Media/viewport emulation is restored after checking. The previous 95/95 full regression belongs to the preceding animation revision; this small autoplay change did not rerun the full suite.
Final browser observation: English mobile autoplay reached 07/07 Delivered with one illustrative attempt, restored the Play label and disabled Next. Reset returned to 01/07 paused. No horizontal overflow (scroll width 375, viewport 390).

## Whole-site visual redesign — latest validation

The five public product routes (ten EN/ZH pages) now use the approved v5 film's deep-ink background, mint pathways and amber scope labels. The v5 source and final contact sheet were inspected as references; no video, GSAP runtime, external font, image payload or analytics dependency was imported.

Each page has a distinct first-screen animated exhibit:
- Overview: task → discovery/offer → policy ceiling → recovery concept.
- Solana: saved 0.001 test USDC quote → historical balance delta → finalized slot → computed report. Explicitly a replay of saved evidence, never a new payment.
- Developers: authored request → HTTP 402 terms → signature/verification boundary → HTTP 200/recovery contract. No request is executed.
- Monad history: archive discovery → upto/Permit2 example cap → durable usage receipt.
- Multichain concept: Monad implementation, Base concept and independently verified Solana report, without claiming integrated model procurement.

Autoplay starts once when a panel first enters the viewport, so below-fold content does not finish unseen. Panels pause when offscreen or hidden. Each has Pause/Next/Restart and direct chapter buttons; global Pause motion also suppresses autoplay of unseen panels. Reduced motion disables automatic playback and CSS transitions/animations. Manual changes announce the scene title; automatic playback does not continuously interrupt assistive technology. Existing wallet controls and payment routes remain unchanged.

Final automated run: **100/100 tests across nine files** (five new deterministic playback lifecycle tests), general TypeScript, Solana TypeScript/build, reference-server smoke, demo smoke, and built judge smoke all passed. Real rail settlement calls zero. Playback tests cover first visibility, single completion, pause, manual chapters/reset, reduced motion, background pause and global pause before first view. Private-import check passed before the final test-only/typography additions. `git diff --check` passed.

Browser QA: screenshots inspected for all five desktop pages and all five Chinese mobile panels; all five English pages checked at 390×844, with scroll width 375 and no horizontal overflow. Chapter controls work across routes. Reduced-motion mode disables Play on every English page, Enter on Next still works. English developer exhibit was observed autoplaying after media reset. No captured console errors. Browser emulation was reset afterward. This is visual/functional QA, not a full screen-reader or independent accessibility audit.

Final local HTTP crawl: all ten pages and sixteen distinct local links/assets returned 200; preview session/order/RPC endpoints returned 403. Preview banner is present on all ten pages. Max HTML payload 15,488 bytes; stylesheet 21,903 bytes (gzip estimate 5,686), exhibit player 2,938 (gzip 1,161), existing interaction script 4,366 (gzip 1,807). Gzip figures are estimates from local compression, not a claim about deployed compression or Core Web Vitals.

Tests used Node 26.12.1 and the hydrated temporary copy with exact implementation files; Node 22 was not rerun. No new chain transaction, production readiness check, deployment, push, DNS or old-site change occurred. Preview runs only on localhost and cannot pay. The wallet handoff is intentionally excluded from the public-site animation redesign.
