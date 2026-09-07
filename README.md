# AgentPay

AgentPay is an open reference implementation for autonomous agent procurement on Monad. An agent discovers model prices through [aiplans.dev](https://aiplans.dev), selects a machine-fulfillable offer from [toolkit.fun](https://toolkit.fun), spends under an owner-signed policy, pays actual metered usage through x402 `upto` + Permit2, and receives a recoverable proof.

Built for the [Monad Metropolis hackathon](https://www.monad.xyz/developers/hackathons/metropolis).

## Run the demo

Requirements: Node.js 22 or newer.

```bash
npm install
npm test
npm run dev
```

Open `http://127.0.0.1:4021/agentpay/`.

The entry demo is a five-scene interactive commission: hire KITE-07 to fix a duplicate-charge teaching fixture, choose a task budget (0.500000, 5.000000, or 25.000000 USDC) and autonomy policy, execute the failing baseline, inspect model channels on aiplans.dev, follow the recorded Toolkit purchase, then run acceptance tests and download the runnable fix. The task budget is distinct from the 0.100000 USDC per-inference authorization ceiling. Hash URLs (`#hire`, `#work`, `#market`, `#connect`, `#delivery`) preserve browser navigation; local storage restores the commission. A counterfactual button applies a deliberately insufficient 0.010000 USDC budget to demonstrate a blocked purchase. The manual mode waits for approval; declining preserves the checkpoint.

The investigation, capacity trigger, and repair are scripted. Tests execute in the browser against the local fixture, including a genuinely failing duplicate-charge case. The fixture is synchronous and process-local, not production payment code. The historical provider output did not generate this fixture. Changing the commission controls the simulation and never generates a new model call, transaction, or receipt. The evidence panel always identifies the September 7 trace as historical.

The original animated control room remains available at `replay.html`. Both experiences retain September 2026 captures of the real aiplans.dev and Toolkit pages, with links to open the products and verify pricing and payment evidence.

## Verified testnet evidence

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

`buy()` returns `status: "pending"` while Monad confirmation is unresolved and `status: "matched"` only after settlement and delivery evidence are durable.

## Repository layout

```text
apps/demo/                 self-contained cinematic demo
apps/reference-server/     x402 merchant and purchase state machine
packages/protocol/         policy, digest, state, receipt, and error contracts
packages/sdk/              discovery, signing, purchase, and recovery client
examples/                  agent integration examples
docs/architecture.md       trust boundaries and lifecycle
```

## Live mode

Set `AGENTPAY_RECORDED=0` and provide:

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
- Settlement retries reuse durable provider output and never invoke the provider twice.
- A Permit2 payer/nonce pair binds to one purchase.
- Delayed chain visibility remains pending rather than being reported as success.

## Status

This is hackathon-quality Developer Preview software. Do not use it to custody production funds without an independent security review and a durable store implementation.

Apache-2.0 licensed. See [NOTICE](NOTICE) for attribution.
