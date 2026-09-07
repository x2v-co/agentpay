// Served with a separate CSP denying network, nested workers and script imports.
self.onmessage = ({ data }) => {
  try {
    let source = String(data.source || '').trim();
    if (source.startsWith('```')) source = source.replace(/^```(?:javascript|js)?\s*\n/, '').replace(/\n```\s*$/, '').trim();
    if (!source.startsWith('function createCheckout(') || source.length > 30000) throw new Error('Expected plain function createCheckout() source');
    const createCheckout = new Function(`"use strict";\n${source}\nreturn createCheckout;`)();
    const first = createCheckout(); const a = first.pay('a');
    const different = createCheckout(); different.pay('a'); different.pay('b');
    const retry = createCheckout(); const original = retry.pay('a'); const repeated = retry.pay('a');
    self.postMessage({ tests: [{ name: 'First request', pass: a.id === 'receipt-1' && first.charges === 1 }, { name: 'Distinct keys', pass: different.charges === 2 }, { name: 'Retry reuses receipt', pass: original === repeated && retry.charges === 1 }] });
  } catch { self.postMessage({ error: 'Generated source did not satisfy the checkout interface. No code was replaced.' }); }
};
