/**
 * Cross-year schema-drift normalization (SPEC part ח, "מלכודת 1"; Build task 16).
 *
 * The data.gov.il audited-report datasets change shape between years in two
 * silent ways at once:
 *   1. the sheet field is named `גליון` (one yod) in 2024 but `גיליון` (two)
 *      in 2022;
 *   2. the LMS locality symbol and the internal MoI code SWAP columns between
 *      `קוד_למס` and `קוד_רשות`, and their types flip (numeric ⇄ text).
 *
 * A naive join on a fixed column across years produces WRONG rows with no
 * error. Per the guardrails, there is NO generic cross-year join — every year
 * passes through its explicit map. Unmapped years throw rather than guess.
 */

export interface RawReportRow {
  [field: string]: string | number | null | undefined;
}

export interface NormalizedRow {
  /** LMS locality symbol (סמל רשות) — the canonical cross-year authority key. */
  authoritySymbol: number;
  /** Internal MoI authority code (קוד רשות) — kept for provenance. */
  moiAuthorityCode: number | null;
  authorityName: string;
  sheet: string;
  reportYear: number;
  row: string;
  column: string;
  /** The stable cross-authority comparison key (`קוד`). */
  code: number | null;
  value: number | null;
}

interface YearMap {
  sheetField: string;
  /** Which raw column holds the LMS locality symbol for this year. */
  symbolField: string;
  /** Which raw column holds the internal MoI authority code for this year. */
  moiCodeField: string;
}

/**
 * Explicit per-year field map. Only years verified against the live endpoint
 * are listed; SPEC part ח verified 2024 and 2022. Add a year here only after
 * confirming its shape against the resource — never extrapolate silently.
 */
export const SCHEMA_DRIFT_MAP: Readonly<Record<number, YearMap>> = {
  2024: { sheetField: 'גליון', symbolField: 'קוד_למס', moiCodeField: 'קוד_רשות' },
  2022: { sheetField: 'גיליון', symbolField: 'קוד_רשות', moiCodeField: 'קוד_למס' },
};

export class UnmappedYearError extends Error {
  constructor(public readonly year: number) {
    super(
      `שנה ${year} אינה ממופה ב-SCHEMA_DRIFT_MAP. יש לאמת את מבנה ה-resource מול data.gov.il ולהוסיף מיפוי מפורש לפני טעינה.`,
    );
    this.name = 'UnmappedYearError';
  }
}

/** Parse a value that may arrive as "90472.0" (text) or 2937 (numeric). */
function toInt(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize one raw report row for a given year into the canonical shape,
 * routing through that year's explicit field map.
 */
export function normalizeReportRow(year: number, raw: RawReportRow): NormalizedRow {
  const map = SCHEMA_DRIFT_MAP[year];
  if (!map) throw new UnmappedYearError(year);

  const symbol = toInt(raw[map.symbolField]);
  if (symbol === null) {
    throw new Error(`שורה ללא סמל רשות תקין (שדה ${map.symbolField}, שנה ${year})`);
  }

  return {
    authoritySymbol: symbol,
    moiAuthorityCode: toInt(raw[map.moiCodeField]),
    authorityName: String(raw['שם_רשות'] ?? '').trim(),
    sheet: String(raw[map.sheetField] ?? '').trim(),
    reportYear: toInt(raw['שנת_דוח']) ?? year,
    row: String(raw['שורה'] ?? '').trim(),
    column: String(raw['עמודה'] ?? '').trim(),
    code: toInt(raw['קוד']),
    value: toNumber(raw['ערך']),
  };
}
