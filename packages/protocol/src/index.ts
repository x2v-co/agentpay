import { createHash } from 'node:crypto';
import { encodeAbiParameters, hashTypedData, keccak256 } from 'viem';

export const AGENTPAY_PROTOCOL_VERSION = 'agentpay.v1' as const;

export const PURCHASE_STATES = {
  RESERVED: 'reserved',
  RESERVATION_EXPIRED: 'reservation_expired',
  AUTHORIZED: 'authorized',
  EXECUTING: 'executing',
  EXECUTION_UNKNOWN: 'execution_unknown',
  EXECUTED_PENDING_SETTLEMENT: 'executed_pending_settlement',
  FACILITATOR_SETTLED: 'facilitator_settled',
  CHAIN_CONFIRMED: 'chain_confirmed',
  SETTLEMENT_FAILED: 'settlement_failed',
  SETTLEMENT_UNKNOWN: 'settlement_unknown',
  EXECUTED_UNPAID: 'executed_unpaid',
  FAILED_UNSETTLED: 'failed_unsettled',
} as const;
export type PurchaseState = typeof PURCHASE_STATES[keyof typeof PURCHASE_STATES];

export const NEXT_ACTIONS = {
  REQUOTE: 'requote',
  APPROVE_PERMIT2: 'approve_permit2',
  RETRY_SAME_PURCHASE: 'retry_same_purchase',
  CONTINUE_RECONCILIATION: 'continue_reconciliation',
  RECOVER_ACCESS: 'recover_access',
  USE_NEW_PURCHASE_ID: 'use_new_purchase_id',
  STOP: 'stop',
} as const;
export type AgentPayNextAction = typeof NEXT_ACTIONS[keyof typeof NEXT_ACTIONS];

export const AGENTPAY_ERROR_CODES = [
  'readiness_unavailable', 'readiness_incompatible', 'policy_invalid', 'policy_revoked',
  'policy_expired', 'offer_invalid', 'manifest_invalid', 'unsupported_billing',
  'no_eligible_offer', 'offer_expired', 'price_exceeds_policy', 'reservation_expired',
  'permit2_allowance_missing', 'reservation_conflict', 'authorization_conflict',
  'request_digest_conflict', 'access_token_lost', 'access_token_invalid',
  'settlement_pending', 'settlement_unknown', 'pending_receipt', 'chain_confirmation_pending',
  'transport_before_dispatch', 'reservation_temporarily_unavailable', 'execution_unknown',
  'failed_unsettled', 'executed_unpaid', 'reservation_expired_after_authorization',
  'payment_consumed_without_tx', 'disputed_amount', 'disputed_recipient',
  'disputed_model', 'disputed_digest', 'settlement_disputed',
  'purchase_not_found', 'result_pending', 'proof_not_found',
] as const;
export type AgentPayErrorCode = typeof AGENTPAY_ERROR_CODES[number];

export type AgentPayPhase = 'readiness' | 'discovery' | 'reservation' | 'preflight' |
  'authorization' | 'execution' | 'settlement' | 'receipt' | 'reconciliation' | 'access';

export type AgentPayProblem = {
  type: `https://toolkit.fun/problems/agentpay/${string}`;
  title: string;
  status: number;
  code: AgentPayErrorCode;
  phase: AgentPayPhase;
  retryable: boolean;
  nextAction: AgentPayNextAction;
  purchaseId?: string;
  detail?: string;
};

const ACTION_BY_CODE: Record<AgentPayErrorCode, AgentPayNextAction> = {
  readiness_unavailable: 'stop', readiness_incompatible: 'stop', policy_invalid: 'stop',
  policy_revoked: 'stop', policy_expired: 'stop', offer_invalid: 'stop', manifest_invalid: 'stop',
  unsupported_billing: 'stop', no_eligible_offer: 'requote', offer_expired: 'requote',
  price_exceeds_policy: 'requote', reservation_expired: 'requote', permit2_allowance_missing: 'approve_permit2',
  reservation_conflict: 'use_new_purchase_id', authorization_conflict: 'use_new_purchase_id',
  request_digest_conflict: 'use_new_purchase_id', access_token_lost: 'recover_access',
  access_token_invalid: 'recover_access', settlement_pending: 'continue_reconciliation',
  settlement_unknown: 'continue_reconciliation', pending_receipt: 'continue_reconciliation',
  chain_confirmation_pending: 'continue_reconciliation', transport_before_dispatch: 'retry_same_purchase',
  reservation_temporarily_unavailable: 'retry_same_purchase', execution_unknown: 'stop',
  failed_unsettled: 'stop', executed_unpaid: 'stop', reservation_expired_after_authorization: 'stop',
  payment_consumed_without_tx: 'stop', disputed_amount: 'stop', disputed_recipient: 'stop',
  disputed_model: 'stop', disputed_digest: 'stop', settlement_disputed: 'stop',
  purchase_not_found: 'stop', result_pending: 'continue_reconciliation', proof_not_found: 'stop',
};

export const agentPayActionFor = (code: AgentPayErrorCode): AgentPayNextAction => ACTION_BY_CODE[code];

export function isAgentPayErrorCode(value: unknown): value is AgentPayErrorCode {
  return typeof value === 'string' && (AGENTPAY_ERROR_CODES as readonly string[]).includes(value);
}

export function assertProblem(problem: unknown): asserts problem is AgentPayProblem {
  if (!problem || typeof problem !== 'object') throw new Error('invalid AgentPay problem');
  const p = problem as Record<string, unknown>;
  if (typeof p.type !== 'string' || !p.type.startsWith('https://toolkit.fun/problems/agentpay/')) throw new Error('invalid AgentPay problem type');
  if (!Number.isInteger(p.status) || Number(p.status) < 400 || Number(p.status) > 599) throw new Error('invalid AgentPay problem status');
  if (!isAgentPayErrorCode(p.code)) throw new Error('unknown AgentPay error code');
  if (typeof p.phase !== 'string' || !['readiness', 'discovery', 'reservation', 'preflight', 'authorization', 'execution', 'settlement', 'receipt', 'reconciliation', 'access'].includes(p.phase)) throw new Error('invalid AgentPay problem phase');
  if (typeof p.retryable !== 'boolean' || typeof p.nextAction !== 'string' || p.nextAction !== agentPayActionFor(p.code)) throw new Error('invalid AgentPay problem action');
}

export function problem(input: Omit<AgentPayProblem, 'type'> & { type?: AgentPayProblem['type'] }): AgentPayProblem {
  const out = { type: input.type || `https://toolkit.fun/problems/agentpay/${input.code}`, ...input } as AgentPayProblem;
  assertProblem(out);
  return out;
}

export class AgentPayProblemError extends Error {
  readonly problem: AgentPayProblem;
  constructor(value: AgentPayProblem) {
    super(value.title);
    this.name = 'AgentPayProblemError';
    this.problem = value;
    Object.assign(this, value);
  }
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'bigint') return `${value}n`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

export function digest(value: unknown): `sha256:${string}` {
  return `sha256:${sha256Hex(value)}`;
}

export function digestToBytes32(value: string): `0x${string}` {
  const normalized = String(value || '').toLowerCase();
  if (/^sha256:[0-9a-f]{64}$/.test(normalized)) return `0x${normalized.slice(7)}`;
  if (/^0x[0-9a-f]{64}$/.test(normalized)) return normalized as `0x${string}`;
  throw new Error('digest must be sha256:<64 hex> or bytes32');
}

export function calculateChargeAtomic(inputTokens: bigint | number | string, outputTokens: bigint | number | string, inputAtomicPerMillion: bigint | number | string, outputAtomicPerMillion: bigint | number | string): bigint {
  const numerator = BigInt(inputTokens) * BigInt(inputAtomicPerMillion) + BigInt(outputTokens) * BigInt(outputAtomicPerMillion);
  return (numerator + 999_999n) / 1_000_000n;
}

export function uuidToBytes(uuid: string): `0x${string}` {
  const hex = uuid.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('purchaseId must be UUID-shaped');
  return `0x${hex}`;
}

function canonicalAddress(value: string, label: string): `0x${string}` {
  const normalized = String(value || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new Error(`${label} must be a 20-byte address`);
  return normalized as `0x${string}`;
}

function canonicalModel(value: string): string {
  const normalized = String(value || '').trim();
  if (!normalized || !normalized.includes('/') || normalized.includes(' ')) throw new Error('allowed model must be provider/model');
  return normalized;
}

export type ProcurementPolicy = {
  schema: 'agentpay.policy.v1';
  policyId: `0x${string}`;
  owner: `0x${string}`;
  agentWallet: `0x${string}`;
  chainId: number;
  asset: `0x${string}`;
  maxTotalAtomic: string;
  maxPerRequestAtomic: string;
  allowedPayTo: `0x${string}`[];
  allowedModels: string[];
  validUntil: number;
};

export const AGENTPAY_POLICY_DOMAIN = {
  name: 'AgentPay Procurement Policy', version: '1', chainId: 10143,
  salt: keccak256(new TextEncoder().encode('toolkit.fun/agentpay/policy/v1')),
} as const;

export const AGENTPAY_RESERVATION_DOMAIN = {
  name: 'AgentPay Reservation Intent', version: '1', chainId: 10143,
  salt: keccak256(new TextEncoder().encode('toolkit.fun/agentpay/reservation/v1')),
} as const;
export const AGENTPAY_REVOCATION_DOMAIN = {
  name: 'AgentPay Policy Revocation', version: '1', chainId: 10143,
  salt: keccak256(new TextEncoder().encode('toolkit.fun/agentpay/revocation/v1')),
} as const;

export function policyListHashes(policy: Pick<ProcurementPolicy, 'allowedPayTo' | 'allowedModels'>) {
  const payTo = policy.allowedPayTo.map((value) => canonicalAddress(value, 'allowedPayTo')).sort();
  const models = policy.allowedModels.map(canonicalModel).sort();
  return {
    allowedPayToHash: keccak256(encodeAbiParameters([{ type: 'address[]' }], [payTo])),
    allowedModelsHash: keccak256(encodeAbiParameters([{ type: 'string[]' }], [models])),
  } as const;
}

export function policyTypedData(policy: ProcurementPolicy) {
  const normalized = normalizePolicy(policy);
  const hashes = policyListHashes(normalized);
  return {
    domain: AGENTPAY_POLICY_DOMAIN,
    types: { Policy: AGENTPAY_EIP712.policy.Policy },
    primaryType: 'Policy' as const,
    message: {
      policyId: normalized.policyId,
      owner: normalized.owner,
      agentWallet: normalized.agentWallet,
      chainId: BigInt(normalized.chainId),
      asset: normalized.asset,
      maxTotalAtomic: BigInt(normalized.maxTotalAtomic),
      maxPerRequestAtomic: BigInt(normalized.maxPerRequestAtomic),
      allowedPayToHash: hashes.allowedPayToHash,
      allowedModelsHash: hashes.allowedModelsHash,
      validUntil: BigInt(normalized.validUntil),
    },
  } as const;
}

export function policyDigest(policy: ProcurementPolicy): `0x${string}` {
  return hashTypedData(policyTypedData(policy) as any);
}

export type ReservationIntent = {
  policyId: `0x${string}`;
  purchaseId: `0x${string}`;
  requestDigest: `0x${string}`;
  commerceEnvelopeDigest: `0x${string}`;
  maxAtomic: string;
  expiresAt: number;
};

export function reservationTypedData(input: ReservationIntent) {
  const policyId = String(input.policyId || '').toLowerCase();
  const purchaseId = String(input.purchaseId || '').toLowerCase();
  const requestDigest = String(input.requestDigest || '').toLowerCase();
  const commerceEnvelopeDigest = String(input.commerceEnvelopeDigest || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(policyId)) throw new Error('reservation policyId must be bytes32');
  if (!/^0x[0-9a-f]{32}$/.test(purchaseId)) throw new Error('reservation purchaseId must be bytes16');
  if (!/^0x[0-9a-f]{64}$/.test(requestDigest) || !/^0x[0-9a-f]{64}$/.test(commerceEnvelopeDigest)) throw new Error('reservation digests must be bytes32');
  const maxAtomic = BigInt(input.maxAtomic);
  const expiresAt = BigInt(input.expiresAt);
  if (maxAtomic < 0n || expiresAt <= 0n) throw new Error('reservation amount or expiry is invalid');
  return {
    domain: AGENTPAY_RESERVATION_DOMAIN,
    types: { ReservationIntent: AGENTPAY_EIP712.reservation.ReservationIntent },
    primaryType: 'ReservationIntent' as const,
    message: { policyId, purchaseId, requestDigest, commerceEnvelopeDigest, maxAtomic, expiresAt },
  } as const;
}

export function revocationTypedData(input: { policyId: `0x${string}`; owner: `0x${string}`; chainId: number; revokedAt: number }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.policyId)) throw new Error('policyId must be bytes32');
  return { domain: AGENTPAY_REVOCATION_DOMAIN, types: { PolicyRevocation: AGENTPAY_EIP712.revocation.PolicyRevocation }, primaryType: 'PolicyRevocation' as const, message: { policyId: input.policyId, owner: canonicalAddress(input.owner, 'owner'), chainId: BigInt(input.chainId), revokedAt: BigInt(input.revokedAt) } } as const;
}

export function normalizePolicy(policy: ProcurementPolicy): ProcurementPolicy {
  if (policy.schema !== 'agentpay.policy.v1') throw new Error('unsupported policy schema');
  if (!Number.isSafeInteger(policy.chainId) || policy.chainId <= 0) throw new Error('invalid policy chain');
  if (!Number.isSafeInteger(policy.validUntil) || policy.validUntil <= 0) throw new Error('invalid policy expiry');
  const maxTotal = BigInt(policy.maxTotalAtomic);
  const maxPerRequest = BigInt(policy.maxPerRequestAtomic);
  if (maxTotal < 0n || maxPerRequest < 0n || maxPerRequest > maxTotal) throw new Error('invalid policy limits');
  const owner = canonicalAddress(policy.owner, 'owner');
  const agentWallet = canonicalAddress(policy.agentWallet, 'agentWallet');
  const asset = canonicalAddress(policy.asset, 'asset');
  const policyId = String(policy.policyId || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(policyId)) throw new Error('policyId must be bytes32');
  return { ...policy, policyId: policyId as `0x${string}`, owner, agentWallet, asset, maxTotalAtomic: maxTotal.toString(), maxPerRequestAtomic: maxPerRequest.toString(), allowedPayTo: [...new Set(policy.allowedPayTo.map((v) => canonicalAddress(v, 'allowedPayTo')))].sort(), allowedModels: [...new Set(policy.allowedModels.map(canonicalModel))].sort() };
}

export const AGENTPAY_EIP712 = {
  policy: { Policy: [{ name: 'policyId', type: 'bytes32' }, { name: 'owner', type: 'address' }, { name: 'agentWallet', type: 'address' }, { name: 'chainId', type: 'uint256' }, { name: 'asset', type: 'address' }, { name: 'maxTotalAtomic', type: 'uint256' }, { name: 'maxPerRequestAtomic', type: 'uint256' }, { name: 'allowedPayToHash', type: 'bytes32' }, { name: 'allowedModelsHash', type: 'bytes32' }, { name: 'validUntil', type: 'uint64' }] },
  reservation: { ReservationIntent: [{ name: 'policyId', type: 'bytes32' }, { name: 'purchaseId', type: 'bytes16' }, { name: 'requestDigest', type: 'bytes32' }, { name: 'commerceEnvelopeDigest', type: 'bytes32' }, { name: 'maxAtomic', type: 'uint256' }, { name: 'expiresAt', type: 'uint64' }] },
  revocation: { PolicyRevocation: [{ name: 'policyId', type: 'bytes32' }, { name: 'owner', type: 'address' }, { name: 'chainId', type: 'uint256' }, { name: 'revokedAt', type: 'uint64' }] },
} as const;

export type ToolkitMachineOffer = {
  offerId: string;
  providerSlug: string;
  modelSlug: string;
  route: string;
  payTo: `0x${string}`;
  maxInputTokens: number;
  maxOutputTokens: number;
  inputAtomicPerMillion: string;
  outputAtomicPerMillion: string;
  x402MaxAtomic: string;
  rateVersion: string;
  manifestDigest: string;
  validUntil: number;
  fulfillment: 'machine';
  network?: string;
  asset?: string;
};

export type ToolkitCommerceEnvelope = {
  schemaVersion: 'agentpay.commerce-envelope.v1';
  offerId: string;
  resource: string;
  model: string;
  rateVersion: string;
  inputAtomicPerMillion: string;
  outputAtomicPerMillion: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  manifestDigest: string;
  requestDigest: `sha256:${string}`;
  x402OfferDigest: `sha256:${string}`;
  payTo: `0x${string}`;
  validUntil: number;
};

export function requestDigest(value: unknown): `sha256:${string}` { return digest(value); }

export function buildCommerceEnvelope(input: Omit<ToolkitCommerceEnvelope, 'schemaVersion' | 'model'> & { providerSlug: string; modelSlug: string }): ToolkitCommerceEnvelope {
  const envelope = {
    schemaVersion: 'agentpay.commerce-envelope.v1' as const,
    ...input,
    model: `${input.providerSlug}/${input.modelSlug}`,
  } as ToolkitCommerceEnvelope & { providerSlug?: string; modelSlug?: string };
  delete envelope.providerSlug;
  delete envelope.modelSlug;
  if (!/^sha256:[0-9a-f]{64}$/.test(envelope.requestDigest) || !/^sha256:[0-9a-f]{64}$/.test(envelope.x402OfferDigest)) throw new Error('commerce envelope digests must be sha256 hex');
  if (!Number.isInteger(envelope.maxInputTokens) || envelope.maxInputTokens < 0 || !Number.isInteger(envelope.maxOutputTokens) || envelope.maxOutputTokens < 0) throw new Error('commerce envelope token caps are invalid');
  return envelope;
}

export function commerceEnvelopeDigest(envelope: ToolkitCommerceEnvelope): `sha256:${string}` { return digest(envelope); }
