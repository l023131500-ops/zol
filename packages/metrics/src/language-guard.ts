/**
 * Language guard (SPEC part ו §א.5; enforced by Build task 27).
 *
 * Every user-facing string the system generates — alert statements, report
 * narration, agent answers — must be factual. This module enforces, IN CODE,
 * that no generated `statement_he` contains a forbidden (accusatory) word.
 * A violation throws; it is never merely logged.
 */

/** Accusatory words banned from any generated Hebrew text. */
export const FORBIDDEN_WORDS: readonly string[] = [
  'שחיתות',
  'חשד',
  'מושחת',
  'גניבה',
  'מעילה',
  'לא תקין',
  'פסול',
  'מפוקפק',
  'בעייתי',
  'מקפח',
  'מפלה',
  'מסתיר',
  'מעלים',
];

export class ForbiddenWordError extends Error {
  constructor(
    public readonly word: string,
    public readonly text: string,
  ) {
    super(`ניסוח מפליל אסור ("${word}") בטקסט: "${text}"`);
    this.name = 'ForbiddenWordError';
  }
}

/** Returns the first forbidden word found, or null if the text is clean. */
export function findForbiddenWord(text: string): string | null {
  for (const word of FORBIDDEN_WORDS) {
    if (text.includes(word)) return word;
  }
  return null;
}

export function isFactualStatement(text: string): boolean {
  return findForbiddenWord(text) === null;
}

/** Throws ForbiddenWordError if the statement contains banned wording. */
export function assertFactual(text: string): void {
  const word = findForbiddenWord(text);
  if (word) throw new ForbiddenWordError(word, text);
}
