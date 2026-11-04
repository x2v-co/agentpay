/** Full SHA-256 binding, encoded compactly to fit the exact SDK's 20k CU budget.
 * No truncation: both the unique order and canonical request digest are bound.
 * Web Crypto keeps the same implementation usable in the browser and server. */
export async function orderMemo(orderId: string, requestDigest: string): Promise<string> {
  const bytes = new TextEncoder().encode(`agentpay:${orderId}:${requestDigest}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'ap:' + btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
