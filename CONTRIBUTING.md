# Contributing

Open an issue before changing protocol or settlement semantics. Pull requests should include focused tests for state transitions, retries, amount binding, signature ownership, and delayed-chain behavior.

Run before submitting:

```bash
npm test
npm run check:private-imports
```

Never commit credentials, payment payloads from funded wallets, private infrastructure identifiers, or customer data.
