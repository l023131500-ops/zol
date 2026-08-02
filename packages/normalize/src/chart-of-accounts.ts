/**
 * Chart-of-accounts seed (SPEC part ח, source 2; Build task 15).
 *
 * Only codes explicitly verified in the SPEC are seeded here — no invented
 * Hebrew names (guardrail). The full 4-level codebook load is pending a
 * structured source (see PENDING_LIVE_RUN.md); the PDF host is network-blocked.
 *
 * Structure rule from the codebook: receipts 1–5, payments 6–9.
 */

export type Flow = 'receipt' | 'payment';

export interface CoaSeedRow {
  code: number;
  level: number;
  parent_code: number | null;
  name_he: string;
  plain_he: string | null;
  flow: Flow;
  topic: string | null;
  is_leaf: boolean;
}

export const CHART_OF_ACCOUNTS_SEED: readonly CoaSeedRow[] = [
  // Receipts branch — property tax (ארנונה)
  { code: 1, level: 1, parent_code: null, name_he: 'מסים ואגרות כלליות', plain_he: 'מסים ואגרות שהרשות גובה מהתושבים', flow: 'receipt', topic: null, is_leaf: false },
  { code: 11, level: 2, parent_code: 1, name_he: 'ארנונה', plain_he: 'הארנונה שאתה משלם לרשות', flow: 'receipt', topic: null, is_leaf: false },
  { code: 111, level: 3, parent_code: 11, name_he: 'ארנונה כללית', plain_he: null, flow: 'receipt', topic: null, is_leaf: false },
  { code: 1111, level: 4, parent_code: 111, name_he: 'ארנונה כללית מגורים — גבייה שוטפת', plain_he: 'ארנונה על דירות מגורים שנגבתה השנה', flow: 'receipt', topic: null, is_leaf: true },

  // Payments branch — general administration (הנהלה כללית)
  { code: 6, level: 1, parent_code: null, name_he: 'הנהלה כללית', plain_he: 'הוצאות הניהול הכלליות של הרשות', flow: 'payment', topic: 'administration', is_leaf: false },
  { code: 61, level: 2, parent_code: 6, name_he: 'הנהלה', plain_he: null, flow: 'payment', topic: 'administration', is_leaf: false },
  { code: 611, level: 3, parent_code: 61, name_he: 'מינהל ומועצה', plain_he: null, flow: 'payment', topic: 'administration', is_leaf: false },
  { code: 6111, level: 4, parent_code: 611, name_he: 'ראש הרשות וסגניו', plain_he: 'שכר והוצאות של ראש הרשות וסגניו', flow: 'payment', topic: 'administration', is_leaf: true },
];

/** Flow implied by a top-level digit (receipts 1–5, payments 6–9). */
export function flowForCode(code: number): Flow {
  const top = Number(String(code)[0]);
  return top >= 1 && top <= 5 ? 'receipt' : 'payment';
}

/** The parent chain of a code, from itself up to its level-1 root. */
export function parentChain(code: number, rows: readonly CoaSeedRow[]): CoaSeedRow[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const chain: CoaSeedRow[] = [];
  let cur: number | null = code;
  const seen = new Set<number>();
  while (cur != null && byCode.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const row = byCode.get(cur)!;
    chain.push(row);
    cur = row.parent_code;
  }
  return chain;
}
