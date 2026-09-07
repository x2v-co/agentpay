# Architecture

AgentPay separates human intent, agent authority, provider execution, and settlement evidence.

```text
Owner signs procurement policy
            |
            v
Agent joins aiplans.dev models + toolkit.fun machine offers
            |
            v
Reservation binds policy + offer + complete request digest + maximum
            |
            v
Permit2 upto authorization ----> provider execution claim
            |                              |
            |                              v
            +---------------------- actual metered usage
                                           |
                                           v
                                facilitator settles actual amount
                                           |
                                           v
                              independent Monad receipt validation
                                           |
                                           v
                              signed delivery/usage proof -> agent continues
```

## Trust boundaries

The owner controls total and per-request budgets. The agent wallet can reserve and authorize only within that policy. The merchant cannot settle above the signed Permit2 ceiling. The provider result is persisted before settlement, so a payment retry cannot repeat execution. Chain evidence is read independently before the result becomes `matched`.

The public reference adapter is process-local. These retry guarantees apply while
its purchase records are retained, not across process loss. Production requires
a transactional durable adapter; this repository does not establish universal
exactly-once execution across crashes or ambiguous provider responses.

## Recovery

Every purchase has a short-lived progress token. If it is lost, the payer proves wallet ownership using a purchase-scoped SIWX challenge. A `202 settlement_unknown` is a pending outcome, not success; the SDK polls reconciliation until `matched` or a terminal failure.

## Public/private boundary

This repository contains the protocol, SDK, reference merchant, recorded demo, and examples. It intentionally excludes toolkit.fun authentication, users, billing control plane, deployment credentials, fraud controls, and proprietary product infrastructure.

## Browser wallet operator

The optional local operator is separate from the static demo. It binds only to
127.0.0.1, rejects foreign Host/Origin requests, and requires a per-process token
for mutations. Node runs the public SDK against the pinned staging merchant;
the browser sends typed-data requests to its installed wallet. Neither side
accepts or exports a wallet private key. Owner and agent use the same connected
wallet in this attended testnet run, so it is not proof of unattended delegation.

The operator independently matches the returned public proof to the new purchase
and its Monad transfer. Generated code is tested only in a browser Web Worker
served with a network-denying CSP and a two-second timeout, never in Node. Test
results are local operator reports, not a signed model-quality attestation.
The operator retains private progress tokens in memory and excludes them from
the downloadable public evidence. Keep the process alive during reconciliation.

[Submission claims and limits](hackathon-submission.md) | [Readiness checklist](submission-checklist.md)
