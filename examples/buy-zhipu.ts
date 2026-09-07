import { privateKeyToAccount } from 'viem/accounts';
import {
  createAgentPay,
  createAiplansDiscovery,
  createX402PaymentSigner,
  signProcurementPolicy,
  signReservationIntent,
} from '@toolkit-fun/agentpay-sdk';
import type { ProcurementPolicy } from '@toolkit-fun/agentpay-protocol';

const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) throw new Error('AGENT_PRIVATE_KEY is required');

const account = privateKeyToAccount(privateKey);
const toolkitBaseUrl = process.env.TOOLKIT_BASE_URL || 'http://127.0.0.1:4021';
const policy: ProcurementPolicy = JSON.parse(String(process.env.AGENTPAY_POLICY_JSON || 'null'));
if (!policy) throw new Error('AGENTPAY_POLICY_JSON is required');

const policySignature = await signProcurementPolicy(policy, account);
const signPayment = await createX402PaymentSigner({ signer: account, rpcUrl: process.env.MONAD_RPC_URL });
const client = createAgentPay({
  policy,
  policySignature,
  discovery: createAiplansDiscovery({ baseUrl: 'https://aiplans.dev', toolkitBaseUrl }),
  baseUrl: toolkitBaseUrl,
});

const result = await client.buy({
  policyId: policy.policyId,
  body: { prompt: process.argv.slice(2).join(' ') || 'Build the next task' },
  inputTokens: 1_000,
  outputCap: 2_000,
  signReservation: (intent) => signReservationIntent(intent as never, account),
  signPayment,
  waitForSettlement: true,
});

console.log(JSON.stringify(result, null, 2));
