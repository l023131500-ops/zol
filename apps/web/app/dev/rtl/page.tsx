import type { Metadata } from 'next';
import { Bdi } from '@kesef/ui';

export const metadata: Metadata = { title: 'RTL — עמוד בדיקה', robots: { index: false } };

/** Task 2 acceptance page: numbers inside Hebrew prose must not reorder. */
export default function RtlDevPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
      <h1 className="text-3xl font-bold">בדיקת RTL וטיפוגרפיה עברית</h1>
      <h2 className="mt-6 text-2xl font-semibold">כותרת משנה</h2>
      <h3 className="mt-4 text-xl font-semibold">כותרת כרטיס</h3>

      <p className="mt-4 text-base leading-7">
        ההוצאה לתלמיד עמדה על <Bdi>8,400 ₪</Bdi> (חציון קבוצת השווים: <Bdi>11,200 ₪</Bdi>), כלומר פער
        של <Bdi>25%</Bdi>. בשנת <Bdi>2024</Bdi> עברו דרך הרשות כ-<Bdi>142,500,000 ₪</Bdi>.
      </p>

      <p className="mt-2 text-base leading-7">
        מספר טלפון לדוגמה בתוך משפט: <Bdi>03-1234567</Bdi>, וטווח שנים <Bdi>2014–2024</Bdi>.
      </p>

      <nav aria-label="נתיב ניווט" className="mt-6 text-sm text-[var(--grey-500)]">
        <ol className="flex flex-wrap items-center gap-1">
          <li>תקציב 2024</li>
          <li aria-hidden="true">←</li>
          <li>הנהלה כללית</li>
          <li aria-hidden="true">←</li>
          <li>מינהל ומועצה</li>
          <li aria-hidden="true">←</li>
          <li className="font-semibold text-[var(--grey-700)]">ראש הרשות וסגניו</li>
        </ol>
      </nav>

      <table className="mt-6 w-full border-collapse text-sm">
        <caption className="mb-2 text-start text-[var(--grey-500)]">טבלת דוגמה עם מספרים</caption>
        <thead>
          <tr className="border-b border-[var(--grey-200)]">
            <th scope="col" className="py-2 text-start">סעיף</th>
            <th scope="col" className="py-2 text-start">מאושר</th>
            <th scope="col" className="py-2 text-start">ביצוע</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--grey-200)]">
            <td className="py-2">חינוך</td>
            <td className="py-2 tabular-nums">12,300,000</td>
            <td className="py-2 tabular-nums">11,845,200</td>
          </tr>
          <tr>
            <td className="py-2">רווחה</td>
            <td className="py-2 tabular-nums">8,200,000</td>
            <td className="py-2 tabular-nums">8,410,900</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
