import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'פורטל ניהול' };
const CARDS = [
  { title: 'תור אימות', body: 'שורות שנכשלו בוולידציה או בביטחון נמוך, ממתינות לאימות אנושי.' },
  { title: 'מקורות וסנכרונים', body: 'מצב כל מקור נתונים, תאריך הסנכרון האחרון, ושגיאות HTTP.' },
  { title: 'דגלים ותגובות', body: 'ניהול תמרורי האזהרה וזכות התגובה של הרשויות.' },
];
export default function AdminHome() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--navy-700)]">סקירת ניהול</h1>
      <p className="mt-2 text-[var(--grey-700)]">שלד הפורטל. המודולים מתמלאים בגלים 2–4.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <div key={c.title} className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-5">
            <h2 className="font-semibold text-[var(--navy-700)]">{c.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--grey-500)]">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
