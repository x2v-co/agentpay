# Unified AgentPay product site — local review

Status: local implementation only. No push, deployment, DNS change or production redirect.
The product site lives on the existing judge origin; payment and order contracts are unchanged.
English and Chinese are server-rendered, not translated after load. There is no analytics, third-party script, iframe, shared auth or external font dependency.

## Routes and content

- `/`, `/zh`: unified product overview and explicit capability boundaries.
- `/demo`, `/zh/demo`: saved real Solana receipt, report and existing offline failure example.
- `/developers`, `/zh/developers`: Solana setup/recovery and separate Toolkit REST/MCP/Credits/Monad contracts.
- `/history/monad`, `/zh/history/monad`: manually operated adaptation of the original three-act Monad fixture. No new model call or transaction. This migrates its narrative/interaction, not a pixel-identical copy of the old animation.
- `/concepts/multichain`, `/zh/concepts/multichain`: explanatory comparison, no live Base payment claim and no Solana model-procurement claim.
- `/wallet`, `/api/*`, `/evidence.json`: existing contracts retained. Wallet UI remains Chinese for this release; both language versions label this before entry.

The original Monad replay source was `web/agentpay.html` in Toolkit: discover → authorize → continue, example 0.10 USDC cap. No old fake receipt is presented as new evidence. Product copy separates existing Toolkit/Monad implementation, verified Solana report and planned integration. No assertion of current upstream/provider readiness.

## Local preview

Node 22+. `npm ci`, `npm run build:solana`, `node scripts/preview-site.mjs`.
Open http://localhost:4033/zh or http://localhost:4033/.
The loopback-only preview creates no secrets or database; it denies all payment/session/RPC routes and POSTs. `/wallet` is a clearly labelled disabled handoff. Its example button shows a static-preview notice, not a fake test success. Real state-machine examples are covered separately by offline tests.

## Proposed old-site mapping (NOT installed)

Use explicit GET/HEAD routes, initially 302 with no-store during acceptance, then 301 after approval. Do not redirect POSTs. Do not forward arbitrary query parameters, session values or tokens. Handle supported language parameters deliberately; preserve relevant public anchors only.

| Old Toolkit path | New AgentPay path |
| --- | --- |
| `/agentpay` | `/` |
| `/agentpay/platform` | `/` |
| `/agentpay/developers` | `/developers` |
| `/agentpay/demo` | `/concepts/multichain` |
| `/zh/agentpay` and `/zh/agentpay/platform` | `/zh` |
| `/zh/agentpay/developers` | `/zh/developers` |
| `/zh/agentpay/demo` | `/zh/concepts/multichain` |
| corresponding `/en/...` aliases | corresponding English destination above |

Keep the historical replay readily linked from the new homepage; old `/agentpay` bookmarks previously opened that replay. Do not silently claim it is the current Solana demo. Audit `.html` aliases and lab routes in the actual deployed Toolkit version before redirecting them; lab is not migrated by this patch. Do not blanket-match `/agentpay*`. **Never redirect `/api/agentpay/*`, `/api/agentpay/mcp` or `/.well-known/agentpay.json`: the old APIs remain Toolkit APIs.**

## Release and rollback checklist

1. Review bilingual content and mobile/keyboard behavior; approve destination and release commit. Source links currently point to the already-published implementation branch, not this unpushed local branch. After publishing this work, pin site source/documentation links to its approved commit.
2. Build/test the independent AgentPay image. Deploy only after approval using the existing subdomain tunnel, existing origin, persistent SQLite volume and existing session secret. No new DNS, CORS, shared cookie, proxy rewrite or schema migration is required.
3. Preserve `/wallet` and payment resource paths, Host/Origin checks, CSP, owner checks, limits and pending reconciliation. New external navigation exceptions apply only to the finite public HTML route allowlist; no API is added to it.
4. Recheck all public pages/metadata, ordinary cross-site links, private-route denials and existing DB/order recovery with mock fixtures. No real transaction needed for this content release.
5. Only then approve a separate Toolkit change for nav links, sitemap and explicit temporary redirects. Its production pipeline may restart shared services; schedule and review with SRE rather than treating it as a static upload.
6. Monitor, then make redirects permanent and keep them for at least one year. Canonical/hreflang must match destination pages; wallet/API use noindex. Do not canonicalize unique historical content to the homepage.
7. Rollback: restore previous AgentPay image and/or Toolkit redirects independently. **Do not restore an older order DB, rotate the session secret or change origin** as a content rollback. No paid order should be replayed.

Remaining risks: current prototype is not independently audited; global quotas and single-instance SQLite restrictions remain. Host/Origin isolation survives, but product pages now share the payment origin: keep their scripts dependency-free and do not add third-party analytics. A claim that the whole ecosystem is autonomous or multi-chain live would be inaccurate.

### Concept animation

The overview and concept pages include a local-only narrative animation (three outcomes; user-started Play/Pause/Next/Reset). It illustrates the planned ecosystem and an exact-payment branch, not actual model procurement or a newly recorded transaction. Reduced-motion preference disables automatic playback; hidden-page and pagehide events pause timers. No new script origin, API, dependency or production configuration is required. The independent saved Solana evidence stays linked separately.
