# Wallet handoff validation — 2026-11-02

Public read-only observations are saved in `devnet-public-readiness.json` and
`devnet-handoff-readiness.json`. The latter was obtained from the running local
handoff page and excludes its ephemeral session token. It confirms advertised
V2 exact/v0 devnet support, full devnet genesis, initialized six-decimal mint and
a funded advertised facilitator fee payer. It is not payment evidence.

Validation performed:

- `node node_modules/typescript/bin/tsc -p tsconfig.solana.json --extendedDiagnostics`:
  passed. Diagnostic timing showed 164.55 seconds of file I/O and 0.16 seconds of
  type checking, explaining the local delay.
- `npm run build:solana`: passed, including the browser wallet bundle and runnable
  handoff server.
- `node node_modules/vitest/vitest.mjs run tests/solana-handoff.test.ts --maxWorkers=1 --pool=forks`:
  9/9 passed. No wallet connect, real signature, broadcast or external RPC occurred.
- The subsequent guarded regression run reported `tests/solana-report.test.ts`
  25/25 passed before further dependency reads stalled. The full current regression
  was stopped; it is not claimed as a completed full-suite pass. The preceding
  implementation commit had completed 69/69 full-suite tests plus smoke checks.
- `npm run check:private-imports` and `git diff --check`: passed. A temporary
  compiler trace initially triggered the path-boundary checker; the generated
  trace was removed and the checker passed without relaxing its rules.
- Chrome opened the compiled localhost handoff page; its public-readiness action
  succeeded. It detected no compatible devnet sign-only wallet. Connect, account
  check, sign and submit remained disabled as appropriate. The page was left for
  the user, with no wallet authorization attempted.

Outstanding live validation: user provides/authorizes a compatible test wallet
and a distinct merchant public address with pre-existing token accounts; then
the user signs and submits one 0.001 test-USDC payment. Memo enforcement by the
remote facilitator, wallet interoperability, settlement, chain matching and
actual evidence export still require that run. No ATA creation/faucet action,
mainnet operation, deployment or competition submission was performed.
