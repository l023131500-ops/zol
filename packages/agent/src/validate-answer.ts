/**
 * Anti-hallucination guard (SPEC part ב §6; Build task 41).
 *
 * Enforced IN CODE, not in the prompt: every number in an answer must appear in
 * the retrieved fact context, and any answer containing numbers must cite a
 * source. A failing answer is thrown out and re-run — it never reaches the user.
 */

export class HallucinationError extends Error {
  constructor(public readonly value: number) {
    super(`מספר לא מעוגן בתשובה: ${value} — התשובה נדחית ומורצת מחדש`);
    this.name = 'HallucinationError';
  }
}

export class MissingCitationError extends Error {
  constructor() {
    super('התשובה מכילה מספרים אך ללא מקור — [source:...] חסר');
    this.name = 'MissingCitationError';
  }
}

export interface FactRow {
  value: number;
}

/** Extract numeric tokens from Hebrew answer text (handles 1,234 and 12.5). */
export function extractNumbers(answer: string): number[] {
  const matches = answer.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [];
  const out: number[] = [];
  for (const m of matches) {
    const n = Number(m.replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** A number is grounded if some context row matches within a rounding tolerance. */
export function matchesValue(row: FactRow, n: number, tolerance = 1): boolean {
  return Math.abs(row.value - n) <= tolerance;
}

export type ValidationResult = { ok: true; answer: string } | { ok: false; error: Error };

/**
 * Validate an answer against its fact context. Throws on the first ungrounded
 * number or on missing citations; callers catch and regenerate.
 */
export function validateAnswer(answer: string, context: FactRow[], tolerance = 1): string {
  // Strip citation tokens first — their ids may contain digits (e.g. doc-1).
  const prose = answer.replace(/\[source:[^\]]*\]/g, '');
  const numbers = extractNumbers(prose).filter((n) => !isYearLike(n));
  for (const n of numbers) {
    if (!context.some((row) => matchesValue(row, n, tolerance))) {
      throw new HallucinationError(n);
    }
  }
  if (numbers.length > 0 && !answer.includes('[source:')) {
    throw new MissingCitationError();
  }
  return answer;
}

/** Years (2010–2035) are contextual, not financial figures — don't require grounding. */
function isYearLike(n: number): boolean {
  return Number.isInteger(n) && n >= 2010 && n <= 2035;
}

export function safeValidateAnswer(answer: string, context: FactRow[], tolerance = 1): ValidationResult {
  try {
    return { ok: true, answer: validateAnswer(answer, context, tolerance) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Built-in refusal list: political questions, predictions, intent-reading.
 * Matches return a referral to the data instead of an answer.
 */
const REFUSAL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /מושחת|שחיתות|שחית/, reason: 'political' },
  { pattern: /למי (?:כדאי )?להצביע|למי להצביע/, reason: 'political' },
  { pattern: /יהיה בעתיד|יקרה בשנה הבאה|תחזית/, reason: 'prediction' },
  { pattern: /מה (?:הם )?חשב|מה התכוון|מה המניע/, reason: 'intent' },
];

export function shouldRefuse(question: string): { refuse: boolean; reason?: string } {
  for (const { pattern, reason } of REFUSAL_PATTERNS) {
    if (pattern.test(question)) return { refuse: true, reason };
  }
  return { refuse: false };
}
