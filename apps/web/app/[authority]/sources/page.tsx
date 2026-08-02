import type { Metadata } from 'next';
import { NoData, Term } from '@kesef/ui';

export const metadata: Metadata = { title: 'מאין מגיע הכסף', robots: { index: false } };

/** "מאין מגיע הכסף" (task 29) — Sankey RTL, 3 levels, balancing-grant formula. */
export default function SourcesPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        זרימת ההכנסות מימין לשמאל: הכנסות עצמיות (
        <Term
          id="arnona"
          definition="ארנונה — מס שהרשות גובה על נכסים לפי שטח וסיווג שימוש, לא לפי שווי שוק."
          whyItMatters="זהו מקור ההכנסה העצמי הגדול ביותר של רוב הרשויות."
        >
          ארנונה
        </Term>
        , אגרות, היטלים),{' '}
        <Term
          id="balancing_grant"
          definition="מענק איזון — העברה ממשלתית לא-ייעודית שנועדה לגשר בין צורכי ההוצאה ליכולת הגבייה."
          whyItMatters="מחושב לפי נוסחת גדיש; משפיע ישירות על מה שהרשות יכולה לספק."
        >
          מענק איזון
        </Term>
        , השתתפות משרדי ממשלה, מלוות, מפעל הפיס ותרומות.
      </p>

      <NoData
        what="תרשים מקורות ההכנסה"
        reason="ה-Sankey ופירוק נוסחת גדיש יוצגו לאחר טעינת הדוח הכספי המבוקר ונתוני מפתח התקציב. כל זרם יהיה לחיץ אל מקורו."
        action={{ label: 'סף הגבייה של החלטה 3576', href: '/methodology#low_collection_rate' }}
      />

      <details className="rounded-lg border border-[var(--grey-200)] bg-[var(--white)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--navy-700)]">
          טבלת נתונים חלופית (נגישה)
        </summary>
        <p className="mt-2 text-sm text-[var(--grey-500)]">
          לכל תרשים תיווסף כאן טבלה נגישה לקורא מסך, עם אותם ערכים בדיוק.
        </p>
      </details>
    </div>
  );
}
