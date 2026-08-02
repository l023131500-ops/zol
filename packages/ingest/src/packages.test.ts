import { describe, it, expect } from 'vitest';
import {
  packagesForYear,
  dedupeFacts,
  dedupeKey,
  EXPECTED_PERIOD,
  type DedupKeyed,
} from './packages';

describe('four-package registry + dedup', () => {
  it('covers a continuous 2014–2024 series', () => {
    for (let y = 2014; y <= 2024; y++) {
      expect(packagesForYear(y).length, `year ${y}`).toBeGreaterThan(0);
    }
  });

  it('2020–2021 gap is filled by audit-cities / council packages', () => {
    expect(packagesForYear(2020).map((p) => p.id)).toContain('audit-cities');
    expect(packagesForYear(2021).length).toBeGreaterThan(0);
    // local-authorities does NOT cover 2020–2021
    expect(packagesForYear(2020).map((p) => p.id)).not.toContain('local-authorities');
  });

  it('lists candidate packages highest-priority first', () => {
    const p2024 = packagesForYear(2024);
    expect(p2024[0]!.id).toBe('local-authorities');
  });

  it('the period constant is annual-only', () => {
    expect(EXPECTED_PERIOD).toBe('שנתי');
  });

  it('dedupes by (symbol,year,coa,measure), newer package wins, counts dropped', () => {
    const rows: DedupKeyed[] = [
      { authority_symbol: 2034, fiscal_year: 2021, coa_code: 6111, measure: 'actual', packagePriority: 30 }, // audit-cities
      { authority_symbol: 2034, fiscal_year: 2021, coa_code: 6111, measure: 'actual', packagePriority: 20 }, // council-1 (older)
      { authority_symbol: 2034, fiscal_year: 2021, coa_code: 1111, measure: 'actual', packagePriority: 20 },
    ];
    const { kept, duplicatesDropped } = dedupeFacts(rows);
    expect(kept).toHaveLength(2);
    expect(duplicatesDropped).toBe(1);
    const winner = kept.find((r) => r.coa_code === 6111)!;
    expect(winner.packagePriority).toBe(30); // newer package kept
  });

  it('dedupeKey is stable', () => {
    expect(
      dedupeKey({ authority_symbol: 1, fiscal_year: 2024, coa_code: 6111, measure: 'actual', packagePriority: 1 }),
    ).toBe('1|2024|6111|actual');
  });
});
