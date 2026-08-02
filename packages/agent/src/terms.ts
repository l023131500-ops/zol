/**
 * Hebrew term normalization (SPEC part ב §6; Build task 41).
 *
 * Handles spelling variants, abbreviations with/without gershayim, and full/
 * defective spelling. Critically distinguishes תב"ר (budget) from תב"ע
 * (planning) — conflating them is a known, costly error.
 */

export interface TermEntry {
  canonical: string;
  variants: string[];
  plainHe: string;
  doNotConfuseWith?: string[];
}

export const TERMS: readonly TermEntry[] = [
  {
    canonical: 'תב"ר',
    variants: ['תבר', 'תב״ר', 'תב"ר', 'תקציב בלתי רגיל'],
    plainHe: 'תקציב ייעודי לפרויקט חד-פעמי, נפרד מהתקציב השוטף',
    doNotConfuseWith: ['תב"ע'],
  },
  {
    canonical: 'תב"ע',
    variants: ['תבע', 'תב״ע', 'תב"ע', 'תכנית בניין עיר'],
    plainHe: 'תכנית תכנון ובנייה — לא קשור לתקציב',
    doNotConfuseWith: ['תב"ר'],
  },
  {
    canonical: 'מענק איזון',
    variants: ['מענק האיזון', 'גדיש', 'נוסחת גדיש'],
    plainHe: 'העברה ממשלתית לא-ייעודית המחושבת לפי נוסחת גדיש',
  },
  {
    canonical: 'חומ"ס',
    variants: ['חומס', 'חומ״ס', 'חוב מסופק'],
    plainHe: 'חוב שסביר שלא ייגבה',
  },
];

const stripGershayim = (s: string) => s.replace(/["״׳']/g, '').trim();

/** Normalize a raw term to its canonical form, or null if unrecognized. */
export function normalizeTerm(raw: string): string | null {
  const target = stripGershayim(raw);
  for (const entry of TERMS) {
    if (stripGershayim(entry.canonical) === target) return entry.canonical;
    if (entry.variants.some((v) => stripGershayim(v) === target)) return entry.canonical;
  }
  return null;
}

/** True when two raw terms are ones the system must never conflate. */
export function mustNotConfuse(a: string, b: string): boolean {
  const ca = normalizeTerm(a);
  const cb = normalizeTerm(b);
  if (!ca || !cb) return false;
  const entry = TERMS.find((t) => t.canonical === ca);
  return Boolean(entry?.doNotConfuseWith?.includes(cb));
}
