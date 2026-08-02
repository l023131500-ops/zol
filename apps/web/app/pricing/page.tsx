import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-shell';

export const metadata: Metadata = { title: 'מחירים' };

const TIERS = [
  { audience: 'תושב', price: 'חינם לתמיד', note: 'כל התוכן הציבורי, ללא הרשמה. התושב הוא המנוע.' },
  { audience: 'פעיל חברתי', price: '29–49 ₪ / חודש', note: 'התראות מתקדמות, ייצוא מלא, דוחות ממותגים.' },
  { audience: 'חבר מועצה באופוזיציה', price: '250–500 ₪ / חודש', note: 'תיק ישיבה, מעקב החלטות, השוואות מתקדמות.' },
  { audience: 'עיתונאי', price: '1,500–15,000 ₪ / חודש', note: 'גישת API, התראות חריגה, גישה מוקדמת.' },
  { audience: 'עמותה מקומית', price: '99–199 ₪ / חודש', note: 'מתי נפתחים תבחיני תמיכות, איזה קול קורא רלוונטי.' },
  { audience: 'רשות מקומית', price: '18,000–120,000 ₪ / שנה', note: 'דשבורד פנימי, מנוע קולות קוראים, זכות תגובה.' },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader title="מחירים" lead="התושב הוא המשתמש, הגזבר הוא הלקוח. חינם לתושב — לתמיד." />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.audience} className="flex flex-col rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-6">
              <h2 className="text-lg font-semibold text-[var(--navy-700)]">{t.audience}</h2>
              <p className="mt-2 text-xl font-bold text-[var(--blue-600)]">{t.price}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--grey-500)]">{t.note}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
