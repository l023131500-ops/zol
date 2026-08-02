import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';
import { PageHeader } from '@/components/page-shell';

export const metadata: Metadata = { title: 'מתודולוגיה' };

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
          <div className="mt-3">
            <NoData
              what="נוסחאות המדדים"
              reason="כל מדד ייכתב כאן עם הנוסחה המלאה שלו במהלך גל 3 (משימות 25–26). כל נוסחה תוצג גם למשתמש בממשק."
            />
          </div>
        </section>

        <section id="alerts" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold text-[var(--navy-700)]">הגדרות תמרורי האזהרה</h2>
          <div className="mt-3">
            <NoData
              what="12 כללי הדגלים"
              reason="כל כלל דגל, עם הסף והמתודולוגיה המדויקת, ייכתב כאן במהלך גל 3 (משימה 27)."
            />
          </div>
        </section>
      </div>
    </>
  );
}
