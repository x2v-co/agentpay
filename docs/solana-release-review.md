# Selected v5 and publication review

Reviewed November 3, 2026. No external resource was modified.

## Selected video

Selected source project: `agentpay-ecosystem-v5` (separate local animation project).
English: AgentPay-Ecosystem-English-720p.mp4, 11,229,335 bytes,
SHA-256 `f58a6d4aa967ce1c308712c2a518b68d67e0020ff1bff4df43ea3aebf19c6375`.
Chinese: AgentPay-Ecosystem-Chinese-720p.mp4, 10,735,126 bytes,
SHA-256 `a6105845a713b462758aace53677c04df4f8c4a91322e33070eb0407e30fc437`.
Both hashes were recomputed and match the source delivery manifest. Both are
184 seconds; BGM only. Prior QA records full decode, Baseline H.264/yuv420p/AAC,
faststart, QR decode and muted browser seek/end playback; this review did not
repeat playback or claim human audio listening.

Both storyboards and final-frame contact sheets were reviewed. Scenes 1–6 are
concept/planned integration, scene 7 is historical Monad, scene 8 is the Solana
roadmap, scenes 9–10 (128–184 seconds) are the saved real Devnet purchase.
The copied evidence JSON exactly equals the code repository's verified JSON.
Transaction, amount 0.001 test USDC, slot 518099003, balance deltas and delivered
status match. The films do not claim a Solana model call or autonomous agent run.
README and submission draft agree with this boundary.

The selected film is an animated evidence review, not a continuous screen capture
of the wallet/API execution. Most screen time is broader product context. It does
not visibly demonstrate the current Solana failure/retry tests or detailed report
arithmetic. Keep the film unchanged as selected; make the actual report, HTTP
flow and named offline checks easy to inspect in the repository and live demo.
Do not describe this video as footage of a newly executed complete agent loop.
The older `solana-demo-script.md` describes a superseded film.

## Existing-project eligibility

Official 2026 FAQ, expanded in the browser:
https://www.encodeclub.com/programmes/solana-hackathon-2026
Question: Can I enter a project I have already started?

The answer permits existing work as a starting point; judges assess work built
during the four weeks and entrants must clearly identify prior work. This is a
2026 rule, not a rule imported from the archived 2023/2024 events.

Disclose earlier Monad SDK, prior model repair and reused animation/BGM; enumerate
new Solana exact service, persistence, validation, wallet handoff, memo fix and
November 3 delivery evidence. This supports eligibility in principle, not an
organizer's case-specific acceptance decision.

## Minimum live demo architecture

Do not expose the current localhost:4031 process through a tunnel. Its public
`GET /api/session` hands out one process-wide bearer token; the first successful
`POST /api/configure` sets the merchant. Token holders share order access. Host
and Origin checks are local protections, not public user authentication.

Minimum judge-ready payment service:

1. One HTTPS Node service with one instance and persistent SQLite storage. Keep
   the existing durable settlement claim and no-auto-resettle behavior. No
   stateless/ephemeral database and no horizontal replicas for this design.
2. Fixed server-configured Devnet genesis, mint, price, merchant and facilitator;
   remove public merchant configuration. No private wallet key on the server.
3. Per-reviewer session with order ownership/capability checks, CSRF protection,
   request/quote/settle rate limits and bounded pending reservations. Remove the
   shared session token and token-in-RPC-URL pattern. Isolate sanitized public
   evidence from private order state; never log signed payment bodies/tokens.
4. Exact configured HTTPS origin behind the host proxy; explicit allowed RPC
   methods/targets; no arbitrary URL proxy. Wallet sign-only and explicit submit
   remain separate. Never encourage mainnet use.
5. Landing view works without a wallet: real saved receipt/report plus a clearly
   marked offline failure/retry demonstration. Optional new Devnet purchases
   require the reviewer's funded test wallet and explicit signature/submission.
6. Offline tests for cross-session access, merchant immutability, origin/CSRF,
   rate limiting and restart/retry. Then deployed read-only readiness checks.
   Any new live payment is a separate user-operated validation step.

## Existing routes and proposed destinations (not authorized)

The repository already has `.github/workflows/pages.yml`, deploying `apps/demo`
on main changes. It is the historical static demo, not the Solana Node service.
The isolated branch's origin points to the original local checkout; do not blindly
`git push origin` expecting GitHub. An explicitly approved GitHub remote/branch
is required.

Recommended code destination: the existing x2v-co/agentpay GitHub repository,
new Solana branch/tag pinned to the reviewed commit; avoid replacing main or the
historical site accidentally. Publish sanitized docs/evidence and a static deck
under a separate `/solana/` route on the existing Pages site if approved.
GitHub Pages cannot run the Node/SQLite backend:
https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

Payment backend destination remains unselected. If no user-owned persistent host
is available, a dedicated Render web service with a paid persistent disk is one
concrete option. Render defaults to ephemeral filesystems; the disk binds to one
instance and deploys can briefly interrupt service. HTTPS is provided by the
platform. Account/workspace, service name/URL, region, cost ceiling and retention
must be explicitly approved before provisioning:
https://render.com/docs/disks
https://render.com/docs/web-services

Video destination: preferably a judge-accessible direct MP4 or video hosting URL
chosen by the user, serving the exact English v5 hash above (Chinese optional).
Private Library IDs alone are not proof that judges can access the files.

Separate approvals needed: publishing repository branch/tag; publishing deck and
sanitized evidence; video audience/destination; backend account/service/cost and
public exposure. Final competition submission remains a separate approval.
