import { describe, it, expect } from 'vitest';
import {
  lowExpensePerPupil,
  lowWelfarePerCapita,
  lowCollectionRate,
  currentDeficit,
  accumulatedDeficit,
  highAdminLoad,
  highDoubtfulDebt,
  missingPublication,
  vendorConcentration,
  serialExemption,
  suspectedSplitting,
  dormantTabar,
  collectionFloor,
  ALERT_RULE_KEYS,
  type AlertResult,
} from './alert-rules';
import { findForbiddenWord } from './language-guard';

/** Every rule that can fire, with inputs that trigger it. */
function allFiredAlerts(): AlertResult[] {
  return [
    lowExpensePerPupil(8400, 11200),
    lowWelfarePerCapita(900, 1500),
    lowCollectionRate(78, 2026),
    currentDeficit(80, 1000),
    accumulatedDeficit(200, 1000),
    highAdminLoad(400, 1000, 10),
    highDoubtfulDebt(700, 1000),
    missingPublication('תב"רים', '2022–2024'),
    vendorConcentration(55, 'תשתיות'),
    serialExemption(3),
    suspectedSplitting(4, 500000, 400000),
    dormantTabar(5, 500),
  ].filter((a): a is AlertResult => a !== null);
}

describe('alert-rules engine (task 27)', () => {
  it('covers all 12 rule keys', () => {
    expect(ALERT_RULE_KEYS).toHaveLength(12);
    const fired = new Set(allFiredAlerts().map((a) => a.ruleKey));
    for (const key of ALERT_RULE_KEYS) expect(fired.has(key)).toBe(true);
  });

  it('MANDATED: no generated statement_he contains a forbidden word', () => {
    for (const alert of allFiredAlerts()) {
      const bad = findForbiddenWord(alert.statementHe);
      expect(bad, `rule ${alert.ruleKey} → "${alert.statementHe}"`).toBeNull();
    }
  });

  it('collection floor follows Decision 3576 schedule', () => {
    expect(collectionFloor(2025)).toBe(83);
    expect(collectionFloor(2026)).toBe(84);
    expect(collectionFloor(2027)).toBe(85);
    expect(collectionFloor(2030)).toBe(85);
  });

  it('rules stay silent below their thresholds', () => {
    expect(lowExpensePerPupil(11000, 11200)).toBeNull(); // ~1.8% gap
    expect(lowCollectionRate(90, 2026)).toBeNull();
    expect(currentDeficit(40, 1000)).toBeNull(); // 4%
    expect(accumulatedDeficit(100, 1000)).toBeNull(); // 10%
    expect(highDoubtfulDebt(500, 1000)).toBeNull(); // 50%
    expect(serialExemption(2)).toBeNull();
    expect(dormantTabar(20, 500)).toBeNull(); // 20% executed
    expect(dormantTabar(5, 100)).toBeNull(); // only 100 days
  });

  it('accumulated deficit is high severity; collection notice', () => {
    expect(accumulatedDeficit(200, 1000)?.severity).toBe('high');
    expect(lowCollectionRate(78, 2026)?.severity).toBe('notice');
    expect(missingPublication('תקציב', '2023').severity).toBe('info');
  });
});
