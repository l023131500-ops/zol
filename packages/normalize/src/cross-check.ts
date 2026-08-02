/**
 * Cross-source verification engine (SPEC part ב §4, part ח; Build task 21).
 *
 * The product's headline: for each (authority, year, topic) compare what the
 * STATE reports transferring (obudget, value_a) against what the AUTHORITY
 * reports receiving (audited report, value_b). A material gap (>5%) is itself
 * a finding — nobody in Israel does this systematically.
 */

export interface CrossCheckInput {
  authoritySymbol: number;
  fiscalYear: number;
  topic: string;
  /** obudget — state transfers to the authority. */
  valueA: number;
  sourceA: string; // source_document id
  /** audited report — what the authority recorded receiving. */
  valueB: number;
  sourceB: string; // source_document id
}

export interface CrossCheckRow {
  authoritySymbol: number;
  fiscalYear: number;
  topic: string;
  valueA: number;
  sourceA: string;
  valueB: number;
  sourceB: string;
  delta: number;
  deltaPct: number;
  isMaterial: boolean;
}

export const MATERIAL_GAP_PCT = 5;

export function crossCheck(input: CrossCheckInput, materialPct = MATERIAL_GAP_PCT): CrossCheckRow {
  const delta = input.valueA - input.valueB;
  const base = Math.max(Math.abs(input.valueA), Math.abs(input.valueB));
  const deltaPct = base === 0 ? 0 : (Math.abs(delta) / base) * 100;
  return {
    authoritySymbol: input.authoritySymbol,
    fiscalYear: input.fiscalYear,
    topic: input.topic,
    valueA: input.valueA,
    sourceA: input.sourceA,
    valueB: input.valueB,
    sourceB: input.sourceB,
    delta,
    deltaPct,
    isMaterial: deltaPct > materialPct,
  };
}

export interface CrossCheckSummary {
  total: number;
  matched: number;
  material: number;
  rows: CrossCheckRow[];
}

/** Run the cross-check over many (authority, year, topic) triples. */
export function crossCheckAll(
  inputs: readonly CrossCheckInput[],
  materialPct = MATERIAL_GAP_PCT,
): CrossCheckSummary {
  const rows = inputs.map((i) => crossCheck(i, materialPct));
  const material = rows.filter((r) => r.isMaterial).length;
  return { total: rows.length, matched: rows.length - material, material, rows };
}
