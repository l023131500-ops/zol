import { describe, it, expect } from 'vitest';
import {
  normalizeReportRow,
  SCHEMA_DRIFT_MAP,
  UnmappedYearError,
  type RawReportRow,
} from './schema-drift';

/**
 * The SPEC-mandated cross-year test (task 16). Abu Ghosh appears in 2024 and
 * 2022 with the LMS symbol / MoI code SWAPPED between columns. The normalizer
 * must resolve the SAME authority in both years, and a naive fixed-column join
 * must be shown to fail without the map.
 *
 * Row shapes below are the verified structures from SPEC part ח (test fixtures,
 * not displayed data).
 */

// Abu Ghosh — LMS symbol 2937, internal MoI code 90472.
const ABU_GHOSH_2024: RawReportRow = {
  שם_רשות: 'אבו גוש',
  שנת_דוח: 2024,
  גליון: 'נתונים לטופס 1',
  קוד_למס: 2937, // numeric — LMS symbol in 2024
  קוד_רשות: '90472.0', // text — MoI code in 2024
  שורה: 'יתרה לתחילת שנה',
  עמודה: 'שנה נוכחית',
  קוד: 1,
  ערך: 624,
};

const ABU_GHOSH_2022: RawReportRow = {
  שם_רשות: 'אבו גוש',
  שנת_דוח: 2022,
  גיליון: 'נתונים לטופס 1', // two-yod field name
  קוד_רשות: 2937, // numeric — LMS symbol lives here in 2022
  קוד_למס: '90472', // text — MoI code lives here in 2022
  שורה: 'יתרה לתחילת שנה',
  עמודה: 'שנה נוכחית',
  קוד: 1,
  ערך: 590,
};

describe('cross-year schema-drift normalization', () => {
  it('resolves the SAME authority symbol across both years', () => {
    const a = normalizeReportRow(2024, ABU_GHOSH_2024);
    const b = normalizeReportRow(2022, ABU_GHOSH_2022);
    expect(a.authoritySymbol).toBe(2937);
    expect(b.authoritySymbol).toBe(2937);
    expect(a.authoritySymbol).toBe(b.authoritySymbol);
  });

  it('reads the two-yod sheet field name in 2022 and one-yod in 2024', () => {
    expect(normalizeReportRow(2024, ABU_GHOSH_2024).sheet).toBe('נתונים לטופס 1');
    expect(normalizeReportRow(2022, ABU_GHOSH_2022).sheet).toBe('נתונים לטופס 1');
  });

  it('coerces the "90472.0" text MoI code to an integer', () => {
    expect(normalizeReportRow(2024, ABU_GHOSH_2024).moiAuthorityCode).toBe(90472);
  });

  it('NEGATIVE: a naive fixed-column join (always קוד_למס) mismatches the years', () => {
    const naive2024 = Number(ABU_GHOSH_2024['קוד_למס']); // 2937
    const naive2022 = Number(ABU_GHOSH_2022['קוד_למס']); // 90472
    expect(naive2024).not.toBe(naive2022); // proves the silent bug exists…

    // …and the map corrects it: both resolve to the same authority.
    expect(normalizeReportRow(2024, ABU_GHOSH_2024).authoritySymbol).toBe(
      normalizeReportRow(2022, ABU_GHOSH_2022).authoritySymbol,
    );
  });

  it('throws on an unmapped year rather than guessing', () => {
    expect(() => normalizeReportRow(2019, ABU_GHOSH_2024)).toThrow(UnmappedYearError);
  });

  it('only lists explicitly verified years in the map', () => {
    expect(Object.keys(SCHEMA_DRIFT_MAP).sort()).toEqual(['2022', '2024']);
  });
});
