import { describe, it, expect } from 'vitest';
import { crossCheck, crossCheckAll } from './cross-check';

const base = { authoritySymbol: 2034, fiscalYear: 2023, topic: 'state_transfers', sourceA: 'a', sourceB: 'b' };

describe('cross-source verification (task 21)', () => {
  it('flags a material gap (>5%)', () => {
    const r = crossCheck({ ...base, valueA: 1_000_000, valueB: 800_000 });
    expect(r.isMaterial).toBe(true);
    expect(Math.round(r.deltaPct)).toBe(20);
    expect(r.delta).toBe(200_000);
  });

  it('does not flag a matching pair (<5%)', () => {
    const r = crossCheck({ ...base, valueA: 1_000_000, valueB: 970_000 });
    expect(r.isMaterial).toBe(false);
  });

  it('handles both-zero without dividing by zero', () => {
    const r = crossCheck({ ...base, valueA: 0, valueB: 0 });
    expect(r.deltaPct).toBe(0);
    expect(r.isMaterial).toBe(false);
  });

  it('summarizes matched vs material across many authorities', () => {
    const s = crossCheckAll([
      { ...base, valueA: 100, valueB: 100 },
      { ...base, valueA: 100, valueB: 50 },
      { ...base, valueA: 200, valueB: 199 },
    ]);
    expect(s.total).toBe(3);
    expect(s.material).toBe(1);
    expect(s.matched).toBe(2);
  });
});
