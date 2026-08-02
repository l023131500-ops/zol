/**
 * Metrics engine (SPEC part א §3.ה; Build task 25). Every metric carries the
 * exact `formula` string that is displayed to the user, so no number is a
 * black box. Compute functions are pure and unit-tested.
 */

export interface MetricDefinition {
  key: string;
  labelHe: string;
  unit: 'ILS' | 'ILS_per_capita' | 'ILS_per_pupil' | 'pct';
  formula: string;
  /** null inputs (missing data) propagate to a null result — never a guess. */
  compute: (i: MetricInputs) => number | null;
}

export interface MetricInputs {
  population?: number | null;
  pupils?: number | null;
  selfIncome?: number | null;
  balancingGrant?: number | null;
  charged?: number | null;
  collected?: number | null;
  educationExpense?: number | null;
  welfareExpense?: number | null;
  adminExpense?: number | null;
  totalExpense?: number | null;
  regularIncome?: number | null;
  currentDeficit?: number | null;
  accumulatedDeficit?: number | null;
  debt?: number | null;
}

const ratio = (a?: number | null, b?: number | null): number | null =>
  a == null || b == null || b === 0 ? null : a / b;

const pct = (a?: number | null, b?: number | null): number | null => {
  const r = ratio(a, b);
  return r == null ? null : r * 100;
};

export const METRICS: readonly MetricDefinition[] = [
  {
    key: 'self_income_per_capita',
    labelHe: 'הכנסה עצמית לנפש',
    unit: 'ILS_per_capita',
    formula: 'הכנסה עצמית ÷ אוכלוסייה',
    compute: (i) => ratio(i.selfIncome, i.population),
  },
  {
    key: 'balancing_grant_per_capita',
    labelHe: 'מענק איזון לנפש',
    unit: 'ILS_per_capita',
    formula: 'מענק איזון ÷ אוכלוסייה',
    compute: (i) => ratio(i.balancingGrant, i.population),
  },
  {
    key: 'collection_rate',
    labelHe: 'שיעור גבייה',
    unit: 'pct',
    formula: '(ארנונה שנגבתה ÷ ארנונה שחויבה) × 100',
    compute: (i) => pct(i.collected, i.charged),
  },
  {
    key: 'expense_per_pupil',
    labelHe: 'הוצאה לתלמיד',
    unit: 'ILS_per_pupil',
    formula: 'הוצאת חינוך ÷ מספר תלמידים',
    compute: (i) => ratio(i.educationExpense, i.pupils),
  },
  {
    key: 'welfare_per_capita',
    labelHe: 'הוצאה לרווחה לנפש',
    unit: 'ILS_per_capita',
    formula: 'הוצאת רווחה ÷ אוכלוסייה',
    compute: (i) => ratio(i.welfareExpense, i.population),
  },
  {
    key: 'current_deficit_pct',
    labelHe: 'גירעון שוטף',
    unit: 'pct',
    formula: '(גירעון שוטף ÷ הכנסות) × 100',
    compute: (i) => pct(i.currentDeficit, i.regularIncome),
  },
  {
    key: 'accumulated_deficit_pct',
    labelHe: 'גירעון מצטבר',
    unit: 'pct',
    formula: '(גירעון מצטבר ÷ הכנסות רגילות) × 100',
    compute: (i) => pct(i.accumulatedDeficit, i.regularIncome),
  },
  {
    key: 'admin_load_pct',
    labelHe: 'נטל הנהלה כללית',
    unit: 'pct',
    formula: '(הוצאת הנהלה כללית ÷ סך ההוצאות) × 100',
    compute: (i) => pct(i.adminExpense, i.totalExpense),
  },
  {
    key: 'debt_burden_per_capita',
    labelHe: 'נטל חוב לנפש',
    unit: 'ILS_per_capita',
    formula: 'חוב ÷ אוכלוסייה',
    compute: (i) => ratio(i.debt, i.population),
  },
];

export function computeMetric(key: string, inputs: MetricInputs): number | null {
  const def = METRICS.find((m) => m.key === key);
  if (!def) throw new Error(`מדד לא ידוע: ${key}`);
  return def.compute(inputs);
}
