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

The default is a clearly labelled deterministic recorded mode. It exercises the same reservation, execution, settlement state machine, and receipt route without broadcasting a transaction.

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
  inputTokens: 1_000,
  outputCap: 2_000,
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
