import { HTTPFacilitatorClient } from '@x402/core/server';
import { SvmGateway, SolanaChainReader } from './gateway.js';
import { invariant } from './model.js';

/** Explicit integration factory for a FUTURE authorized devnet run.
 * Importing this module does not make requests. The offline entrypoint does not
 * import it. No wallet, signing key, token faucet or transaction sender lives here.
 * The injected facilitator is the only component that can submit settlement. */
export function createDevnetGateway(options: {
  allowNetwork: true; facilitatorUrl: string; rpcUrl: string; payTo: string;
}) {
  invariant(options.allowNetwork === true, 'network_access_not_enabled');
  for (const target of [options.facilitatorUrl, options.rpcUrl]) {
    const url = new URL(target);
    invariant(url.protocol === 'https:' && !url.username && !url.password, 'https_endpoint_required');
  }
  const chain = new SolanaChainReader(async (method, params) => {
    const response = await fetch(options.rpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10000),
    });
    invariant(response.ok, 'rpc_unavailable', 503);
    const body = await response.json() as { result?: unknown; error?: unknown };
    invariant(!body.error && Object.hasOwn(body, 'result'), 'rpc_error', 503);
    return body.result;
  });
  return new SvmGateway(new HTTPFacilitatorClient({ url: options.facilitatorUrl, timeoutMs: 10000 }), chain, options.payTo);
}
