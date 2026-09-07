const config = {
  ai: { zhipuModel: process.env.ZHIPU_MODEL || 'GLM-4.7-Flash' },
  zhipuApiKey: process.env.ZHIPU_APIKEY || '',
  sandbox: { aiTimeoutMs: Number(process.env.AGENTPAY_PROVIDER_TIMEOUT_MS || 30_000) },
};

/**
 * Raw Zhipu adapter for AgentPay. It deliberately bypasses subscription
 * entitlement and returns provider-reported usage as an immutable execution
 * record. The demo uses the deterministic fixture unless live mode is opted in.
 */
export async function invokeZhipu({ prompt, messages, outputCap, model = config.ai.zhipuModel, fetcher = fetch, apiKey = config.zhipuApiKey, timeoutMs = config.sandbox.aiTimeoutMs, recorded = process.env.AGENTPAY_RECORDED !== '0' } = {}) {
  const normalizedMessages = Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: String(prompt || '') }];
  if (recorded) {
    const text = String(normalizedMessages.at(-1)?.content || prompt || 'Create a payment-aware agent demo');
    const output = `Agent completed: ${text.slice(0, 96)}.\n\nToolkit route fulfilled this request with an owner-bounded upto authorization.`;
    return { result: { output, model }, usage: { inputTokens: Math.max(1, Math.ceil(text.length / 4)), outputTokens: Math.max(1, Math.ceil(output.length / 4)) }, source: 'recorded' };
  }
  if (!apiKey) {
    const error = new Error('Zhipu credentials are not configured for live AgentPay execution');
    error.status = 503;
    error.code = 'readiness_unavailable';
    error.retryable = false;
    throw error;
  }
  let response;
  try {
    response = await fetcher('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: normalizedMessages, ...(Number.isSafeInteger(outputCap) && outputCap > 0 ? { max_tokens: outputCap } : {}), temperature: 0.2, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const wrapped = new Error('Zhipu transport failed after dispatch'); wrapped.code = 'execution_unknown'; wrapped.retryable = false; throw wrapped;
  }
  if (!response.ok) { const error = new Error(`Zhipu definitive response ${response.status}`); error.code = 'failed_unsettled'; error.retryable = false; throw error; }
  const payload = await response.json();
  const usage = payload?.usage;
  if (!Number.isInteger(usage?.prompt_tokens) || !Number.isInteger(usage?.completion_tokens)) { const error = new Error('Zhipu response omitted token usage'); error.code = 'execution_unknown'; error.retryable = false; throw error; }
  return { result: { output: String(payload.choices?.[0]?.message?.content || ''), model }, usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }, source: 'zhipu' };
}
