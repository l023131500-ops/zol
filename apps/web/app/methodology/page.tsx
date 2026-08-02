import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-shell';
import { METRICS, ALERT_RULE_DOCS } from '@kesef/metrics';

export const metadata: Metadata = { title: 'מתודולוגיה' };

const SEVERITY_LABEL: Record<string, string> = {
  info: 'לידיעה',
  notice: 'נדרשת בדיקה',
  high: 'נדרשת בדיקה מעמיקה',
};

/**
 * Public methodology page (task 11). Flag-rule and formula definitions are
 * authored in Wave 3 (tasks 25–27), each rule writing its definition here.
 * For now the structure is in place with an explicit placeholder.
 */
const SECTIONS = [
  { id: 'principles', title: 'עקרונות היסוד' },
  { id: 'validation', title: 'כללי הוולידציה' },
  { id: 'metrics', title: 'הגדרות המדדים' },
  { id: 'alerts', title: 'הגדרות תמרורי האזהרה' },
];

export default function MethodologyPage() {
  return (
    <>
      <PageHeader
        title="מתודולוגיה"
        lead="כל הגדרה של כל דגל וכל חישוב, במלואן. סימון אזהרה הוא תוצאה של חישוב אריתמטי בלבד."
      />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <nav aria-label="תוכן העמוד" className="mb-8">
          <ul className="flex flex-wrap gap-2 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="rounded-md bg-[var(--blue-100)] px-3 py-1 text-[var(--blue-600)]">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section id="principles" className="scroll-mt-24">
          <h2 className="text-xl font-semibold text-[var(--navy-700)]">עקרונות היסוד</h2>
          <p className="mt-3 text-base leading-7 text-[var(--grey-700)]">
            אנחנו מאמתים שהמספר שאנחנו מציגים זהה למספר שבמקור, בעמוד המדויק — לא שהמספר נכון. כל
            דגל הוא מדידה, לא שיפוט. כל טענה מלווה במקור לחיץ. רשות מנויה יכולה להגיב על דגל, לא
            להסתיר אותו.
          </p>
        </section>

        <section id="validation" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold text-[var(--navy-700)]">כללי הוולידציה</h2>
          <ul className="mt-3 list-disc space-y-1 ps-6 text-base leading-7 text-[var(--grey-700)]">
            <li>סכימה אריתמטית: סכומי ביניים = סך הכול (סובלנות ₪1 לעיגול).</li>
            <li>טווח שנים: 2010 ≤ שנה ≤ שנה נוכחית + 1.</li>
            <li>רציפות: יתרת פתיחה שנה N = יתרת סגירה שנה N-1 (סטייה מעל 1% = דגל).</li>
            <li>חריגה: שינוי מעל פי 10 מהשנה הקודמת = דגל לאימות.</li>
            <li>הצלבה: obudget מול דוח מבוקר; פער מעל 5% = דגל הצלבה.</li>
          </ul>
        </section>

        <section id="metrics" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold text-[var(--navy-700)]">הגדרות המדדים</h2>
          <p className="mt-2 text-sm text-[var(--grey-500)]">
            כל מדד מוצג בממשק יחד עם הנוסחה המדויקת שלו.
          </p>
          <table className="mt-4 w-full border-collapse text-sm">
            <caption className="sr-only">נוסחאות המדדים</caption>
            <thead>
              <tr className="border-b border-[var(--grey-200)] text-start">
                <th scope="col" className="py-2 text-start">מדד</th>
                <th scope="col" className="py-2 text-start">נוסחה</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key} className="border-b border-[var(--grey-200)]">
                  <td className="py-2 font-medium text-[var(--grey-700)]">{m.labelHe}</td>
                  <td className="py-2 text-[var(--grey-500)]">{m.formula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="alerts" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold text-[var(--navy-700)]">הגדרות תמרורי האזהרה</h2>
          <p className="mt-2 text-sm text-[var(--grey-500)]">
            כל דגל הוא מדידה, לא שיפוט. להלן 12 הכללים, ההגדרה והסף של כל אחד.
          </p>
          <div className="mt-4 space-y-3">
            {ALERT_RULE_DOCS.map((rule) => (
              <div
                key={rule.key}
                id={rule.key}
                className="scroll-mt-24 rounded-lg border border-[var(--grey-200)] bg-[var(--white)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-[var(--navy-700)]">{rule.labelHe}</h3>
                  <span className="rounded-md bg-[var(--grey-50)] px-2 py-0.5 text-xs text-[var(--grey-500)]">
                    {SEVERITY_LABEL[rule.severity]}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--grey-700)]">{rule.definitionHe}</p>
                <p className="mt-1 text-sm text-[var(--grey-500)]">
                  <span className="font-medium">סף: </span>
                  {rule.thresholdHe}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
