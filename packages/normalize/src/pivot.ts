/**
 * MoI code mapping + EAV→fact pivot (SPEC part ח source 1, part יא'; Build task 17).
 *
 * The dataset is long/EAV: one row per cell. We pivot to fact_financial, but
 * ONLY rows whose (moi_code, year, sheet, row, column) map to a coa_code are
 * written — the volume rule (a ~500MB Supabase plan cannot hold 1M+ raw EAV
 * rows). Unmapped rows are counted (sync_run.rows_rejected), never stored.
 *
 * Point ד (SPEC part יא'): the "דוח תמיכות" and "ספר לבן" sheets already carry,
 * machine-readable, the authority's transfers to its economic company,
 * associations, community center and religious council — so those are mapped
 * here explicitly, NOT extracted from PDFs.
 */
import type { NormalizedRow } from './schema-drift';

export type Measure = 'budget' | 'actual' | 'prev_year' | 'pct_executed' | 'balance';

export interface MoiCodeMapEntry {
  moi_code: number;
  report_year: number;
  sheet_name: string;
  row_label: string;
  column_label: string;
  coa_code: number;
  measure: Measure;
}

/** Composite key matching the moi_code_map primary key. */
export function mapKey(k: {
  moi_code: number;
  report_year: number;
  sheet_name: string;
  row_label: string;
  column_label: string;
}): string {
  return [k.moi_code, k.report_year, k.sheet_name, k.row_label, k.column_label].join('|');
}

export type CodeMap = Map<string, { coa_code: number; measure: Measure }>;

export function buildCodeMap(entries: readonly MoiCodeMapEntry[]): CodeMap {
  const m: CodeMap = new Map();
  for (const e of entries) {
    m.set(mapKey(e), { coa_code: e.coa_code, measure: e.measure });
  }
  return m;
}

export interface FactRow {
  authority_symbol: number;
  fiscal_year: number;
  coa_code: number;
  moi_code: number | null;
  sheet_name: string;
  row_label: string;
  column_label: string;
  measure: Measure;
  value: number;
}

/** Pivot one normalized EAV row → a fact, or null if it isn't mapped/valid. */
export function pivotRow(row: NormalizedRow, map: CodeMap): FactRow | null {
  if (row.code == null || row.value == null) return null;
  const hit = map.get(
    mapKey({
      moi_code: row.code,
      report_year: row.reportYear,
      sheet_name: row.sheet,
      row_label: row.row,
      column_label: row.column,
    }),
  );
  if (!hit) return null;
  return {
    authority_symbol: row.authoritySymbol,
    fiscal_year: row.reportYear,
    coa_code: hit.coa_code,
    moi_code: row.code,
    sheet_name: row.sheet,
    row_label: row.row,
    column_label: row.column,
    measure: hit.measure,
    value: row.value,
  };
}

export interface PivotResult {
  facts: FactRow[];
  rejectedCount: number;
}

/** Pivot a batch, separating mapped facts from rejected (unmapped) rows. */
export function pivotBatch(rows: readonly NormalizedRow[], map: CodeMap): PivotResult {
  const facts: FactRow[] = [];
  let rejectedCount = 0;
  for (const row of rows) {
    const fact = pivotRow(row, map);
    if (fact) facts.push(fact);
    else rejectedCount += 1;
  }
  return { facts, rejectedCount };
}

/**
 * Verified seed mappings (SPEC-confirmed). `קוד=3167` returned exactly 260 rows
 * with labels "ספר לבן | משכורות ושכר | ביצוע שנה נוכחית". Extend from the
 * codebook during the live run; unmapped rows are simply rejected until then.
 */
export const MOI_CODE_MAP_SEED: readonly MoiCodeMapEntry[] = [
  {
    moi_code: 3167,
    report_year: 2024,
    sheet_name: 'ספר לבן',
    row_label: 'משכורות ושכר',
    column_label: 'ביצוע שנה נוכחית',
    coa_code: 6111,
    measure: 'actual',
  },
];
