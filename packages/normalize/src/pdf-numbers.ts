/**
 * RTL number-extraction guard (SPEC part ב §6; Build task 38).
 *
 * Numbers embedded in right-to-left PDF text can be reversed on extraction
 * (e.g. 1,234 → 4,321). The rule: validate every extracted number against the
 * line's subtotal. When the parts don't sum to the total but reversing exactly
 * one of them fixes it, that number is flagged as a likely reversal — marked
 * needs_review, never silently accepted.
 */

/** Reverse the decimal digits of an integer, preserving sign. 1234 → 4321. */
export function reverseDigits(n: number): number {
  const sign = n < 0 ? -1 : 1;
  const digits = Math.abs(Math.trunc(n)).toString().split('').reverse().join('');
  return sign * Number(digits);
}

export interface ExtractionCheck {
  ok: boolean;
  /** Index of the part that is a likely RTL reversal, if any. */
  reversalSuspect: number | null;
  suggested: number | null;
}

/**
 * Validate extracted line parts against a subtotal. If they already sum (within
 * tolerance) → ok. Otherwise, if reversing exactly one part makes the sum match,
 * flag that part as a reversal suspect with the suggested corrected value.
 */
export function validateExtraction(
  parts: number[],
  subtotal: number,
  tolerance = 1,
): ExtractionCheck {
  const sum = parts.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - subtotal) <= tolerance) {
    return { ok: true, reversalSuspect: null, suggested: null };
  }
  for (let i = 0; i < parts.length; i++) {
    const rev = reverseDigits(parts[i]!);
    if (rev === parts[i]) continue; // palindrome — reversing changes nothing
    const adjusted = sum - parts[i]! + rev;
    if (Math.abs(adjusted - subtotal) <= tolerance) {
      return { ok: false, reversalSuspect: i, suggested: rev };
    }
  }
  return { ok: false, reversalSuspect: null, suggested: null };
}

/** Confidence to store on the extracted fact, driving the review queue. */
export function extractionConfidence(check: ExtractionCheck): number {
  if (check.ok) return 0.99;
  if (check.reversalSuspect !== null) return 0.4; // fixable but unverified
  return 0.2; // unexplained mismatch
}
