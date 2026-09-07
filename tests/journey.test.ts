import { describe, it, expect } from 'vitest';
// Browser and tests share the policy and executable teaching fixture.
// @ts-ignore JavaScript demo module
import { freshState, decision, accessibleStep, restoreState, runCheckoutTests, FIX_SOURCE } from '../apps/demo/journey-model.mjs';
describe('interactive commission', () => {
  it('enforces the required authorization ceiling, not the small final charge', () => {
    expect(decision({...freshState(),budget:10000})).toBe('budget-blocked');
    expect(decision({...freshState(),budget:0})).toBe('budget-blocked');
    expect(decision(freshState())).toBe('allowed');
  });
  it('requires approval and preserves a declined purchase as blocked', () => {
    const s = {...freshState(),mode:'ask',hired:true,checkpoint:true};
    expect(decision(s)).toBe('approval-required');
    expect(decision({...s,denied:true})).toBe('denied');
    expect(accessibleStep('connect',s)).toBe('market');
    expect(decision({...s,approved:true})).toBe('allowed');
  });
  it('guards direct URLs and recovers valid stored progress', () => {
    expect(accessibleStep('delivery',freshState())).toBe('hire');
    expect(accessibleStep('delivery',{...freshState(),hired:true})).toBe('work');
    const s={...freshState(),hired:true,checkpoint:true,step:'delivery'};
    expect(restoreState(JSON.stringify(s)).step).toBe('connect');
    expect(restoreState('{broken')).toEqual(freshState());
    expect(restoreState(JSON.stringify({...s,budget:Infinity}))).toEqual(freshState());
  });
  it('actually reproduces the duplicate charge and verifies the fix', () => {
    expect(runCheckoutTests(false).map((t:{pass:boolean})=>t.pass)).toEqual([true,true,false]);
    expect(runCheckoutTests(true).every((t:{pass:boolean})=>t.pass)).toBe(true);
  });
  it('downloads runnable code with the same retry semantics', async () => {
    const fixture = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(FIX_SOURCE).toString('base64')}`);
    const checkout=fixture.createCheckout();
    expect(checkout.pay('a')).toBe(checkout.pay('a'));
    expect(checkout.charges).toBe(1);
    checkout.pay('b'); expect(checkout.charges).toBe(2);
  });
});
