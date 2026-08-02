/**
 * Public methodology text for every alert rule (SPEC part ו §ד.3: each flag
 * must have a public definition on /methodology). Rendered by the web app.
 */
import type { AlertSeverity } from './alert-rules';

export interface AlertRuleDoc {
  key: string;
  labelHe: string;
  definitionHe: string;
  thresholdHe: string;
  severity: AlertSeverity;
}

export const ALERT_RULE_DOCS: readonly AlertRuleDoc[] = [
  {
    key: 'low_expense_per_pupil',
    labelHe: 'הוצאה נמוכה לתלמיד',
    definitionHe: 'הוצאת חינוך לחלק במספר התלמידים, בהשוואה לחציון קבוצת השווים.',
    thresholdHe: 'פער מעל 20% מתחת לחציון',
    severity: 'notice',
  },
  {
    key: 'low_welfare_per_capita',
    labelHe: 'הוצאה נמוכה לרווחה',
    definitionHe: 'הוצאת רווחה לנפש בהשוואה לחציון קבוצת השווים.',
    thresholdHe: 'פער מעל 20% מתחת לחציון',
    severity: 'notice',
  },
  {
    key: 'low_collection_rate',
    labelHe: 'שיעור גבייה נמוך',
    definitionHe: 'שיעור גביית הארנונה מול סף הגבייה שנקבע בהחלטת ממשלה 3576.',
    thresholdHe: 'מתחת ל-83% (2025), 84% (2026), 85% (2027 ואילך)',
    severity: 'notice',
  },
  {
    key: 'current_deficit',
    labelHe: 'גירעון שוטף',
    definitionHe: 'גירעון שוטף כשיעור מההכנסות.',
    thresholdHe: 'מעל 5%',
    severity: 'notice',
  },
  {
    key: 'accumulated_deficit',
    labelHe: 'גירעון מצטבר',
    definitionHe: 'גירעון מצטבר כשיעור מההכנסות הרגילות.',
    thresholdHe: 'מעל 17.5%',
    severity: 'high',
  },
  {
    key: 'high_admin_load',
    labelHe: 'נטל הנהלה כללית',
    definitionHe: 'הוצאות הנהלה כללית כשיעור מסך ההוצאות, מול חציון קבוצת השווים.',
    thresholdHe: 'פער מעל 25% מהחציון',
    severity: 'notice',
  },
  {
    key: 'high_doubtful_debt',
    labelHe: 'חוב מסופק גבוה',
    definitionHe: 'חוב מסופק (חומ"ס) כשיעור מסך החייבים.',
    thresholdHe: 'מעל 60%',
    severity: 'notice',
  },
  {
    key: 'missing_publication',
    labelHe: 'היעדר פרסום',
    definitionHe: 'לא נמצא פרסום של תקציב, תב"ר או דוח כספי מבוקר. היעדר פרסום הוא ממצא.',
    thresholdHe: 'קיים / לא קיים',
    severity: 'info',
  },
  {
    key: 'vendor_concentration',
    labelHe: 'ריכוזיות ספק',
    definitionHe: 'שיעור ההוצאה בקטגוריה שמרוכז אצל ספק בודד.',
    thresholdHe: 'מעל 40% מההוצאה בקטגוריה',
    severity: 'notice',
  },
  {
    key: 'serial_exemption',
    labelHe: 'פטור סדרתי',
    definitionHe: 'מספר התקשרויות בפטור ממכרז עם אותו ספק בתוך 12 חודשים.',
    thresholdHe: '3 התקשרויות או יותר',
    severity: 'notice',
  },
  {
    key: 'suspected_splitting',
    labelHe: 'פיצול אפשרי',
    definitionHe: 'סדרת התקשרויות מתחת לסף המכרז שסכומן המצטבר עולה על הסף.',
    thresholdHe: 'היוריסטיקה — סכום מצטבר מעל סף המכרז',
    severity: 'notice',
  },
  {
    key: 'dormant_tabar',
    labelHe: 'תב"ר רדום',
    definitionHe: 'תב"ר שאושר, ביצועו הכספי נמוך, וחלף זמן רב מאישורו.',
    thresholdHe: 'ביצוע מתחת ל-10% מעל 365 יום',
    severity: 'notice',
  },
];
