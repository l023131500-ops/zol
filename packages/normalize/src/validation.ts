/**
 * The 7 validation rules (SPEC part ב §4; Build task 18). Every row that fails
 * is routed to review_queue with a reason — never silently dropped or written.
 */

export type ValidationReason =
  | 'arithmetic_mismatch'
  | 'year_out_of_range'
  | 'invalid_authority_symbol'
  | 'continuity_break'
  | 'outlier'
  | 'invalid_registration_id'
  | 'cross_check_mismatch';

export interface ValidationIssue {
  reason: ValidationReason;
  detail: string;
}

const NEXT_YEAR = () => new Date().getFullYear() + 1;

/** Rule 1: subtotals must equal the total (₪1 rounding tolerance). */
export function checkArithmetic(parts: number[], total: number, tolerance = 1): ValidationIssue | null {
  const sum = parts.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - total) > tolerance) {
    return { reason: 'arithmetic_mismatch', detail: `סכום ביניים ${sum} ≠ סך הכול ${total}` };
  }
  return null;
}

/** Rule 2: 2010 ≤ year ≤ current year + 1. */
export function checkYearRange(year: number, nextYear = NEXT_YEAR()): ValidationIssue | null {
  if (year < 2010 || year > nextYear) {
    return { reason: 'year_out_of_range', detail: `שנה ${year} מחוץ לטווח 2010–${nextYear}` };
  }
  return null;
}

/** Rule 3: authority symbol must exist in the known set. */
export function checkAuthoritySymbol(symbol: number, known: ReadonlySet<number>): ValidationIssue | null {
  if (!known.has(symbol)) {
    return { reason: 'invalid_authority_symbol', detail: `סמל רשות ${symbol} לא קיים בטבלת authority` };
  }
  return null;
}

/** Rule 4: opening balance year N == closing balance year N-1 (>1% deviation flags). */
export function checkContinuity(
  openingN: number,
  closingPrev: number,
  tolerancePct = 1,
): ValidationIssue | null {
  if (closingPrev === 0) return openingN === 0 ? null : { reason: 'continuity_break', detail: 'יתרת סגירה 0 מול פתיחה שונה מ-0' };
  const devPct = Math.abs((openingN - closingPrev) / closingPrev) * 100;
  if (devPct > tolerancePct) {
    return { reason: 'continuity_break', detail: `סטיית רציפות ${devPct.toFixed(2)}% > ${tolerancePct}%` };
  }
  return null;
}

/** Rule 5: >10x change vs previous year flags for review. */
export function checkOutlier(value: number, prevValue: number): ValidationIssue | null {
  if (prevValue === 0) return null;
  const ratio = Math.abs(value / prevValue);
  if (ratio > 10 || ratio < 0.1) {
    return { reason: 'outlier', detail: `שינוי פי ${ratio.toFixed(1)} מהשנה הקודמת` };
  }
  return null;
}

/**
 * Rule 6: valid Israeli company/association number (ח"פ / ע"ר) — 9 digits with
 * the standard check digit (same Luhn-like algorithm as ת"ז).
 */
export function checkRegistrationId(id: string): ValidationIssue | null {
  const digits = id.replace(/\D/g, '');
  if (digits.length !== 9) {
    return { reason: 'invalid_registration_id', detail: `מזהה ${id} אינו בן 9 ספרות` };
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(digits[i]) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  if (sum % 10 !== 0) {
    return { reason: 'invalid_registration_id', detail: `ספרת ביקורת שגויה עבור ${id}` };
  }
  return null;
}

/** Rule 7: obudget vs audited report — >5% gap is a material cross-check flag. */
export function checkCrossSource(valueA: number, valueB: number, tolerancePct = 5): ValidationIssue | null {
  const base = Math.max(Math.abs(valueA), Math.abs(valueB));
  if (base === 0) return null;
  const gapPct = (Math.abs(valueA - valueB) / base) * 100;
  if (gapPct > tolerancePct) {
    return { reason: 'cross_check_mismatch', detail: `פער הצלבה ${gapPct.toFixed(2)}% > ${tolerancePct}%` };
  }
  return null;
}
