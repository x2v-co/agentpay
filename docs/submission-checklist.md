# Submission Readiness

## Delivered Artifacts

- [x] Interactive commission and post-acceptance overview.
- [x] Independent quick preview with no artificial acceptance or policy bypass.
- [x] Historical payment distinguished from the scripted repair in both experiences.
- [x] [English submission copy](hackathon-submission.md), technical differentiation and limitations.
- [x] [Architecture](architecture.md) and public [judge brief](../apps/demo/brief.html).
- [x] [Captioned walkthrough script](video-script.md) and reproducible recording script.

## Release Verification

Run `npm test` and `npm run check:private-imports`. The browser check in
`scripts/capture-demo.mjs` exercises quick preview, the approval path, refusal,
budget blocking, acceptance, refresh recovery and responsive layout. Its recording
is an actual browser interaction with the local demo, not a live model execution.

The demo's public proof is hosted on staging. Link checks establish reachability
at a point in time, not guaranteed availability through judging. The public video
and repository document the historical evidence if the staging host is unavailable.

## Still Requires the Owner

- [x] Registration, existing team and Consumer Products & Payments track verified in the application account on September 10, 2026.
- [x] Authenticated platform dates verified: opens September 22 at 11:59, closes October 14 at 11:59, Asia/Singapore.
- [ ] Inspect the final form's required video-host format when submission opens.
- [ ] Confirm which commits qualify as work built during the event.
- [ ] Review the public description and submit the project profile; keep its URL and confirmation.
- [x] Complete the bounded testnet run with owner-confirmed wallet signatures and no private-key export: purchase `e69e6208-2429-4f48-b2f3-5efd725e3dab`.

## How to Capture the Missing Live Repair Evidence

Prerequisites: a live-capable Toolkit merchant, an authorized Monad Testnet agent
wallet with test USDC and gas, a bounded signed policy, and any required Permit2
allowance. The public `examples/buy-zhipu.ts` reads `AGENT_PRIVATE_KEY`,
`AGENTPAY_POLICY_JSON`, `TOOLKIT_BASE_URL` and optionally `MONAD_RPC_URL` from the
process environment. It does not create a funded wallet or safely provision an
allowance for the operator.

Preferred browser path: run `npm run operator` and open `http://127.0.0.1:4022/`
in an extension-enabled browser. The page implements the attended capture flow
below, including fixed testnet limits, signature confirmation, public proof
matching and a downloadable evidence bundle. Connect your existing funded
wallet; never import it into the page. The page never asks for a seed phrase.
For OpenRouter, use the [explicit provider selection instructions](operator-providers.md).

1. Record the checkout source, baseline failure and checkpoint before requesting a repair. Use only a public, non-sensitive task.
2. Inspect the current discovery offer and readiness. Reject recorded mode, the wrong chain, a different merchant or a ceiling outside the approved policy.
3. Send the saved task through `createAgentPay().buy()` once, preserving the purchase ID. Request a complete repair and retain the returned output. Do not replace it with the teaching fixture.
4. If pending, reconcile the same purchase. Use the SDK's recovery flow for lost access. Do not issue a fresh purchase just because settlement visibility is delayed.
5. Validate generated code in an isolated environment with no credentials or network. Do not execute arbitrary provider code in the developer workspace. Record failures as failures; do not edit output and call it model-generated.
6. Match the public proof, purchase ID, usage, output digest and transaction. Keep the prompt, generated file and test result in the same run bundle. Publish no private keys, payment signatures, access tokens or raw request headers.

The existing sample prints purchase metadata but does not serialize a `Response`
body for you. Read `result.response.json()` on a completed response or use the
purchase result endpoint after reconciliation. A `status: matched` alone does not
prove a valid repair. A passing local fixture alone does not prove payment.

**Current state (September 10, 2026):** the browser-wallet companion supports
explicit Zhipu/OpenRouter selection, same-purchase recovery and pre-reservation
Policy timeout recovery. Two attended attempts returned provider HTTP 429 and
reconciled to `failed_unsettled`; neither is a successful paid repair.
Toolkit staging and production subsequently passed container-level OpenRouter
probes using the Z.AI upstream for GLM-5.3-Flash. These probes prove provider
availability at that time, not a wallet payment or successful repair.

The subsequent OpenRouter purchase `e69e6208-2429-4f48-b2f3-5efd725e3dab`
completed: unchanged model output passed all three tests, 220 tokens were
recorded, and the same purchase matched a 0.000033 test USDC transfer.
The [evidence page](https://x2v-co.github.io/agentpay/live-repair.html) and
raw bundle preserve that run. Its video is a retrospective evidence walkthrough,
not a reenactment of wallet signing. The v0.1.0 video remains a distinct simulation.
Final Metropolis submission remains gated by the platform opening date.
