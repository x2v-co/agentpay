# Contributing

Open an issue before changing protocol or settlement semantics. Pull requests should include focused tests for state transitions, retries, amount binding, signature ownership, and delayed-chain behavior.

Use Node.js 22 or newer. From a clean checkout, install the locked dependencies, then run the checks before submitting:

```bash
npm ci
npm test
npm run check:private-imports
```

Never commit credentials, payment payloads from funded wallets, private infrastructure identifiers, or customer data.

For documentation or demo changes, check the [submission checklist](docs/submission-checklist.md) and [video instructions](docs/video-script.md). Keep the interactive simulation separate from the completed paid-repair evidence. Preserve released evidence bytes and checksums; publish a new version if the evidence itself changes. Routine checks must not initiate a new wallet purchase.
