import { describe, it, expect } from 'vitest';
import { computeMetric, METRICS } from './metrics';
import { buildPeerGroup, percentile, peerStats, isPeer, type AuthorityLike } from './peer-group';

describe('metrics engine (task 25)', () => {
  it('every metric exposes a user-visible formula', () => {
    for (const m of METRICS) expect(m.formula.length).toBeGreaterThan(0);
  });

  it('computes collection rate', () => {
    expect(computeMetric('collection_rate', { collected: 78, charged: 100 })).toBeCloseTo(78);
  });

  it('computes expense per pupil', () => {
    expect(computeMetric('expense_per_pupil', { educationExpense: 8_400_000, pupils: 1000 })).toBe(8400);
  });

  it('propagates missing data as null (never a guess)', () => {
    expect(computeMetric('self_income_per_capita', { selfIncome: 5, population: null })).toBeNull();
    expect(computeMetric('collection_rate', { collected: 10, charged: 0 })).toBeNull();
  });
});

describe('peer groups (task 26)', () => {
  const hatzor: AuthorityLike = {
    symbol: 2034,
    status: 'local_council',
    socioEconomicCluster: 4,
    peripheralityCluster: 3,
    population: 11251,
  };
  const near: AuthorityLike = {
    symbol: 10,
    status: 'local_council',
    socioEconomicCluster: 5,
    peripheralityCluster: 2,
    population: 13000,
  };
  const farCluster: AuthorityLike = {
    symbol: 11,
    status: 'local_council',
    socioEconomicCluster: 8,
    peripheralityCluster: 3,
    population: 11000,
  };
  const farPopulation: AuthorityLike = {
    symbol: 12,
    status: 'local_council',
    socioEconomicCluster: 4,
    peripheralityCluster: 3,
    population: 40000,
  };
  const wrongStatus: AuthorityLike = {
    symbol: 13,
    status: 'municipality',
    socioEconomicCluster: 4,
    peripheralityCluster: 3,
    population: 11000,
  };

  it('includes similar authorities and excludes dissimilar ones', () => {
    const group = buildPeerGroup(hatzor, [near, farCluster, farPopulation, wrongStatus]);
    const symbols = group.map((a) => a.symbol);
    expect(symbols).toContain(10);
    expect(symbols).not.toContain(11); // cluster too far
    expect(symbols).not.toContain(12); // population too far
    expect(symbols).not.toContain(13); // different status
  });

  it('never includes the authority itself', () => {
    expect(isPeer(hatzor, hatzor)).toBe(false);
  });

  it('percentiles match linear interpolation', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5);
    expect(percentile([10, 20, 30], 25)).toBeCloseTo(15);
    expect(percentile([], 50)).toBeNull();
  });

  it('peerStats ignores nulls', () => {
    const s = peerStats([1, null, 3, null, 5]);
    expect(s.n).toBe(3);
    expect(s.median).toBeCloseTo(3);
  });
});
