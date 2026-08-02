import { describe, it, expect } from 'vitest';
import { computeArnona, splitTaxByTopic } from './arnona';

describe('arnona calculator (task 34)', () => {
  it('computes gross = area × tariff with no discounts', () => {
    const r = computeArnona({ areaSqm: 100, tariffPerSqm: 45 });
    expect(r.gross).toBe(4500);
    expect(r.net).toBe(4500);
    expect(r.discountTotal).toBe(0);
  });

  it('applies stacked discounts on the gross', () => {
    const r = computeArnona({
      areaSqm: 100,
      tariffPerSqm: 50,
      discounts: [
        { label: 'אזרח ותיק', pct: 30 },
        { label: 'נכות', pct: 10 },
      ],
    });
    expect(r.gross).toBe(5000);
    expect(r.effectiveDiscountPct).toBe(40);
    expect(r.discountTotal).toBe(2000);
    expect(r.net).toBe(3000);
  });

  it('caps total discount at 100%', () => {
    const r = computeArnona({ areaSqm: 10, tariffPerSqm: 10, discounts: [{ label: 'x', pct: 150 }] });
    expect(r.effectiveDiscountPct).toBe(100);
    expect(r.net).toBe(0);
  });

  it('produces a readable line breakdown', () => {
    const r = computeArnona({ areaSqm: 50, tariffPerSqm: 40, discounts: [{ label: 'הנחה', pct: 25 }] });
    expect(r.lines[0]!.label).toContain('ברוטו');
    expect(r.lines.at(-1)!.label).toContain('נטו');
    expect(r.lines.at(-1)!.amount).toBe(1500);
  });

  it('splits a paid amount across topics by share', () => {
    const split = splitTaxByTopic(1000, { education: 0.4, welfare: 0.25, admin: 0.35 });
    expect(split.find((s) => s.topic === 'education')!.amount).toBeCloseTo(400);
    expect(split.reduce((a, s) => a + s.amount, 0)).toBeCloseTo(1000);
  });
});
