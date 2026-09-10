# AgentPay

AgentPay is an open reference implementation for autonomous agent procurement on Monad. An agent discovers model prices through [aiplans.dev](https://aiplans.dev), selects a machine-fulfillable offer from [toolkit.fun](https://toolkit.fun), spends under an owner-signed policy, pays actual metered usage through x402 `upto` + Permit2, and receives a recoverable proof.

Built for the [Monad Metropolis hackathon](https://www.monad.xyz/developers/hackathons/metropolis).

[Real paid repair](https://x2v-co.github.io/agentpay/live-repair.html) | [v0.2.0 Release](https://github.com/x2v-co/agentpay/releases/tag/v0.2.0) | [Videos and architecture](https://x2v-co.github.io/agentpay/brief.html) | [Interactive simulation](https://x2v-co.github.io/agentpay/) | [Quick preview](https://x2v-co.github.io/agentpay/#preview)

## Run the demo

Requirements: Node.js 22 or newer.

```bash
npm install
npm test
npm run dev
```

Open `http://127.0.0.1:4021/agentpay/`.

The entry demo is a six-scene interactive commission: hire KITE-07 to fix a duplicate-charge teaching fixture, choose a task budget (0.500000, 5.000000, or 25.000000 USDC) and autonomy policy, execute the failing baseline, inspect model channels on aiplans.dev, follow the recorded Toolkit purchase, then run acceptance tests and download the runnable fix. After acceptance, the overview maps the complete loop; a preview button exposes that map without claiming the task was run. The task budget is distinct from the 0.100000 USDC per-inference authorization ceiling. Hash URLs (`#hire`, `#work`, `#market`, `#connect`, `#delivery`, `#overview`) preserve browser navigation; local storage restores the commission. A counterfactual button applies a deliberately insufficient 0.010000 USDC budget to demonstrate a blocked purchase. The manual mode waits for approval; declining preserves the checkpoint.

The investigation, capacity trigger, and repair are scripted. Tests execute in the browser against the local fixture, including a genuinely failing duplicate-charge case. The fixture is synchronous and process-local, not production payment code. The historical provider output did not generate this fixture. Changing the commission controls the simulation and never generates a new model call, transaction, or receipt. The evidence panel always identifies the September 7 trace as historical.

The original animated control room remains available at `replay.html`. Both experiences retain September 2026 captures of the real aiplans.dev and Toolkit pages, with links to open the products and verify pricing and payment evidence.

## Verified testnet evidence

**Latest acceptance, September 10, 2026:** OpenRouter `z-ai/glm-5.3-flash` generated the checkout retry fix. The unchanged output passed all three isolated browser Worker tests, and the same purchase settled **0.000033 test USDC** for **131 input + 89 output = 220 tokens**, within a **0.1 test USDC** ceiling.

The [public evidence bundle](apps/demo/assets/live-repair.json) preserves the prompt, output, digest, tests and matched transaction. The [54-second video](https://x2v-co.github.io/agentpay/brief.html) reviews the completed operator-assisted run; it does not reenact signatures or create another purchase. Tests are owner-reported, not cryptographic attestations. [v0.2.0](https://github.com/x2v-co/agentpay/releases/tag/v0.2.0) pins this evidence to commit `15025fa6f9538b0e33530ae35e127ea1b89842ec` with asset checksums.

**Earlier integration used by the interactive simulation:**

On September 7, 2026, the reference flow discovered `zhipu/GLM-4.7-Flash` through aiplans.dev, reserved a `0.100000 USDC` ceiling, bounded the request at a `1,024`-token input estimate and `256`-token output cap, then settled `0.000001 USDC` on Monad Testnet. The provider reported `17` input tokens and `256` output tokens, or `273` total.

The market reference shown in the demo is the aiplans.dev listing for GLM-4.7-Flash: Zhipu direct at `CNY 0 / 0` and OpenRouter at `USD 0.06 / 0.40` per one million input/output tokens. The selected Toolkit route uses the explicitly labeled testnet demo rate `2 / 8 atomic USDC` per one million input/output tokens (`toolkit-demo-2026-09`). At integer precision, both the bounded preflight and actual metered request round up to `1` atomic USDC.

- [Monad transaction](https://testnet.monadexplorer.com/tx/0xc1b583605f251c6141597bbe896406491e9ab08b0e57f3d32eaeca43cf263ed2)
- [Redacted public proof](https://staging.toolkit.fun/api/agentpay/v1/proofs/proof_97ae4853f5eb26ee)
- Purchase ID: `627c4d7a-765e-40b9-9b2f-f45474a4f6ff`

The chain receipt contains a USDC `Transfer` of exactly `1` atomic unit from the Agent wallet to the configured Toolkit merchant. The proof exposes no prompt, model output, credential, or private key.

## Agent loop

```ts
import { createAgentPay, createAiplansDiscovery } from '@toolkit-fun/agentpay-sdk';

const agentpay = createAgentPay({
  policy,
  policySignature,
  discovery: createAiplansDiscovery({
    baseUrl: 'https://aiplans.dev',
    toolkitBaseUrl: 'https://staging.toolkit.fun',
  }),
  baseUrl: 'https://staging.toolkit.fun',
});

const purchase = await agentpay.buy({
  policyId: policy.policyId,
  body: { prompt: 'Implement the next task' },
  inputTokens: 1_024,
  outputCap: 256,
  signReservation,
  signPayment,
  waitForSettlement: true,
});
```

`buy()` returns `status: "pending"` while Monad confirmation is unresolved and `status: "matched"` after settlement and delivery evidence are recorded. The public reference store is process-local; production durability requires a different adapter.

## Repository layout

```text
apps/demo/                 interactive simulation and real paid-repair evidence
apps/operator/             attended browser-wallet testnet purchase companion
apps/reference-server/     x402 merchant and purchase state machine
packages/protocol/         policy, digest, state, receipt, and error contracts
packages/sdk/              discovery, signing, purchase, and recovery client
examples/                  agent integration examples
docs/architecture.md       trust boundaries and lifecycle
```

## Reference merchant live mode

For the public reference merchant's Zhipu route, set `AGENTPAY_RECORDED=0` and provide:

- `AGENTPAY_PAY_TO`
- `AGENTPAY_MERCHANT_PRIVATE_KEY`
- `MONAD_RPC_URL`
- `X402_FACILITATOR_URL`
- `X402_FACILITATOR_ADDRESS` or `X402_FACILITATOR_SIGNER_ALLOWLIST`
- `ZHIPU_APIKEY`

The reference server fails closed if readiness is incomplete. A production deployment should replace the included process-local store with a transactional durable adapter.

## Safety properties

- Human-checkout offers are rejected before authorization.
- The owner policy binds wallet, merchant, model, budget, chain, asset, and expiry.
- A reservation binds the complete provider request and token caps before execution.
- Permit2 authorizes a ceiling; settlement passes only the actual metered amount.
- Settlement retries reuse recorded provider output while the purchase state is retained; production crash recovery requires durable storage.
- A Permit2 payer/nonce pair binds to one purchase.
- Delayed chain visibility remains pending rather than being reported as success.

## Submission Materials

- [English submission write-up](docs/hackathon-submission.md)
- [Readiness checklist and remaining submission steps](docs/submission-checklist.md)
- [Walkthrough script and recording instructions](docs/video-script.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Provider selection and wallet troubleshooting](docs/operator-providers.md)
- [Contributor setup](CONTRIBUTING.md) and [security reporting](SECURITY.md)

## Browser Wallet Operator

Run `npm run operator`, then open `http://127.0.0.1:4022/` in a browser with an Ethereum wallet. This local companion uses the public SDK against Toolkit staging; the static judge demo never requests payment. It pins Monad Testnet, the documented USDC asset and Toolkit merchant, with a maximum of 0.1 test USDC for one purchase per server session. The optional allowance transaction authorizes exactly 0.1 USDC to Permit2, never an unlimited amount.

To select the OpenRouter route used in the verified repair, run `OPERATOR_PROVIDER=openrouter OPERATOR_PORT=4024 npm run operator` and open `http://127.0.0.1:4024/` in Chrome with MetaMask. Use a free port and preserve any existing purchase session. This companion calls the deployed merchant; it does not require exporting a wallet key or configuring an OpenRouter key locally. See [provider selection](docs/operator-providers.md) for recovery and disabled-button troubleshooting.

Connect the wallet, check readiness and funds, run the failing baseline, consent to the maximum, and start. Confirm each typed-data signature in the wallet. The owner and agent are the same connected wallet in this operator-assisted run; it is not unattended delegation. The page recovers the model output, independently checks its onchain transfer, and tests the output in a network-disabled browser worker with a two-second timeout. Generated code is not executed in Node or the developer workspace. Worker test reports are operator-reported, not cryptographic attestations. Reject malformed output rather than substituting the teaching fixture.

Keep the local server running while settlement is pending. Reconcile the same purchase instead of buying again. The downloadable evidence contains the public task, raw output, digest, usage, receipt and test result, but no private key, payment signature or progress token. This companion uses in-memory state and is for an attended testnet run only. Wallet confirmations and a funded account are still required; no successful live repair is claimed merely because the companion exists.

## Status

This is hackathon-quality Developer Preview software. Do not use it to custody production funds without an independent security review and a durable store implementation.

Real paid-repair acceptance, the pinned v0.2.0 release and evidence video are complete. Metropolis project details are saved under **Consumer Products & Payments**; final submission remains pending. The authenticated platform opens submission **September 22, 2026 at 11:59** and closes **October 14 at 11:59**, Asia/Singapore (UTC+8).

Apache-2.0 licensed. See [NOTICE](NOTICE) for attribution.
