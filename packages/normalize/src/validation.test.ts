import { describe, it, expect } from 'vitest';
import {
  checkArithmetic,
  checkYearRange,
  checkAuthoritySymbol,
  checkContinuity,
  checkOutlier,
  checkRegistrationId,
  checkCrossSource,
} from './validation';

describe('validation rules (task 18)', () => {
  it('rule 1 — arithmetic subtotal within ₪1 tolerance', () => {
    expect(checkArithmetic([100, 200, 300], 600)).toBeNull();
    expect(checkArithmetic([100, 200, 300], 600.5)).toBeNull(); // rounding
    expect(checkArithmetic([100, 200], 600)?.reason).toBe('arithmetic_mismatch');
  });

  it('rule 2 — year range 2010..next', () => {
    expect(checkYearRange(2024, 2027)).toBeNull();
    expect(checkYearRange(2009, 2027)?.reason).toBe('year_out_of_range');
    expect(checkYearRange(2099, 2027)?.reason).toBe('year_out_of_range');
  });

  it('rule 3 — authority symbol must be known', () => {
    const known = new Set([2034, 2937]);
    expect(checkAuthoritySymbol(2034, known)).toBeNull();
    expect(checkAuthoritySymbol(9999, known)?.reason).toBe('invalid_authority_symbol');
  });

  it('rule 4 — continuity opening=closing(prev) within 1%', () => {
    expect(checkContinuity(1000, 1005)).toBeNull(); // 0.5%
    expect(checkContinuity(1000, 1200)?.reason).toBe('continuity_break'); // 16.7%
  });

  it('rule 5 — >10x change flags an outlier', () => {
    expect(checkOutlier(1100, 1000)).toBeNull();
    expect(checkOutlier(15000, 1000)?.reason).toBe('outlier');
    expect(checkOutlier(50, 1000)?.reason).toBe('outlier');
  });

  it('rule 6 — Israeli registration check digit', () => {
    // 520018714 (מפעל הפיס, from SPEC) is a valid ח"פ.
    expect(checkRegistrationId('520018714')).toBeNull();
    expect(checkRegistrationId('123456789')?.reason).toBe('invalid_registration_id');
    expect(checkRegistrationId('12345')?.reason).toBe('invalid_registration_id');
  });

  it('rule 7 — cross-source >5% gap is material', () => {
    expect(checkCrossSource(1000, 1030)).toBeNull(); // 3%
    expect(checkCrossSource(1000, 1200)?.reason).toBe('cross_check_mismatch'); // ~16.7%
  });
});
