# AgentPay — Solana x402 submission draft

Local preparation only. No track selected, upload, deployment, push, or final
submission is performed by this document.

## Project summary

AgentPay lets an agent-facing service sell one procurement-budget report for
0.001 devnet USDC using x402 V2 exact. The server issues an HTTP 402 quote, checks
the signed payment with a facilitator, records a durable settlement claim,
independently verifies the Solana transfer, and delivers the calculated report.
The current browser flow is attended: the user connects, signs, and submits.

## What Solana does

Solana is the actual settlement rail, not a decorative wallet connection. The
devnet USDC transfer is tied to the order/request through a compact full-SHA-256
memo. The merchant verifies the full network genesis, transaction message and
signature, token mint, owners and exact balance changes before releasing output.
The facilitator sponsors the network fee. Existing token accounts are required;
account creation and rent are not automatically sponsored.

## Verified run

- Order: `60268821-e100-45a4-8c59-65b880240b16`.
- [Finalized transaction](https://explorer.solana.com/tx/4hfFGWzFuF9mmHakGa5HdzGZEE8xey89ibkgWZ4R2bJHr7J9yqLRZQh6KjKr6neDveo6Vtfnd9c2agVDt6uC8sNt?cluster=devnet).
- Block time: November 3, 2026, 04:42:35 UTC; slot 518099003; `err:null`.
- Price: 1,000 atomic devnet USDC. Payer 20 → 19.999; recipient 20 → 20.001.
- Report: sample budget 5, prior spend 1, unit price 0.25, quantity 3. Computed
  cost 0.75, remaining 3.25, affordable true. The sample procurement is not an
  actual goods purchase. The API payment and integer report calculation are real.
- HTTP retrieval returned 200 and `delivered`; request/result digests match.
- [Machine-readable evidence](evidence/devnet-delivery-20261103.json).

## Original work and reuse

The earlier AgentPay project implements a Monad payment flow and includes
historical animations and September recordings. They remain labeled as prior
work. This Solana addition implements the separate exact-payment service, SVM
validation, persistent orders, browser wallet handoff and independent delivery
checks. The formal video reviews this completed Solana run; it does not stage a
second payment or portray old Monad recordings as Solana evidence.

## Reproduction and limitations

Follow [setup](solana-report.md). Node 22.18+; `npm ci --ignore-scripts`,
`npm run test:offline`, `npm run dev:solana:handoff`. The offline suite has 79
passing tests, with no external payment requests. One live successful purchase
is verified; live failure and distributed deployment coverage are not claimed.
SQLite is single-host. No production custody or unattended-autonomy claim.

## Submission checklist and source status

Requested programme: https://www.encodeclub.com/my-programmes/solana-hackathon-2026
Official public page: https://www.encodeclub.com/programmes/solana-hackathon-2026

On November 3, 2026 the existing logged-in browser successfully displayed the
AgentPay project and opened the Final Submissions form. The form was inspected
and cancelled without editing, selecting a challenge, or submitting.

Verified track: **Best Use of x402 on Solana**. The page requires an end-to-end
HTTP payment request, Solana verification/settlement, and resource delivery;
devnet is sufficient. README/setup, a 2–4-minute demo and an explanation of
Solana's role are required. Judging includes reliability, meaningful integration,
a compelling use case and handling failed payments. The listed prize is
accelerator places (non-cash).

Verified deadline: **November 9, 2026, 19:59 Asia/Singapore (UTC+8)**.

## Form-ready fields

These are drafts, not values saved on the platform.

| Field shown by form | Prepared content / remaining action |
| --- | --- |
| Project Name | AgentPay (existing) |
| Team Members | Existing project membership; do not alter |
| Project Description | Use Project summary above |
| Project Image | Optional status not stated; choose existing approved branding if requested |
| Project Challenges & Tracks | Recommend Best Use of x402 on Solana; not selected |
| Submission Details — Required | Use the text below |
| Link to Code — Required | Publish approved Solana branch/revision; default historical branch is insufficient |
| Link to Presentation — Required | Local deck: `solana-presentation.html`; needs approved hosting |
| Live Demo Link — Required | Localhost is not acceptable as an external deployed URL; hosting destination/approval needed |
| Link to Demo Video — Required | English ecosystem v5 verified; needs judge-accessible approved URL |

### Submission Details

AgentPay implements an attended, agent-facing pay-per-request procurement-budget
report API using x402 V2 exact on Solana devnet. A client receives an HTTP 402
quote for 0.001 test USDC, signs through a wallet, and explicitly submits the
payment. The server binds the payment to the order and request, records a durable
settlement claim, checks the facilitator response and independently validates the
Solana transaction before delivering a report calculated with integer arithmetic.

One completed devnet purchase is independently verified as finalized with no
execution error. The evidence bundle includes the transaction, memo, exact token
balance changes, request/result digests and the delivered report. For the sample
procurement inputs (budget 5, spent 1, unit price 0.25, quantity 3), the report
calculates cost 0.75 and remaining budget 3.25. These inputs are sample data;
the API payment and report calculation are real.

The offline regression suite demonstrates rejection without delivery, identical
retry and concurrent requests settling once, and ambiguous settlement remaining
pending across restart without another settlement attempt. These negative and
retry cases use a mock facilitator/RPC and are explicitly not claimed as live
failure transactions. See docs/evidence/solana-acceptance.md for reproduction.

This is an extension of a pre-existing Monad project, whose historical code and
animations are disclosed separately. New work is the independent Solana exact
service, persistent order lifecycle, SVM validation, wallet handoff, compact memo
fix and verified devnet report delivery. AIPlans/Toolkit discovery and unattended
agent procurement are broader product concepts, not part of this demonstrated
Solana purchase. No mainnet or production-readiness claim is made.

## Remaining before final submission

- Existing-work FAQ verified: prior work may be a starting point; judged work must
  be built during the four weeks and prior work disclosed. Keep that disclosure.
- Selected ecosystem v5 is verified against both storyboards, final-frame contact
  sheets, file hashes and matching transaction evidence. See
  [release review](solana-release-review.md) for precise scope and publication plan.
- Approve exact destinations for code, video, deck and live demo publication.
  No public upload, push or deployment is authorized by local preparation alone.
- Review deployed operation before exposing the local handoff server: its local
  session-token trust model is not a public multi-user authentication design.
- Verify all four links as a judge would access them; then fill the form, select
  the agreed track and obtain explicit final submission approval.
