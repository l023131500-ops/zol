import { describe, it, expect } from 'vitest';
import { buildCodeMap, pivotRow, pivotBatch, mapKey, MOI_CODE_MAP_SEED } from './pivot';
import type { NormalizedRow } from './schema-drift';

function row(partial: Partial<NormalizedRow>): NormalizedRow {
  return {
    authoritySymbol: 2034,
    moiAuthorityCode: 90472,
    authorityName: 'חצור הגלילית',
    sheet: 'ספר לבן',
    reportYear: 2024,
    row: 'משכורות ושכר',
    column: 'ביצוע שנה נוכחית',
    code: 3167,
    value: 1234567,
    ...partial,
  };
}

describe('MoI code mapping + pivot (task 17)', () => {
  const map = buildCodeMap(MOI_CODE_MAP_SEED);

  it('maps the verified 3167 white-book salaries cell to a fact', () => {
    const fact = pivotRow(row({}), map);
    expect(fact).not.toBeNull();
    expect(fact!.coa_code).toBe(6111);
    expect(fact!.measure).toBe('actual');
    expect(fact!.authority_symbol).toBe(2034);
    expect(fact!.value).toBe(1234567);
  });

  it('drops (does not store) an unmapped row', () => {
    expect(pivotRow(row({ code: 9999 }), map)).toBeNull();
  });

  it('drops a row with a null value', () => {
    expect(pivotRow(row({ value: null }), map)).toBeNull();
  });

  it('pivotBatch separates facts from rejected and counts rejects', () => {
    const res = pivotBatch(
      [row({}), row({ code: 9999 }), row({ code: 8888 }), row({})],
      map,
    );
    expect(res.facts).toHaveLength(2);
    expect(res.rejectedCount).toBe(2); // volume rule: unmapped are rejected
  });

  it('mapKey is stable and composite', () => {
    expect(
      mapKey({ moi_code: 1, report_year: 2024, sheet_name: 's', row_label: 'r', column_label: 'c' }),
    ).toBe('1|2024|s|r|c');
  });
});
