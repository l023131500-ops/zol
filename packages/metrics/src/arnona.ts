/**
 * Arnona (municipal property tax) calculator (SPEC part א §3.י; Build task 34).
 *
 * Arnona = area (m²) × tariff for the use classification, minus eligible
 * discounts. Tariffs come from each authority's צו ארנונה (a published document);
 * until that is loaded, the UI marks results as `estimated`. The engine itself
 * is pure and unit-tested.
 */

export type UseClass =
  | 'residential'
  | 'commercial'
  | 'industry'
  | 'office'
  | 'workshop'
  | 'occupied_land';

export interface DiscountPct {
  label: string;
  pct: number; // 0..100
}

export interface ArnonaInput {
  areaSqm: number;
  tariffPerSqm: number; // agorot/₪ per m² for the use class, from the צו
  discounts?: DiscountPct[];
}

export interface ArnonaResult {
  gross: number;
  discountTotal: number;
  net: number;
  effectiveDiscountPct: number;
  lines: { label: string; amount: number }[];
}

/** Compute annual arnona. Discounts are applied on the gross, capped at 100%. */
export function computeArnona(input: ArnonaInput): ArnonaResult {
  const area = Math.max(0, input.areaSqm);
  const tariff = Math.max(0, input.tariffPerSqm);
  const gross = area * tariff;

  const discounts = input.discounts ?? [];
  const totalPct = Math.min(
    100,
    discounts.reduce((sum, d) => sum + Math.max(0, d.pct), 0),
  );
  const discountTotal = (gross * totalPct) / 100;
  const net = gross - discountTotal;

  const lines = [
    { label: 'חיוב ברוטו (שטח × תעריף)', amount: gross },
    ...discounts.map((d) => ({ label: `הנחה: ${d.label}`, amount: -(gross * Math.max(0, d.pct)) / 100 })),
    { label: 'חיוב נטו', amount: net },
  ];

  return { gross, discountTotal, net, effectiveDiscountPct: totalPct, lines };
}

/**
 * "המס שלי לאן הלך" — split a paid amount across spending topics by their share
 * of total expenditure. Shares must be a topic→fraction map summing to ~1.
 */
export function splitTaxByTopic(
  amountPaid: number,
  topicShares: Record<string, number>,
): { topic: string; amount: number }[] {
  return Object.entries(topicShares).map(([topic, share]) => ({
    topic,
    amount: amountPaid * share,
  }));
}
