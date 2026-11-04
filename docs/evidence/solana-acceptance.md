# Solana acceptance evidence — November 3, 2026

## Scope and reproduction

These are executable offline checks, not claims of additional blockchain payments.
Start from the submitted source revision with Node 22.18+:

```sh
npm ci --ignore-scripts
npm run test:offline
npm run typecheck:solana
npm run build:solana
npm run check:private-imports
```

Current regression: **79 tests in 7 files passed**, both reference-server and
demo smoke checks passed, both TypeScript checks, Solana build and private import
boundary check passed. There is no configured lint script. The test command uses
an external-network guard; localhost smoke servers are permitted. The run used
the existing hydrated dependency snapshot with current source/test inputs rather
than macOS cloud-placeholder dependencies. Dependency lock was unchanged.

## Reviewer walkthrough (no wallet required)

Run `npm run test:solana -- --reporter=verbose` to show named assertions, or
`npm run test:offline` for the full guarded regression. All cases below are in
`tests/solana-report.test.ts` and use mock facilitator/RPC fixtures:

| Scenario | Executed assertion |
| --- | --- |
| Insufficient funds, invalid signature, expired transaction | Throws payment_invalid; settle calls 0; durable state quoted; report and transaction absent |
| Wrong network, mint, recipient, amount or scheme | Rejected before facilitator verification |
| Expired quote, altered input/resource/payer | Rejected; settle calls 0 |
| Identical delivered request retried | Same result and result digest; settle calls 1 |
| 12 concurrent requests using two SQLite connections | settle calls 1; delivered after reconciliation |
| Timeout then process/store restart and retry | Pending, no report; settle calls remain 1; later matching mock evidence delivers without settling again |
| Chain result not yet visible | Pending without report; read-only reconciliation later delivers |
| Crash after durable claim, before settle | Pending after restart; settle calls 0; no automatic attempt |
| Failed settle response / RPC exception | Pending without delivery |
| Cross-order replay | Memo rejection plus SQL uniqueness rejection |

The browser-client decline case in the same suite verifies that rejected signing
never submits payment. Handoff tests also cover quote and signed-message checks.

## Live evidence boundary

Only the successful purchase documented in `devnet-delivery-20261103.json` is
claimed as a real devnet payment. Its finalized transfer and delivered result
were independently checked. Offline counters demonstrate application behavior,
not a guarantee against every facilitator/network/distributed-system failure.
SQLite coordination is single-host. Ambiguous outcomes may require operator
reconciliation and retain the budget reservation; do not create a replacement
payment to clear a pending order.

## Read-only live recheck

At 2026-11-03T08:57:36.606Z, two consecutive GET requests for the existing
order both returned HTTP 200, delivered, identical report and result digest
`12b86f645294c2f026ed94d50cadd5808aae39ff8779552cd34b9e276dbf3c57`.
Public Devnet getSignatureStatuses again returned finalized, err:null and
slot 518099003. No payment POST, signature or settlement was performed.
Repeated GET retrieval is not a substitute for the mocked payment-POST retry
assertions above. The hydrated regression inputs were compared against 56 Git
source/config blobs from 028b1e7 with zero mismatches; the modified test file was
copied from the current worktree before the run.
