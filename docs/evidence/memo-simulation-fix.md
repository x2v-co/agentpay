# Devnet memo compute-budget diagnosis

2026-11-03. No wallet interaction, key generation, signature, broadcast, faucet,
or settlement was performed. The running handoff service was not restarted.

The latest persisted order `2aa3140c-c529-452e-9bc9-7b7c744c0583` remained
`quoted`, with no payment identity or transaction. The original memo was
`agentpay:<order UUID>:<64-character request digest>` (110 bytes).

Using the installed `@x402/svm` 2.25.0 exact client, an interceptor captured the
unsigned transaction and threw before returning any signature. Public RPC
`getGenesisHash` matched the full pinned Solana devnet genesis. Only
`simulateTransaction` was then called with `sigVerify:false`,
`replaceRecentBlockhash:true`, `commitment:confirmed`, and base64 encoding.
Fresh blockhashes were used to isolate instruction execution from old quote expiry.

| Case | RPC slot | Result | Compute units |
| --- | --- | --- | --- |
| Original 110-byte memo | 518088165 | InstructionError [3, ProgramFailedToComplete]; memo log: exceeded CUs meter at BPF instruction | 20000 / 20000 |
| Compact full SHA-256 binding, 46 bytes | 518088425 | err: null; transfer and memo succeeded | 18496 / 20000 |

The SDK always constructs a 20000-unit limit. The fix uses
`ap:` + base64url(SHA-256(`agentpay:<order ID>:<request digest>`)), retaining all
256 hash bits, rather than increasing fees or relaxing transaction validation.
Server and browser share the Web Crypto implementation; the browser verifies
the memo before requesting a signature. No existing order is rewritten.

The successful simulation predicted precisely 1000 atomic USDC transferred
between the configured ATAs and 10001 lamports charged to the facilitator fee
payer. These are simulated changes, not actual transfers or fees. It does not
prove Phantom selected devnet, accepted a signature, or that the facilitator
will settle; a Phantom screen saying only “Solana” does not establish devnet.

Validation on the isolated dependency snapshot with identical lockfile:
`npm run test:offline`: 79/79, all 7 files, typecheck and both smoke tests passed.
`npm run typecheck:solana`, `npm run build:solana`,
`npm run check:private-imports`: passed. Initial sandbox run failed localhost
listen permission; approved rerun retained the external-network guard.

Deployment handoff: first have the user cancel any outstanding Phantom prompt.
Recheck persisted orders for settling/pending/paid/delivered before any new
purchase. Restarting the local service invalidates the old ephemeral session;
the user must reload, reconnect the devnet test account, recheck accounts, and
create a fresh quote. Never confirm an unsafe wallet warning. Signing and
submission remain separate user actions.
