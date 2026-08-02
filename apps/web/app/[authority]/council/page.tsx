import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';

export const metadata: Metadata = { title: 'ישיבות מועצה', robots: { index: false } };

const STAGES = ['החלטה', 'סעיף תקציבי', 'חוזה', 'ביצוע'];

/** Council decision tracker (task 40): decision → budget line → contract → execution. */
export default function CouncilPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        מעקב החלטות: כל החלטת מועצה מקושרת לסעיף התקציבי, לחוזה ולביצוע בפועל — עם פרופיל הצבעות
        וחיפוש סמנטי בפרוטוקולים.
      </p>

      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="שלבי מעקב ההחלטה">
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="rounded-md border border-[var(--grey-200)] bg-[var(--white)] px-3 py-1.5 text-[var(--grey-700)]">
              {s}
            </span>
            {i < STAGES.length - 1 ? <span aria-hidden="true" className="text-[var(--grey-500)]">←</span> : null}
          </li>
        ))}
      </ol>

      <NoData
        what="החלטות המועצה"
        reason="ייטענו מפרוטוקולי המועצה בגל 4 (חילוץ מסמכים), עם מדד יישום החלטות וקישור לכל שלב."
      />
    </div>
  );
}
