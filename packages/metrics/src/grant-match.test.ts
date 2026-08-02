import { describe, it, expect } from 'vitest';
import { matchGrantCall, computeMissedMoney, type AuthorityProfile } from './grant-match';
import { buildGrantCallEmail, type GrantCallInfo } from './grant-email';
import { findForbiddenWord } from './language-guard';

const hatzor: AuthorityProfile = {
  symbol: 2034,
  socioEconomicCluster: 4,
  peripheralityCluster: 3,
  population: 11251,
  status: 'local_council',
};

describe('grant-call matching (task 39 upgrade)', () => {
  it('full match when every verified condition passes', () => {
    const m = matchGrantCall(
      { clusterRange: { min: 1, max: 5 }, peripheralityRange: { min: 1, max: 4 }, municipalStatus: ['local_council'] },
      hatzor,
    );
    expect(m.result).toBe('match');
    expect(m.conditions.every((c) => c.met === true)).toBe(true);
  });

  it('no_match when a verified condition fails', () => {
    const m = matchGrantCall({ clusterRange: { min: 6, max: 10 } }, hatzor);
    expect(m.result).toBe('no_match');
  });

  it('partial (not no_match) when a condition needs review', () => {
    const m = matchGrantCall({ clusterRange: { min: 1, max: 5 }, unresolved: ['דרישת ותק ראש רשות'] }, hatzor);
    expect(m.result).toBe('partial');
    expect(m.conditions.find((c) => c.status === 'needs_review')!.met).toBeNull();
  });

  it('an unknown profile value becomes needs_review, never a guess', () => {
    const m = matchGrantCall({ populationRange: { min: 5000 } }, { ...hatzor, population: null });
    expect(m.conditions[0]!.status).toBe('needs_review');
  });

  it('missed-money counts closed calls met-but-not-applied', () => {
    const missed = computeMissedMoney([
      { maxAmount: 100_000, metThreshold: true, applied: false },
      { maxAmount: 50_000, metThreshold: true, applied: true },
      { maxAmount: 30_000, metThreshold: false, applied: false },
    ]);
    expect(missed).toBe(100_000);
  });
});

describe('grant-call email (task 39 upgrade)', () => {
  const call: GrantCallInfo = {
    ministry: 'משרד החינוך',
    title: 'קול קורא לחדשנות',
    category: 'חינוך',
    maxAmount: 200_000,
    matchingPct: 20,
    closesAt: '2026-09-01',
    daysToClose: 30,
    sourceUrl: 'https://example.gov.il/kk/1',
    publishedAt: '2026-08-01',
    requiredDocs: ['אישור ניהול תקין'],
    leadRole: 'מנהל אגף חינוך',
    estimatedHours: 8,
  };

  it('produces a factual email that passes the language guard', () => {
    const email = buildGrantCallEmail(matchGrantCall({ clusterRange: { min: 1, max: 5 } }, hatzor), call, 'חצור הגלילית');
    expect(findForbiddenWord(email.bodyHe)).toBeNull();
    expect(findForbiddenWord(email.subject)).toBeNull();
    expect(email.subject).toContain('משרד החינוך');
    expect(email.bodyHe).toContain("מצ'ינג נדרש: 20%");
    expect(email.bodyHe).toContain('אינו מהווה ייעוץ');
  });

  it('states "לא ניתן היה לאמת" for unresolved conditions', () => {
    const email = buildGrantCallEmail(
      matchGrantCall({ clusterRange: { min: 1, max: 5 }, unresolved: ['ותק'] }, hatzor),
      call,
      'חצור הגלילית',
    );
    expect(email.bodyHe).toContain('לא ניתן היה לאמת מהפרסום');
  });
});
