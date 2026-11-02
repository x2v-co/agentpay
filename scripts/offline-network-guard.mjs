// Preload for regression tests. Existing tests use loopback HTTP; reject all
// other fetch targets before any DNS, provider, facilitator or RPC request.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`Offline tests forbid external fetch: ${url.hostname}`);
  }
  return originalFetch(input, init);
};
