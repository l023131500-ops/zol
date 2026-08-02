import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';

export const metadata: Metadata = { title: 'השוואה לקבוצת שווים', robots: { index: false } };

/** Peer comparison (task 31) — ranking table, small multiples, outliers. */
export default function ComparePage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        קבוצת השווים נבנית אוטומטית: אשכול חברתי-כלכלי ±1, פריפריאליות ±1, אוכלוסייה ±40%, ומעמד.
        המסך יסמן את שלושת המדדים שבהם הרשות חריגה ביותר מהחציון — לחיוב ולשלילה.
      </p>
      <NoData
        what="השוואה לקבוצת השווים"
        reason="טבלת הדירוג, ה-small multiples וזיהוי החריגות ייבנו לאחר חישוב המדדים וקבוצות השווים (מנוע @kesef/metrics)."
        action={{ label: 'הגדרות המדדים', href: '/methodology#metrics' }}
      />
    </div>
  );
}
