import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';
export const metadata: Metadata = { title: 'תמיכות', robots: { index: false } };
/** Supports screen (task 39): to whom, how much, by which criterion, protocol published? */
export default function SupportsPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        למי ניתנה תמיכה, כמה, לפי איזה תבחין, והאם פורסם פרוטוקול ועדת התמיכות. הצלבה לגיידסטאר.
      </p>
      <NoData what="תמיכות ותבחינים" reason="ייטענו מפרסומי הרשות, עם הצלבה לרשם העמותות (גיידסטאר) וסימון אם פורסם פרוטוקול." />
    </div>
  );
}
