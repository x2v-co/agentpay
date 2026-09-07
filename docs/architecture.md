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
Permit2 upto authorization ----> provider executes exactly once
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

## Recovery

Every purchase has a short-lived progress token. If it is lost, the payer proves wallet ownership using a purchase-scoped SIWX challenge. A `202 settlement_unknown` is a pending outcome, not success; the SDK polls reconciliation until `matched` or a terminal failure.

## Public/private boundary

This repository contains the protocol, SDK, reference merchant, recorded demo, and examples. It intentionally excludes toolkit.fun authentication, users, billing control plane, deployment credentials, fraud controls, and proprietary product infrastructure.
