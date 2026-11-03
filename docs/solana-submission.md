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

On November 3 the authenticated programme URL rendered a blank page in the
available browser; the public-page navigation timed out and web extraction had
no readable body. Therefore the current form's exact fields, required URL types,
deadline, track options and eligibility/reuse rules have NOT been independently
reconfirmed in this preparation pass. No option was selected and no form saved.
Earlier project context identifies an x402 track and a 2–4-minute demonstration;
these are preparation targets, not a substitute for current form verification.

Before external submission:

- Reopen the authenticated form and verify exact track labels and required fields.
- Verify rules on pre-existing projects and disclose the historical Monad code.
- Review and authorize publishing the local branch and demo; public links must
  point to the Solana revision, not an unchanged default branch.
- Confirm the video and code are accessible to judges. localhost is not public.
- Fill the final URLs and team fields, review the completed form, then obtain
  explicit approval for final submission. No completed submission is claimed.
