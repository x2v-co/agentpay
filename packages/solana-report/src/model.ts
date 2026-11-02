import { createHash } from 'node:crypto';
import { address } from '@solana/kit';
import type { PaymentRequirements, SettleResponse } from '@x402/core/types';

export const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;
export const MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const PRICE = '1000'; // 0.001 devnet USDC, six decimals.
export type Mode = 'offline' | 'devnet';
export type ReportInput = { budgetAtomic: string; spentAtomic: string; quoteAtomic: string; quantity: number };
export type Report = ReportInput & { costAtomic: string; remainingAtomic: string; affordable: boolean; reason: 'within_budget' | 'budget_exceeded' };
export type State = 'quoted' | 'settling' | 'pending' | 'paid' | 'delivered' | 'rejected';
export type Order = {
  id: string; mode: Mode; request: ReportInput; requestDigest: string; payer: string;
  createdAt: number; expiresAt: number; resource: string; requirements: PaymentRequirements;
  state: State; paymentId?: string; transaction?: string; settlement?: SettleResponse;
  report?: Report; resultDigest?: string; reason?: string;
};
export class Problem extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function invariant(ok: unknown, code: string, status = 400): asserts ok {
  if (!ok) throw new Problem(status, code);
}
export function svmAddress(value: unknown): string {
  invariant(typeof value === 'string', 'invalid_svm_address');
  try { return address(value); } catch { throw new Problem(400, 'invalid_svm_address'); }
}
export function atomic(value: unknown): string {
  invariant(typeof value === 'string' && /^(0|[1-9][0-9]{0,17})$/.test(value), 'invalid_atomic_amount');
  return value;
}
export function reportInput(value: unknown): ReportInput {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'invalid_report_input');
  const v = value as Record<string, unknown>;
  invariant(Object.keys(v).sort().join(',') === 'budgetAtomic,quantity,quoteAtomic,spentAtomic', 'invalid_report_fields');
  invariant(Number.isInteger(v.quantity) && Number(v.quantity) >= 1 && Number(v.quantity) <= 10000, 'invalid_quantity');
  const input = { budgetAtomic: atomic(v.budgetAtomic), spentAtomic: atomic(v.spentAtomic), quoteAtomic: atomic(v.quoteAtomic), quantity: Number(v.quantity) };
  invariant(BigInt(input.spentAtomic) <= BigInt(input.budgetAtomic), 'spent_exceeds_budget');
  return input;
}
export function calculateReport(input: ReportInput): Report {
  const cost = BigInt(input.quoteAtomic) * BigInt(input.quantity);
  const remaining = BigInt(input.budgetAtomic) - BigInt(input.spentAtomic) - cost;
  return { ...input, costAtomic: String(cost), remainingAtomic: String(remaining), affordable: remaining >= 0n, reason: remaining >= 0n ? 'within_budget' : 'budget_exceeded' };
}
// Inputs to this digest have explicit, stable field ordering. Payment requirements
// are compared structurally below, never by JSON property insertion order.
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
