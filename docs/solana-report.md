# Solana exact procurement report

This branch adds an independent fixed-price API: an agent purchases a budget
validation report. The report calculates `item price × quantity`, subtracts prior
spend, and returns affordability and remaining budget using integer token units.
It does not call a model, claim to repair code, or reuse historical output as a new
result. Existing Monad routes, SDK exports and recorded demos remain available.

**Live evidence verified, November 3, 2026:** a user-operated Phantom payment of
0.001 devnet USDC finalized and the report was delivered. See
[the independent verification record](evidence/devnet-delivery-20261103.json).
The record verifies the transaction signature/message, full devnet genesis, mint,
owner balance deltas, memo, HTTP report retrieval, and request/result digests.
The sample budget inputs are synthetic; calculation and settlement are real.
Offline tests still use only mocks and do not perform new payments.

## Install and run locally

Use Node.js **22.18 or newer** (SQLite support required; tested here on 26.12.1).
From the repository root:

```sh
npm ci --ignore-scripts
npm run typecheck:solana
npm run test:solana
npm run build:solana
npm run dev:solana:offline
```

Open **http://localhost:4030**. `SOLANA_DEMO_PORT` can select another port.
The compiled preview can also run with:

```sh
node dist/solana/apps/solana-demo/server.js
```

The preview binds only to localhost. It rejects foreign Host/Origin requests and
requires a fresh per-process bearer token for order operations. The token comes
from the same-origin session endpoint; this is a local attended companion, not
multi-tenant authentication. The UI remembers the order ID in session storage so
a page refresh or server restart can recover the same order without another payment.

The ignored `.local/solana-report/offline.sqlite` database survives restarts. A
demo payer may reserve/spend up to 10,000 atomic units total (0.01 test USDC).
Quotes expire after 120 seconds and release unused reservations; any order that
has attempted settlement retains its budget. The UI should reconcile a pending
order, not create a replacement. To start a fresh *offline-only* session, stop the
server and choose/archive the old offline database; never erase a real payment
database to bypass a budget or unknown settlement.

## Payment contract

- Network: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (devnet only).
- Asset: devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- Report price: **1,000 atomic units / 0.001 test USDC**, six decimals.
- Scheme: x402 V2 `exact`. No Permit2, EIP-712 or variable token metering.
- Each order fixes the request digest, payer, price, merchant, expiry and resource.
  The transaction memo contains `ap:` plus base64url of the full SHA-256 hash of
  `agentpay:<orderId>:<requestDigest>` (46 bytes, no hash truncation). It is checked
  against the transaction message as well as the HTTP envelope.
- Addresses retain their base58 case. Integers cross HTTP/SQLite as decimal strings.

HTTP sequence (all API operations require the local session bearer token):

1. `POST /api/orders` with `{ input, payer }` reserves the server-side budget and
   returns an order. Input fields: `budgetAtomic`, `spentAtomic`, `quoteAtomic`,
   `quantity`. The request's budget describes the *report subject*, not payment authority.
2. `POST /api/orders/:id/report` with the same input and no payment returns **402**
   and standard `PAYMENT-REQUIRED`. No report is returned.
3. The bounded client validates the exact offer, uses an injected signing interface,
   then retries with `PAYMENT-SIGNATURE`. It never reads a private key.
4. The resource server calls the x402 SDK/facilitator's verification, durably claims
   the transaction message identity, and calls settle at most once per order.
5. The independent chain reader requires a confirmed devnet transaction matching
   the message hash, signature, mint, payer/recipient token balance changes and amount.
6. Only then are the calculated report and `PAYMENT-RESPONSE` delivered with HTTP 200.
   Otherwise HTTP 202 returns the pending order without a report.
7. `POST /api/orders/:id/reconcile` only reads evidence. It never submits payment.
   `GET /api/orders/:id` reads the persisted state without RPC calls.

The UI's `/offline-payment` convenience endpoint is enabled only in offline mode.
It fabricates **unsigned** payloads; it is not a live payment endpoint.

## Files and integration boundary

| File | Responsibility |
| --- | --- |
| `packages/solana-report/src/model.ts` | SVM types, input validation, report calculation, digests |
| `store.ts` | SQLite transactions, unique message/transaction claims, durable budget |
| `gateway.ts` | Official x402 SVM server adapter and injected independent chain reader |
| `service.ts` | Quote → verify → durable claim → settle → confirm → deliver |
| `offline.ts` | Explicit unsigned fixtures, mock facilitator and chain reader |
| `devnet.ts` | Opt-in HTTP facilitator/RPC factory; never imported by offline runner |
| `packages/sdk/src/solana.ts` | Validated quote, signer interface, per-request/total limits, reconciliation |
| `apps/solana-demo/` | Local HTTP server and minimal KITE-07-inspired UI |
| `tests/solana-report.test.ts` | Offline state, RPC fixture, client and HTTP tests |

We use `@x402/core` with `@x402/svm` instead of wrapping the entire API in Express
payment middleware. This lets the application durably save the settlement claim
*before* the side effect and persist its uncertain result. Standard header encoding
uses the official HTTP utilities. `@x402/*` remain pinned to **2.25.0**. Solana Kit
is pinned to **5.5.1**: this satisfies that version's transitive token/compute-budget
packages, unlike Kit 6.9.0. No installation lifecycle scripts are required.

The SDK subpath `@toolkitfun/agentpay-sdk/solana` exports `BudgetReportClient` and
`createSvmPayloadFactory`. This first client is Node/TypeScript and attended. A separate Wallet Standard browser handoff is now available at
`npm run dev:solana:handoff` (http://localhost:4031). Connect, sign-only and submit
are three explicit user actions. The offline UI never connects a wallet. Its in-memory attempt map prevents
re-signing the same order during the process; server-side budgets/claims persist.
After a client restart, retrieve/reconcile the persisted order before signing anything.

## Durability and uncertainty

SQLite uses WAL, `synchronous=FULL`, `BEGIN IMMEDIATE`, and unique payment-message
and transaction columns. The message hash deliberately ignores the mutable
facilitator fee-payer signature bytes. Two concurrent requests cannot acquire the
same settlement claim, even through different SQLite connections.

`settling` is saved before calling the facilitator. Timeout, false settlement
response, process crash or delayed chain visibility leaves the order **pending**.
The application never re-settles automatically. A crash just before submission may
therefore leave an unpaid pending order; this is an intentional safety tradeoff,
not a universal exactly-once guarantee.

When the facilitator response was lost, an operator must locate the original
transaction and provide its public signature to reconciliation. The independent
reader checks its signed message and transfer before adopting it. A wrong observed
transaction is rejected without poisoning the order. A malicious/incorrect RPC
response remains a trust risk; use a trusted devnet RPC for real validation.

Signed payloads and keys are not saved in the order database. A confirmed `paid`
order can finish deterministic report generation after restart without charging
again. Offline and devnet databases cannot be mixed. The store is for one host;
SQLite on a network filesystem, distributed deployments and arbitrary payer
registration on a public endpoint are outside this preview.

## Offline verification

```sh
npm run test:solana
npm run test:offline
npm run typecheck:solana
npm run build:solana
npm run check:private-imports
```

`test:solana` rejects non-localhost fetch requests. Facilitator and RPC are injected
mocks; transaction fixtures contain no real signatures. The full regression command
`test:offline` preloads a fetch guard allowing only loopback endpoints used by the
existing tests. Existing Monad test fixtures may perform local cryptographic checks;
they never use a user's wallet or send a chain transaction.

Coverage includes actual budget arithmetic; malformed input; insufficient funds,
invalid/expired signatures reported by the mock facilitator; wrong network, mint,
recipient, price, scheme and payer; expired quotes; modified request/resource/memo;
cross-order replay and mutable signature-byte replay; concurrent requests; durable
budgets; restart before/after settlement; timeout/failure; missing/mismatched RPC
evidence; standard HTTP headers; local access controls; client spending limits and
declined signing. This establishes application behavior, **not** real facilitator,
wallet, RPC or chain interoperability.

There is no repository lint command. TypeScript checks and existing private-import
checks are the available static checks. The build emits JS plus static UI files.

## Additional devnet validation (not performed by offline tests)

The verified successful purchase is recorded above. Additional real failure tests
remain distinct from mocked coverage. For any further transaction, obtain explicit
user authorization and:

1. Confirm facilitator `/supported` advertises V2 `exact` on the devnet identifier,
   the fee payer and the required memo semantics. Confirm supported SDK versions.
2. Use a dedicated, disposable devnet payer and merchant. Create their USDC token
   accounts and obtain test tokens/SOL only with explicit permission. Confirm the
   merchant token account and fee/rent funding; a sponsored fee is not account rent.
3. Connect an explicitly approved wallet/signing adapter. Do not export wallet keys
   to chat or commit them. Only the separate handoff UI can request a wallet connection through a user click.
4. After authorization, use `createDevnetGateway` with explicit HTTPS endpoints,
   call `initialize()`, and wire it to `ReportService`/`OrderStore` in `devnet` mode
   with a separate database and `offline=false` HTTP server. The factory has no
   default URL and no implicit network activation on import.
5. Validate the RPC network and token accounts, then approve the exact 0.001 test
   USDC payment. Keep the cumulative limit. Record one fresh 402 → signature →
   confirmed transfer → report result and one non-payment/retry failure case.
6. Test real wallet refusal, balance failure, memo enforcement, blockhash expiry,
   timeout/recovery and concurrent replay without duplicate transfer. Export only
   public evidence: commit, input/result digests, order, amount, transaction, report.
7. Record a 2–4 minute BGM/subtitle demo. Keep the accepted 64-second introduction
   as a short opening; label old Monad/simulated footage. Add the genuine devnet
   walkthrough, architecture/README and slides. Deployment, push and competition
   submission remain separate actions.

References checked during implementation: [Solana x402 V2 guide](https://solana.com/docs/payments/agentic-payments/x402)
and [x402 seller quickstart](https://docs.x402.org/getting-started/quickstart-for-sellers).

## Browser wallet handoff (devnet only)

```sh
npm run dev:solana:handoff
# After building, the server can also be started directly:
node dist/solana/apps/solana-demo/handoff.js
```

Open http://localhost:4031 in a browser with an existing trusted Wallet Standard
wallet supporting `solana:devnet`, v0 and `solana:signTransaction`. Phantom or
Solflare may provide these features; the page checks actual advertised support.
The project does not install an extension or generate a wallet.

1. Enable devnet/test networks in the wallet yourself. Click the connection button
   and authorize only the intended disposable test account. There is no automatic
   reconnect. Never provide a seed phrase, private key or password.
2. Enter a separate merchant public address. Both parties must already have
   initialized, unfrozen associated token accounts for the pinned devnet USDC
   mint. The payer needs at least 1,000 atomic units (0.001 test USDC). This page
   neither creates accounts nor obtains test tokens.
3. Run the account/balance check. It verifies the full devnet genesis, mint, V2
   exact/v0 capability, funded facilitator fee payer, both ATAs and payer balance.
   The merchant locks for this server session. The facilitator fee payer pays the
   settlement transaction fee; this does not imply account creation or rent funding.
4. Generate the quote, check the payer, recipient, network, mint and 0.001 amount,
   then tick the confirmation box. Click the sign-only button and inspect/approve
   the wallet transaction yourself. Only a fixed TransferChecked, bounded compute
   budget and order memo are allowed. Returned message bytes must be unchanged,
   and the payer's Ed25519 signature must verify.
5. Signing does not submit. Click the separate submit button yourself to send the
   signed payload to the local merchant/facilitator. No sign-and-send wallet API
   is used. After an unknown response, reconcile the same order; do not create a
   replacement payment. A restored pending order disables creation of another quote.
6. After independent chain confirmation, download the public evidence JSON. It
   includes checks, order/request/result digests, amount and transaction, but no
   signed payload or key. If the facilitator response was lost, provide only the
   original public transaction signature to reconciliation; this cannot send funds.

The browser SDK uses a local token-scoped read-only proxy pinned to
`https://api.devnet.solana.com`. Broadcast, faucet and simulation methods are
rejected. No RPC credential is requested or persisted. The local session token
is ephemeral; only the order ID is saved in sessionStorage. User submission still
calls facilitator settlement, as x402 requires. The read-only RPC restriction
does not mean that clicking Submit is read-only.

`docs/evidence/devnet-public-readiness.json` records public read-only observations.
Capability advertisement does not prove signature acceptance, memo enforcement
or successful settlement. The later finalized payment is recorded in `devnet-delivery-20261103.json`;
the readiness snapshot itself remains a pre-payment observation. There
is no mainnet path and no fallback to real assets or a mock payment in this UI.

## Memo simulation fix and verified limits

The original 110-byte memo exhausted the x402 SDK's 20,000-unit default. The
46-byte full-hash binding used 18,496 units both in unsigned devnet simulation
and the finalized transaction. See [diagnostic evidence](evidence/memo-simulation-fix.md).
No unsafe wallet confirmation was needed for the successful fixed transaction.

The successful run proves one attended payment and delivery, not unattended
autonomy, production readiness, or live coverage of every recovery branch.
The full offline suite passes 79 tests; real timeout/concurrency/refusal cases
remain separately unverified. The quote lasts 120 seconds; user signing and
submission must finish within it. Signing alone does not pay. Once a payment
is pending, reconcile the existing order instead of creating another purchase.
