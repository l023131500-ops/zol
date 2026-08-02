import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';

export const metadata: Metadata = { title: 'לאן הולך הכסף', robots: { index: false } };

/** "לאן הולך הכסף" (task 30) — hierarchical treemap by chart of accounts. */
export default function SpendingPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        פירוק ההוצאה לפי ספר הקידודים (4 רמות), עם ניווט היררכי: תקציב ← הנהלה כללית ← הנהלה ←
        ראש הרשות וסגניו.
      </p>

      <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="מתגי תצוגה">
        {['תקציב רגיל / תב״ר / מאוחד', 'מאושר / מעודכן / ביצוע', 'כולל גופי סמך'].map((s) => (
          <span key={s} className="rounded-md border border-[var(--grey-200)] px-3 py-1.5 text-[var(--grey-500)]">
            {s}
          </span>
        ))}
      </div>

      <NoData
        what="מפת ההוצאה"
        reason="ה-Treemap ההיררכי, שלושת המתגים וה-drill-down ייטענו מנתוני fact_financial לאחר טעינת הדוחות. לכל צומת יוצג מקור לחיץ."
      />
    </div>
  );
}
