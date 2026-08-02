/**
 * Alert-rules engine (SPEC part א §3.ו; Build task 27). Each rule is a
 * measurement, not a judgement: it emits a factual `statementHe` (which passes
 * the language guard) plus severity and evidence. Thresholds and definitions
 * are published to /methodology.
 */
import { formatShekelPlain, formatPct } from './format';
import { assertFactual } from './language-guard';

export type AlertSeverity = 'info' | 'notice' | 'high';

export interface AlertResult {
  ruleKey: string;
  severity: AlertSeverity;
  statementHe: string;
  measuredValue: number | null;
  referenceValue: number | null;
  deltaPct: number | null;
  methodologyAnchor: string;
}

/** Collection-rate floor per Government Decision 3576 (SPEC part ח / research). */
export function collectionFloor(year: number): number {
  if (year >= 2027) return 85;
  if (year === 2026) return 84;
  return 83; // 2025 and the transition baseline
}

function gapPct(measured: number, reference: number): number {
  if (reference === 0) return 0;
  return ((measured - reference) / reference) * 100;
}

function build(a: AlertResult): AlertResult {
  assertFactual(a.statementHe); // fail fast on any accusatory wording
  return a;
}

/* ------------------------------------------------------- expense-vs-median */

export function lowExpensePerPupil(perPupil: number, peerMedian: number): AlertResult | null {
  const gap = gapPct(perPupil, peerMedian);
  if (gap >= -20) return null;
  return build({
    ruleKey: 'low_expense_per_pupil',
    severity: 'notice',
    statementHe: `הוצאה לתלמיד: ${formatShekelPlain(perPupil)} · חציון קבוצת השווים: ${formatShekelPlain(peerMedian)} · פער: ${formatPct(Math.abs(gap))}`,
    measuredValue: perPupil,
    referenceValue: peerMedian,
    deltaPct: gap,
    methodologyAnchor: '#low_expense_per_pupil',
  });
}

export function lowWelfarePerCapita(perCapita: number, peerMedian: number): AlertResult | null {
  const gap = gapPct(perCapita, peerMedian);
  if (gap >= -20) return null;
  return build({
    ruleKey: 'low_welfare_per_capita',
    severity: 'notice',
    statementHe: `הוצאת רווחה לנפש: ${formatShekelPlain(perCapita)} · חציון קבוצת השווים: ${formatShekelPlain(peerMedian)} · פער: ${formatPct(Math.abs(gap))}`,
    measuredValue: perCapita,
    referenceValue: peerMedian,
    deltaPct: gap,
    methodologyAnchor: '#low_welfare_per_capita',
  });
}

/* ------------------------------------------------------------- collection */

export function lowCollectionRate(ratePct: number, year: number): AlertResult | null {
  const floor = collectionFloor(year);
  if (ratePct >= floor) return null;
  return build({
    ruleKey: 'low_collection_rate',
    severity: 'notice',
    statementHe: `שיעור גבייה: ${formatPct(ratePct)} · סף החלטת ממשלה 3576 לשנת ${year}: ${formatPct(floor)}`,
    measuredValue: ratePct,
    referenceValue: floor,
    deltaPct: ratePct - floor,
    methodologyAnchor: '#low_collection_rate',
  });
}

/* --------------------------------------------------------------- deficits */

export function currentDeficit(deficit: number, income: number): AlertResult | null {
  if (income <= 0) return null;
  const pct = (deficit / income) * 100;
  if (pct <= 5) return null;
  return build({
    ruleKey: 'current_deficit',
    severity: 'notice',
    statementHe: `גירעון שוטף: ${formatPct(pct)} מההכנסות (סף: 5%)`,
    measuredValue: pct,
    referenceValue: 5,
    deltaPct: pct - 5,
    methodologyAnchor: '#current_deficit',
  });
}

export function accumulatedDeficit(accumulated: number, regularIncome: number): AlertResult | null {
  if (regularIncome <= 0) return null;
  const pct = (accumulated / regularIncome) * 100;
  if (pct <= 17.5) return null;
  return build({
    ruleKey: 'accumulated_deficit',
    severity: 'high',
    statementHe: `גירעון מצטבר: ${formatPct(pct)} מההכנסות הרגילות (סף: 17.5%)`,
    measuredValue: pct,
    referenceValue: 17.5,
    deltaPct: pct - 17.5,
    methodologyAnchor: '#accumulated_deficit',
  });
}

/* ------------------------------------------------------ administration load */

export function highAdminLoad(adminExpense: number, totalExpense: number, peerMedianPct: number): AlertResult | null {
  if (totalExpense <= 0) return null;
  const pct = (adminExpense / totalExpense) * 100;
  const gap = gapPct(pct, peerMedianPct);
  if (gap <= 25) return null;
  return build({
    ruleKey: 'high_admin_load',
    severity: 'notice',
    statementHe: `נטל הנהלה כללית: ${formatPct(pct)} מסך ההוצאות · חציון קבוצת השווים: ${formatPct(peerMedianPct)} · פער: ${formatPct(gap)}`,
    measuredValue: pct,
    referenceValue: peerMedianPct,
    deltaPct: gap,
    methodologyAnchor: '#high_admin_load',
  });
}

/* ------------------------------------------------------------ doubtful debt */

export function highDoubtfulDebt(doubtful: number, totalDebtors: number): AlertResult | null {
  if (totalDebtors <= 0) return null;
  const pct = (doubtful / totalDebtors) * 100;
  if (pct <= 60) return null;
  return build({
    ruleKey: 'high_doubtful_debt',
    severity: 'notice',
    statementHe: `חוב מסופק (חומ"ס): ${formatPct(pct)} מסך החייבים (סף: 60%)`,
    measuredValue: pct,
    referenceValue: 60,
    deltaPct: pct - 60,
    methodologyAnchor: '#high_doubtful_debt',
  });
}

/* ------------------------------------------------------- non-publication */

export function missingPublication(what: string, years: string): AlertResult {
  return build({
    ruleKey: 'missing_publication',
    severity: 'info',
    statementHe: `לא נמצא פרסום של ${what} לשנים ${years}`,
    measuredValue: null,
    referenceValue: null,
    deltaPct: null,
    methodologyAnchor: '#missing_publication',
  });
}

/* --------------------------------------------------------- vendor patterns */

export function vendorConcentration(vendorShare: number, category: string): AlertResult | null {
  if (vendorShare <= 40) return null;
  return build({
    ruleKey: 'vendor_concentration',
    severity: 'notice',
    statementHe: `ספק בודד מרכז ${formatPct(vendorShare)} מההוצאה בקטגוריית ${category} (סף: 40%)`,
    measuredValue: vendorShare,
    referenceValue: 40,
    deltaPct: vendorShare - 40,
    methodologyAnchor: '#vendor_concentration',
  });
}

export function serialExemption(count: number, months = 12): AlertResult | null {
  if (count < 3) return null;
  return build({
    ruleKey: 'serial_exemption',
    severity: 'notice',
    statementHe: `${count} התקשרויות בפטור ממכרז עם אותו ספק ב-${months} חודשים`,
    measuredValue: count,
    referenceValue: 3,
    deltaPct: null,
    methodologyAnchor: '#serial_exemption',
  });
}

export function suspectedSplitting(subThresholdCount: number, aggregate: number, threshold: number): AlertResult | null {
  if (subThresholdCount < 2 || aggregate <= threshold) return null;
  return build({
    ruleKey: 'suspected_splitting',
    severity: 'notice',
    statementHe: `${subThresholdCount} התקשרויות מתחת לסף המכרז שמצטברות ל-${formatShekelPlain(aggregate)} (סף מכרז: ${formatShekelPlain(threshold)})`,
    measuredValue: aggregate,
    referenceValue: threshold,
    deltaPct: null,
    methodologyAnchor: '#suspected_splitting',
  });
}

/* -------------------------------------------------------------- dormant tabar */

export function dormantTabar(financialPct: number, daysSinceApproval: number): AlertResult | null {
  if (financialPct >= 10 || daysSinceApproval <= 365) return null;
  return build({
    ruleKey: 'dormant_tabar',
    severity: 'notice',
    statementHe: `תב"ר אושר לפני ${daysSinceApproval} יום, ביצוע כספי ${formatPct(financialPct)} (סף: ביצוע < 10% מעל 365 יום)`,
    measuredValue: financialPct,
    referenceValue: 10,
    deltaPct: null,
    methodologyAnchor: '#dormant_tabar',
  });
}

/** All rule keys, for /methodology generation and coverage tests. */
export const ALERT_RULE_KEYS = [
  'low_expense_per_pupil',
  'low_welfare_per_capita',
  'low_collection_rate',
  'current_deficit',
  'accumulated_deficit',
  'high_admin_load',
  'high_doubtful_debt',
  'missing_publication',
  'vendor_concentration',
  'serial_exemption',
  'suspected_splitting',
  'dormant_tabar',
] as const;
