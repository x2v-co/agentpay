import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import { FACILITATOR_URL, RPC_URL, GENESIS, NETWORK, MINT, PRICE, TOKEN_PROGRAM } from './constants.js';
import { invariant, svmAddress } from './model.js';

// Read-only allowlist. No sendTransaction, requestAirdrop or signature operation.
const METHODS = new Set(['getGenesisHash', 'getAccountInfo', 'getLatestBlockhash', 'getMultipleAccounts', 'getBalance', 'getTransaction']);
export function assertReadMethod(method: string) { invariant(METHODS.has(method), 'rpc_method_not_allowed', 403); }
export type RpcRead = (method: string, params: unknown[]) => Promise<any>;
export function publicRpc(fetcher: typeof fetch = fetch): RpcRead {
  return async (method, params) => {
    assertReadMethod(method);
    invariant(Array.isArray(params) && params.length <= 3, 'rpc_parameters_invalid', 400);
    const response = await fetcher(RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) });
    invariant(response.ok, 'rpc_http_failure', 503);
    const body = await response.json() as { error?: unknown; result?: unknown };
    invariant(!body.error && Object.hasOwn(body, 'result'), 'rpc_failure', 503);
    return body.result;
  };
}
export async function associatedTokenAddress(owner: string) {
  const encoder = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({ programAddress: address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'), seeds: [encoder.encode(address(svmAddress(owner))), encoder.encode(address(TOKEN_PROGRAM)), encoder.encode(address(MINT))] });
  return ata;
}
export async function publicReadiness(rpc: RpcRead, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${FACILITATOR_URL}/supported`, { signal: AbortSignal.timeout(12000) });
  invariant(response.ok, 'facilitator_unavailable', 503);
  const supported = await response.json() as { kinds?: any[]; signers?: Record<string, string[]> };
  const kind = supported.kinds?.find(k => k.x402Version === 2 && k.scheme === 'exact' && k.network === NETWORK);
  invariant(kind?.extra?.transactionVersions?.includes(0), 'facilitator_v0_not_supported', 503);
  const feePayer = svmAddress(kind.extra.feePayer);
  invariant(supported.signers?.['solana:*']?.includes(feePayer) || supported.signers?.[NETWORK]?.includes(feePayer), 'facilitator_signer_mismatch', 503);
  const [genesis, mint, fees] = await Promise.all([rpc('getGenesisHash', []), rpc('getAccountInfo', [MINT, { encoding: 'jsonParsed', commitment: 'confirmed' }]), rpc('getBalance', [feePayer, { commitment: 'confirmed' }])]);
  invariant(genesis === GENESIS, 'wrong_rpc_network', 503);
  const account = mint?.value;
  invariant(account?.owner === TOKEN_PROGRAM && account?.data?.parsed?.type === 'mint' && account.data.parsed.info.decimals === 6 && account.data.parsed.info.isInitialized === true, 'mint_not_ready', 503);
  invariant(typeof fees?.value === 'number' && fees.value > 0, 'facilitator_fee_balance_missing', 503);
  return { ok: true, checkedAt: new Date().toISOString(), network: NETWORK, genesis, mint: MINT, decimals: 6, amountAtomic: PRICE, feePayer, feePayerLamports: fees.value, facilitator: FACILITATOR_URL, rpc: RPC_URL,
    limitations: 'Advertised capability and public accounts checked; signature acceptance, memo enforcement and settlement are not yet live-tested.' };
}
export async function walletReadiness(rpc: RpcRead, payer: string, payTo: string) {
  svmAddress(payer); svmAddress(payTo); invariant(payer !== payTo, 'payer_is_merchant');
  const [payerAta, merchantAta] = await Promise.all([associatedTokenAddress(payer), associatedTokenAddress(payTo)]);
  const accounts = await Promise.all([payerAta, merchantAta].map(ata => rpc('getAccountInfo', [ata, { encoding: 'jsonParsed', commitment: 'confirmed' }])));
  const check = (entry: any, owner: string, name: string) => {
    const info = entry?.value?.data?.parsed?.info;
    invariant(entry?.value?.owner === TOKEN_PROGRAM && entry.value.data.parsed.type === 'account' && info?.owner === owner && info?.mint === MINT && info?.state === 'initialized' && info?.tokenAmount?.decimals === 6, `${name}_token_account_missing_or_invalid`, 409);
    return String(info.tokenAmount.amount);
  };
  const payerBalanceAtomic = check(accounts[0], payer, 'payer'); check(accounts[1], payTo, 'merchant');
  invariant(BigInt(payerBalanceAtomic) >= BigInt(PRICE), 'insufficient_test_usdc', 409);
  return { ok: true, payer, payTo, payerAta, merchantAta, payerBalanceAtomic, amountAtomic: PRICE, network: NETWORK, mint: MINT };
}
