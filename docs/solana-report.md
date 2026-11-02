# Solana exact procurement report

This branch adds an independent fixed-price API: an agent purchases a budget
validation report. The report calculates `item price × quantity`, subtracts prior
spend, and returns affordability and remaining budget using integer token units.
It does not call a model, claim to repair code, or reuse historical output as a new
result. Existing Monad routes, SDK exports and recorded demos remain available.

**Current evidence: offline tests only.** No wallet was connected, no transaction
was signed or submitted, and no external facilitator or Solana RPC was called in
the test suite. The local UI uses unsigned serialized fixtures accepted by an
explicit mock facilitator. Its transaction names start with `offline-only-`.

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
  The transaction memo contains `agentpay:<orderId>:<requestDigest>`. It is checked
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
| `devnet.ts` | Opt-in future HTTP facilitator/RPC factory; never imported by offline runner |
| `packages/sdk/src/solana.ts` | Validated quote, signer interface, per-request/total limits, reconciliation |
| `apps/solana-demo/` | Local HTTP server and minimal KITE-07-inspired UI |
| `tests/solana-report.test.ts` | Offline state, RPC fixture, client and HTTP tests |

We use `@x402/core` with `@x402/svm` instead of wrapping the entire API in Express
payment middleware. This lets the application durably save the settlement claim
*before* the side effect and persist its uncertain result. Standard header encoding
uses the official HTTP utilities. `@x402/*` remain pinned to **2.25.0**. Solana Kit
is pinned to **5.5.1**: this satisfies that version's transitive token/compute-budget
packages, unlike Kit 6.9.0. No installation lifecycle scripts are required.

The SDK subpath `@toolkit-fun/agentpay-sdk/solana` exports `BudgetReportClient` and
`createSvmPayloadFactory`. This first client is Node/TypeScript and attended. A
browser wallet adapter is not implemented. Its in-memory attempt map prevents
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

## Separate authorization required for devnet validation

Do not treat the offline preview as submission-ready devnet evidence. Before a real
run, separately authorize network/payment operations and:

1. Confirm facilitator `/supported` advertises V2 `exact` on the devnet identifier,
   the fee payer and the required memo semantics. Confirm supported SDK versions.
2. Use a dedicated, disposable devnet payer and merchant. Create their USDC token
   accounts and obtain test tokens/SOL only with explicit permission. Confirm the
   merchant token account and fee/rent funding; a sponsored fee is not account rent.
3. Connect an explicitly approved wallet/signing adapter. Do not export wallet keys
   to chat or commit them. The current UI intentionally does not connect a wallet.
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
