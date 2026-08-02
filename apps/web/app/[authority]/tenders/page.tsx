import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';

export const metadata: Metadata = { title: 'מכרזים', robots: { index: false } };

/**
 * Tenders (task 39; SPEC screen ח). Exemptions from tender are a MAIN screen,
 * not a footnote — roughly half of authority contracts are made without an open
 * tender (State Comptroller 2022). Schema: OCDS.
 */
export default function TendersPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        מכרזים פעילים, תוצאות, ומדד זמן להכרעה. סכימת OCDS. שכבת משכ״ל.
      </p>

      <section className="rounded-xl border-2 border-[var(--alert-notice)] bg-[#FBF3E0] p-5" aria-labelledby="exempt-heading">
        <h2 id="exempt-heading" className="text-lg font-semibold text-[var(--alert-notice)]">
          פטורים ממכרז — מסך ראשי
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--grey-700)]">
          לפי דוח מבקר המדינה (2022) כמחצית מההתקשרויות החדשות של רשויות נעשות בפטור ממכרז. זהו מסך
          מרכזי, לא הערת שוליים — עם זיהוי פטור סדרתי ופיצול אפשרי (בניסוח עובדתי בלבד).
        </p>
        <div className="mt-3">
          <NoData
            what="התקשרויות בפטור"
            reason="ייטענו מפרסומי ועדת ההתקשרויות של הרשות. כל דגל (פטור סדרתי, פיצול) מנוסח כמדידה, לא כשיפוט."
          />
        </div>
      </section>

      <NoData
        what="מכרזים פעילים ותוצאות"
        reason="ייטענו מאתר הרשות בסכימת OCDS, עם מדד זמן להכרעה וקישור לכל מסמך מקור."
      />
    </div>
  );
}
