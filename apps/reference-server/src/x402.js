import { HTTPFacilitatorClient } from '@x402/core/server';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { PERMIT2_ADDRESS, x402UptoPermit2ProxyABI, x402UptoPermit2ProxyAddress } from '@x402/evm';
import { createOfferEIP712, createReceiptEIP712 } from '@x402/extensions/offer-receipt';
import { decodeFunctionData, encodeAbiParameters, keccak256, stringToHex, verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const AGENTPAY_X402_VERSION = 2;
export const MONAD_TESTNET = 'eip155:10143';
export const MONAD_USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3';
export const MONAD_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://x402-facilitator.molandak.org';
export const ERC20_TRANSFER_TOPIC = keccak256(stringToHex('Transfer(address,address,uint256)'));
export const RECORDED_MERCHANT_PAY_TO = '0x1111111111111111111111111111111111111111';
const RECORDED_MERCHANT_PRIVATE_KEY = '0x0123456789012345678901234567890123456789012345678901234567890123';

function isAddress(value) { return /^0x[0-9a-f]{40}$/i.test(String(value || '').trim()); }
function isUsablePayTo(value) { const normalized = String(value || '').trim(); return isAddress(normalized) && !/^0x0{40}$/i.test(normalized); }

/** Resolve the merchant recipient without allowing a live deployment to use the demo address. */
export function agentPayMerchantPayTo() {
  const configured = String(process.env.AGENTPAY_PAY_TO || '').trim();
  if (isUsablePayTo(configured)) return configured;
  return process.env.AGENTPAY_RECORDED === '0' ? null : RECORDED_MERCHANT_PAY_TO;
}

export function merchantPayToReadiness() {
  const configured = String(process.env.AGENTPAY_PAY_TO || '').trim();
  const recorded = process.env.AGENTPAY_RECORDED !== '0';
  const valid = isUsablePayTo(configured);
  return {
    ok: recorded || valid,
    mode: recorded ? 'recorded-fixture' : 'configured-address',
    configured: valid,
    address: recorded ? (valid ? configured : RECORDED_MERCHANT_PAY_TO) : (valid ? configured : null),
    reason: recorded ? 'recorded mode uses the deterministic merchant recipient' : (valid ? 'ok' : 'AGENTPAY_PAY_TO must be a non-zero 20-byte hex address'),
  };
}

function merchantAccount() {
  const configured = String(process.env.AGENTPAY_MERCHANT_PRIVATE_KEY || '').trim();
  const key = configured || (process.env.AGENTPAY_RECORDED === '0' ? '' : RECORDED_MERCHANT_PRIVATE_KEY);
  if (!/^0x[0-9a-f]{64}$/i.test(key)) return null;
  return privateKeyToAccount(key);
}

export function merchantSigningReadiness() {
  const recorded = process.env.AGENTPAY_RECORDED !== '0';
  const configured = Boolean(String(process.env.AGENTPAY_MERCHANT_PRIVATE_KEY || '').trim());
  return { ok: Boolean(merchantAccount()), mode: recorded ? 'recorded-fixture' : 'configured-key', configured, reason: merchantAccount() ? 'ok' : 'AGENTPAY_MERCHANT_PRIVATE_KEY is not configured' };
}

async function signTypedDataWithMerchant(account, params) {
  return account.signTypedData(params);
}

/** Issue the standard x402 offer-receipt artifact for a quote. */
export async function issueAgentPayOffer({ resourceUrl, requirement } = {}) {
  const account = merchantAccount();
  if (!account || !resourceUrl || !requirement) return null;
  return createOfferEIP712(resourceUrl, {
    acceptIndex: 0,
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    payTo: requirement.payTo,
    amount: requirement.amount,
    offerValiditySeconds: requirement.maxTimeoutSeconds,
  }, (params) => signTypedDataWithMerchant(account, params));
}

/** Issue the standard x402 receipt only after settlement evidence exists. */
export async function issueAgentPayReceipt({ resourceUrl, payer, network, transaction } = {}) {
  const account = merchantAccount();
  if (!account || !resourceUrl || !payer || !network) return null;
  return createReceiptEIP712({ resourceUrl, payer, network, transaction }, (params) => signTypedDataWithMerchant(account, params));
}

export function validateFacilitatorCapabilities(payload, { signerAllowlist = [] } = {}) {
  const kinds = Array.isArray(payload?.kinds) ? payload.kinds : [];
  const kind = kinds.find((entry) => entry?.x402Version === AGENTPAY_X402_VERSION && entry?.scheme === 'upto' && entry?.network === MONAD_TESTNET);
  const signer = String(kind?.extra?.facilitatorAddress || '').toLowerCase();
  const allowlist = signerAllowlist.map((value) => String(value).toLowerCase()).filter(Boolean);
  const signerAllowed = allowlist.length > 0 && allowlist.includes(signer);
  return {
    ok: Boolean(kind && signer && signerAllowed),
    version: AGENTPAY_X402_VERSION,
    network: MONAD_TESTNET,
    scheme: 'upto',
    facilitatorAddress: signer || null,
    signerAllowed,
    reason: !kind ? 'upto on Monad testnet is not advertised' : (!signer ? 'facilitator signer is missing' : (!signerAllowed ? 'facilitator signer is outside allowlist' : 'ok')),
  };
}

export async function facilitatorReadiness({ url = MONAD_FACILITATOR_URL, signerAllowlist = [], timeoutMs = 4000 } = {}) {
  try {
    const client = new HTTPFacilitatorClient({ url, timeoutMs });
    const supported = await client.getSupported();
    const configuredAllowlist = signerAllowlist.length ? signerAllowlist : String(process.env.X402_FACILITATOR_SIGNER_ALLOWLIST || '').split(',').map((value) => value.trim()).filter(Boolean);
    return { ...validateFacilitatorCapabilities(supported, { signerAllowlist: configuredAllowlist }), url, fetchedAt: new Date().toISOString() };
  } catch {
    return { ok: false, version: AGENTPAY_X402_VERSION, network: MONAD_TESTNET, scheme: 'upto', facilitatorAddress: null, signerAllowed: false, reason: 'facilitator readiness request failed', url, fetchedAt: new Date().toISOString() };
  }
}

export async function monadContractReadiness({ rpcUrl = process.env.MONAD_RPC_URL || '', timeoutMs = 4000 } = {}) {
  if (!rpcUrl) return { ok: false, reason: 'MONAD_RPC_URL is not configured', contracts: {} };
  const addresses = { usdc: MONAD_USDC, permit2: PERMIT2_ADDRESS, uptoProxy: x402UptoPermit2ProxyAddress };
  const contracts = {};
  for (const [name, address] of Object.entries(addresses)) {
    try {
      const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: name, method: 'eth_getCode', params: [address, 'latest'] }), signal: AbortSignal.timeout(timeoutMs) });
      const payload = await response.json();
      contracts[name] = typeof payload?.result === 'string' && payload.result !== '0x';
    } catch { contracts[name] = false; }
  }
  const ok = Object.values(contracts).every(Boolean);
  return { ok, reason: ok ? 'ok' : 'one or more Monad contracts are not deployed or unreadable', contracts };
}

export async function agentPayReadiness(options = {}) {
  const facilitator = await facilitatorReadiness(options);
  const contracts = options.skipContracts ? { ok: true, reason: 'skipped for recorded demo', contracts: {} } : await monadContractReadiness(options);
  const offerReceipt = merchantSigningReadiness();
  const payTo = merchantPayToReadiness();
  const recorded = process.env.AGENTPAY_RECORDED !== '0';
  const provider = recorded
    ? { ok: true, mode: 'recorded-fixture', configured: false, reason: 'recorded mode uses the deterministic provider fixture' }
    : { ok: Boolean(String(process.env.ZHIPU_APIKEY || '').trim()), mode: 'zhipu', configured: Boolean(String(process.env.ZHIPU_APIKEY || '').trim()), reason: String(process.env.ZHIPU_APIKEY || '').trim() ? 'ok' : 'ZHIPU_APIKEY is not configured' };
  // The deterministic fixture key can sign demo artifacts, but must never
  // make a replay deployment appear ready to broadcast real payments.
  const liveSignerReady = !recorded && offerReceipt.configured && offerReceipt.ok;
  const ok = !recorded && facilitator.ok && contracts.ok && liveSignerReady && payTo.ok && provider.ok;
  return { ok, x402: facilitator, contracts, offerReceipt, payTo, provider, mode: ok ? 'live-capable' : 'recorded-only' };
}

export function buildUptoRequirements({ resource, payTo, maxAmount, validUntil, description = 'AgentPay metered model execution' }) {
  const explicitAddress = String(process.env.X402_FACILITATOR_ADDRESS || '').trim();
  const allowlist = String(process.env.X402_FACILITATOR_SIGNER_ALLOWLIST || '').split(',').map((value) => value.trim()).filter((value) => /^0x[0-9a-f]{40}$/i.test(value));
  const facilitatorAddress = /^0x[0-9a-f]{40}$/i.test(explicitAddress) ? explicitAddress : (allowlist.length === 1 ? allowlist[0] : undefined);
  return {
    x402Version: AGENTPAY_X402_VERSION,
    resource: { url: resource, description, mimeType: 'application/json' },
    accepts: [{ scheme: 'upto', network: MONAD_TESTNET, asset: MONAD_USDC, amount: String(maxAmount), payTo, maxTimeoutSeconds: Math.max(1, Math.floor((Number(validUntil) - Date.now() / 1000))), extra: { assetTransferMethod: 'permit2', validUntil: Number(validUntil), ...(facilitatorAddress ? { facilitatorAddress } : {}) } }],
  };
}

export function decodeX402PaymentHeader(header) {
  try { return decodePaymentSignatureHeader(String(header || '')); } catch { return null; }
}

export async function verifyX402Payment({ header, requirements, url = MONAD_FACILITATOR_URL, timeoutMs = 4000, facilitatorClient } = {}) {
  const paymentPayload = decodeX402PaymentHeader(header);
  if (!paymentPayload) return { ok: false, reason: 'payment signature header is not valid x402 v2' };
  try {
    const client = facilitatorClient || new HTTPFacilitatorClient({ url, timeoutMs });
    const result = await client.verify(paymentPayload, requirements.accepts[0]);
    return { ok: Boolean(result.isValid), paymentPayload, verification: result, reason: result.isValid ? 'ok' : (result.invalidReason || 'facilitator rejected payment') };
  } catch { return { ok: false, paymentPayload, reason: 'facilitator verification failed' }; }
}

export async function settleX402Payment({ paymentPayload, requirements, actualAmount, url = MONAD_FACILITATOR_URL, timeoutMs = 10000, facilitatorClient } = {}) {
  try {
    const quoted = requirements?.accepts?.[0];
    const amount = BigInt(actualAmount ?? quoted?.amount ?? '0');
    if (!quoted || amount < 0n || amount > BigInt(quoted.amount)) return { ok: false, reason: 'settlement amount exceeds verified upto ceiling' };
    const settlementRequirements = { ...quoted, amount: amount.toString() };
    const client = facilitatorClient || new HTTPFacilitatorClient({ url, timeoutMs });
    const result = await client.settle(paymentPayload, settlementRequirements);
    return { ok: Boolean(result.success), settlement: result, reason: result.success ? 'ok' : (result.errorReason || 'facilitator settlement failed') };
  } catch { return { ok: false, reason: 'facilitator settlement request failed' }; }
}

function normalizeHex(value) {
  return String(value || '').toLowerCase();
}

function topicAddress(value) {
  const topic = normalizeHex(value);
  return /^0x[0-9a-f]{64}$/.test(topic) ? `0x${topic.slice(-40)}` : null;
}

function decodeUint256(value) {
  const data = normalizeHex(value);
  return /^0x[0-9a-f]+$/.test(data) ? BigInt(data) : null;
}

function addressEqual(left, right) {
  return Boolean(left && right) && normalizeHex(left) === normalizeHex(right);
}

/**
 * Decode the actual x402 upto proxy call, rather than trusting a facilitator
 * response or an arbitrary ERC-20 transfer in the same transaction. Both
 * Permit2 paths are supported: settle and settleWithPermit.
 */
export function decodeUptoProxyTransaction(transaction, { token = MONAD_USDC, payTo, maximumAtomic, expectedPayer, expectedAmount, expectedFacilitator } = {}) {
  if (!transaction || !transaction.to || !transaction.input) return { status: 'pending', reason: 'transaction_payload_missing' };
  if (!addressEqual(transaction.to, x402UptoPermit2ProxyAddress)) return { status: 'disputed', reason: 'x402_proxy_target_mismatch' };
  try {
    const decoded = decodeFunctionData({ abi: x402UptoPermit2ProxyABI, data: transaction.input });
    const [permit, amount, owner, witness] = decoded.functionName === 'settle'
      ? decoded.args
      : [decoded.args?.[1], decoded.args?.[2], decoded.args?.[3], decoded.args?.[4]];
    const permitted = permit?.permitted;
    const actual = BigInt(amount);
    if (!permitted || !addressEqual(permitted.token, token)) return { status: 'disputed', reason: 'proxy_token_mismatch' };
    if (!addressEqual(witness?.to, payTo)) return { status: 'disputed', reason: 'proxy_recipient_mismatch' };
    if (expectedPayer && !addressEqual(owner, expectedPayer)) return { status: 'disputed', reason: 'proxy_owner_mismatch' };
    if (expectedFacilitator && !addressEqual(witness?.facilitator, expectedFacilitator)) return { status: 'disputed', reason: 'proxy_facilitator_mismatch' };
    if (maximumAtomic !== undefined && actual > BigInt(maximumAtomic)) return { status: 'disputed', reason: 'actual_amount_exceeds_upto_ceiling', actualAtomic: actual.toString() };
    if (expectedAmount !== undefined && actual !== BigInt(expectedAmount)) return { status: 'disputed', reason: 'actual_amount_mismatch', actualAtomic: actual.toString() };
    if (BigInt(permitted.amount) < actual) return { status: 'disputed', reason: 'proxy_permitted_amount_below_settlement', actualAtomic: actual.toString() };
    return {
      status: 'confirmed',
      method: decoded.functionName,
      actualAtomic: actual.toString(),
      payer: owner,
      token: permitted.token,
      recipient: witness.to,
      facilitator: witness.facilitator,
      nonce: String(permitted ? permit.nonce : ''),
    };
  } catch {
    return { status: 'disputed', reason: 'x402_proxy_calldata_invalid' };
  }
}

/**
 * Independently matches the USDC Transfer emitted by the Monad x402 upto
 * transaction. A missing receipt is deliberately different from a bad one:
 * the reconciler may poll the former, but must stop on the latter.
 */
export function matchMonadSettlementReceipt(receipt, { token = MONAD_USDC, payTo, maximumAtomic, expectedPayer, expectedAmount, expectedFacilitator, transaction, txHash } = {}) {
  if (!receipt) return { status: 'pending', reason: 'receipt_not_visible' };
  const status = normalizeHex(receipt.status);
  if (status !== '0x1' && status !== '0x01' && status !== '1') return { status: 'rejected', reason: 'transaction_failed' };
  const tokenAddress = normalizeHex(token);
  const recipient = normalizeHex(payTo);
  if (!/^0x[0-9a-f]{40}$/.test(tokenAddress) || !/^0x[0-9a-f]{40}$/.test(recipient)) return { status: 'disputed', reason: 'settlement_addresses_invalid' };
  const proxy = transaction ? decodeUptoProxyTransaction(transaction, { token, payTo, maximumAtomic, expectedPayer, expectedAmount, expectedFacilitator }) : null;
  if (proxy?.status === 'pending') return proxy;
  if (proxy?.status !== 'confirmed' && transaction) return proxy;
  let total = 0n;
  let payer = null;
  for (const log of Array.isArray(receipt.logs) ? receipt.logs : []) {
    if (normalizeHex(log?.address) !== tokenAddress || normalizeHex(log?.topics?.[0]) !== normalizeHex(ERC20_TRANSFER_TOPIC)) continue;
    const from = topicAddress(log.topics?.[1]);
    const to = topicAddress(log.topics?.[2]);
    const amount = decodeUint256(log.data);
    if (!from || !to || amount === null || normalizeHex(to) !== recipient) continue;
    if (expectedPayer && normalizeHex(from) !== normalizeHex(expectedPayer)) continue;
    payer ||= from;
    total += amount;
  }
  if (total <= 0n) return { status: 'disputed', reason: 'matching_transfer_not_found' };
  if (maximumAtomic !== undefined && total > BigInt(maximumAtomic)) return { status: 'disputed', reason: 'actual_amount_exceeds_upto_ceiling', actualAtomic: total.toString() };
  if (expectedAmount !== undefined && total !== BigInt(expectedAmount)) return { status: 'disputed', reason: 'actual_amount_mismatch', actualAtomic: total.toString() };
  if (proxy && BigInt(proxy.actualAtomic) !== total) return { status: 'disputed', reason: 'proxy_transfer_amount_mismatch', actualAtomic: total.toString() };
  return { status: 'confirmed', txHash: receipt.transactionHash || txHash || null, actualAtomic: total.toString(), network: MONAD_TESTNET, token, recipient: payTo, payer, ...(proxy ? { proxy } : {}) };
}

export async function readMonadSettlement({ rpcUrl = process.env.MONAD_RPC_URL || '', txHash, token = MONAD_USDC, payTo, maximumAtomic, expectedPayer, expectedAmount, expectedFacilitator, timeoutMs = 4000 } = {}) {
  if (!rpcUrl || !txHash) return { status: 'pending', reason: !rpcUrl ? 'MONAD_RPC_URL is not configured' : 'transaction_hash_missing' };
  try {
    const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: txHash, method: 'eth_getTransactionReceipt', params: [txHash] }), signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { status: 'pending', reason: `rpc_http_${response.status}` };
    const payload = await response.json();
    if (payload?.error) return { status: 'pending', reason: 'rpc_error' };
    if (!payload?.result) return matchMonadSettlementReceipt(null, { token, payTo, maximumAtomic, expectedPayer, expectedAmount, txHash });
    const transactionResponse = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: `${txHash}:transaction`, method: 'eth_getTransactionByHash', params: [txHash] }), signal: AbortSignal.timeout(timeoutMs) });
    if (!transactionResponse.ok) return { status: 'pending', reason: `rpc_http_${transactionResponse.status}` };
    const transactionPayload = await transactionResponse.json();
    if (transactionPayload?.error || !transactionPayload?.result) return { status: 'pending', reason: 'transaction_not_visible' };
    return matchMonadSettlementReceipt(payload.result, { token, payTo, maximumAtomic, expectedPayer, expectedAmount, expectedFacilitator, transaction: transactionPayload.result, txHash });
  } catch { return { status: 'pending', reason: 'rpc_unavailable' }; }
}

const reservationTypes = {
  ReservationIntent: [
    { name: 'policyId', type: 'bytes32' }, { name: 'purchaseId', type: 'bytes16' },
    { name: 'requestDigest', type: 'bytes32' }, { name: 'commerceEnvelopeDigest', type: 'bytes32' },
    { name: 'maxAtomic', type: 'uint256' }, { name: 'expiresAt', type: 'uint64' },
  ],
};
const policyTypes = {
  Policy: [
    { name: 'policyId', type: 'bytes32' }, { name: 'owner', type: 'address' }, { name: 'agentWallet', type: 'address' },
    { name: 'chainId', type: 'uint256' }, { name: 'asset', type: 'address' }, { name: 'maxTotalAtomic', type: 'uint256' },
    { name: 'maxPerRequestAtomic', type: 'uint256' }, { name: 'allowedPayToHash', type: 'bytes32' },
    { name: 'allowedModelsHash', type: 'bytes32' }, { name: 'validUntil', type: 'uint64' },
  ],
};
const policyDomain = { name: 'AgentPay Procurement Policy', version: '1', chainId: 10143, salt: keccak256(stringToHex('toolkit.fun/agentpay/policy/v1')) };
const reservationDomain = { name: 'AgentPay Reservation Intent', version: '1', chainId: 10143, salt: keccak256(stringToHex('toolkit.fun/agentpay/reservation/v1')) };
const revocationTypes = { PolicyRevocation: [{ name: 'policyId', type: 'bytes32' }, { name: 'owner', type: 'address' }, { name: 'chainId', type: 'uint256' }, { name: 'revokedAt', type: 'uint64' }] };
const revocationDomain = { name: 'AgentPay Policy Revocation', version: '1', chainId: 10143, salt: keccak256(stringToHex('toolkit.fun/agentpay/revocation/v1')) };

export async function verifyProcurementPolicy({ policy, signature }) {
  if (!policy || !signature || !policy.owner) return false;
  try {
    const allowedPayTo = [...new Set((policy.allowedPayTo || []).map((value) => String(value).toLowerCase()))].sort();
    const allowedModels = [...new Set((policy.allowedModels || []).map((value) => String(value).trim()))].sort();
    const allowedPayToHash = keccak256(encodeAbiParameters([{ type: 'address[]' }], [allowedPayTo]));
    const allowedModelsHash = keccak256(encodeAbiParameters([{ type: 'string[]' }], [allowedModels]));
    return await verifyTypedData({ address: policy.owner, domain: policyDomain, types: policyTypes, primaryType: 'Policy', message: { policyId: policy.policyId, owner: policy.owner, agentWallet: policy.agentWallet, chainId: BigInt(policy.chainId), asset: policy.asset, maxTotalAtomic: BigInt(policy.maxTotalAtomic), maxPerRequestAtomic: BigInt(policy.maxPerRequestAtomic), allowedPayToHash, allowedModelsHash, validUntil: BigInt(policy.validUntil) }, signature });
  } catch { return false; }
}

export async function verifyReservationIntent({ intent, signature, expectedAddress }) {
  if (!intent || !signature || !expectedAddress) return false;
  try {
    return await verifyTypedData({ address: expectedAddress, domain: reservationDomain, types: reservationTypes, primaryType: 'ReservationIntent', message: { policyId: intent.policyId, purchaseId: intent.purchaseId, requestDigest: intent.requestDigest, commerceEnvelopeDigest: intent.commerceEnvelopeDigest, maxAtomic: BigInt(intent.maxAtomic), expiresAt: BigInt(intent.expiresAt) }, signature });
  } catch { return false; }
}

export async function verifyPolicyRevocation({ revocation, signature, expectedAddress }) {
  if (!revocation || !signature || !expectedAddress) return false;
  try {
    return await verifyTypedData({ address: expectedAddress, domain: revocationDomain, types: revocationTypes, primaryType: 'PolicyRevocation', message: { policyId: revocation.policyId, owner: revocation.owner, chainId: BigInt(revocation.chainId), revokedAt: BigInt(revocation.revokedAt) }, signature });
  } catch { return false; }
}
