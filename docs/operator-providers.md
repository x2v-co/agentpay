# Explicit provider selection for live repair acceptance

The operator defaults to the existing Zhipu GLM-4.7-Flash route. To prepare the supported OpenRouter route on a separate local port:

```sh
OPERATOR_PORT=4024 OPERATOR_PROVIDER=openrouter npm run operator
```

Open `http://127.0.0.1:4024/` in Chrome with MetaMask enabled. Use a free port; if an operator is already running, preserve its existing purchase rather than restarting it. The page displays the selected provider and model before purchase consent. Only `zhipu` and `openrouter` are supported. There is no automatic fallback and no automatic repurchase.

Both routes remain pinned to the existing staging merchant, Monad Testnet (10143), USDC asset and 0.1 test USDC ceiling. The provider selects the readiness query, exact offer route, signed policy model and public proof identity together. Changing the environment requires a separate process; never restart a process while its purchase is pending.

OpenRouter uses `z-ai/glm-5.3-flash`. Its aiplans catalog product is `glm-5.3-flash`; the SDK maps only this exact OpenRouter identity. Batch and other-provider records do not match.

Before this change, the September 10 Zhipu attempt `43a1b8f2-df43-43ad-b532-ac9533cbc855` received provider HTTP 429 and reconciled to `failed_unsettled`. That attempt is not evidence of a completed repair or payment. Selecting OpenRouter prepares a different purchase requiring fresh wallet signatures.

The first OpenRouter attempt also returned HTTP 429 and reconciled to
`failed_unsettled`. The merchant subsequently pinned its OpenRouter upstream
to Z.AI and passed live container probes in staging and production. New
purchases still require explicit consent and fresh wallet signatures; never
replay either failed purchase. A provider probe is not paid-repair evidence.

If a Policy signature times out before any reservation or payment dispatch,
the page offers **Retry wallet signature** for the same wallet and purchase ID.
Once a reservation or payment may have been sent, use **Reconcile same purchase**
instead. **Recover purchase access** validates the merchant's purchase-bound,
expiring sign-in challenge and requests a message signature, not another payment.

Validation: `npm test` checks policy model binding for both providers, route and amount rejection, exact catalog mapping, signature timeout/recovery boundaries, and the existing SDK/protocol/demo tests. A passing test suite does not establish a successful live paid repair.

The subsequent September 10 purchase `e69e6208-2429-4f48-b2f3-5efd725e3dab` completed real acceptance: 220 tokens, 0.000033 test USDC settled and all three tests passed on unchanged output. Inspect its [saved evidence](../apps/demo/assets/live-repair.json) without starting a new purchase.

## If the purchase button is disabled

Use the same Chrome tab throughout; the Codex in-app browser does not share Chrome's MetaMask connection. Connect the wallet, click **Check testnet readiness**, wait for balances, then click **Run baseline tests** and wait for two PASS results and the expected retry FAIL. Finally check **I authorize one testnet inference…**. Each step must finish before the next click; the page ignores actions while busy.

**Start real purchase** is enabled only for an idle session with the expected failing baseline, sufficient checked balance/allowance and explicit consent. An already stopped or completed session cannot purchase again. Do not confuse its page with a new idle session at a different port. **Approve exactly 0.1 test USDC** stays disabled when the existing allowance is sufficient.

Starting a purchase opens Policy signing. Subsequent ReservationIntent and PermitWitnessTransferFrom requests require **Confirm in wallet** in section 3, then confirmation in MetaMask. A disabled Start button after purchase creation is expected. If a request times out, use the recovery controls described above; do not start a replacement purchase to resolve an unknown outcome.
