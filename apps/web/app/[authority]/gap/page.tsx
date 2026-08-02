import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';

export const metadata: Metadata = { title: 'מה מגיע לנו ולא קיבלנו', robots: { index: false } };

const CAUSES = [
  { title: 'מבנה', body: 'כך בנויות הנוסחאות — לא החלטה של אף אחד ברשות.', color: 'var(--cat-education)' },
  { title: 'החלטה של גורם חיצוני', body: 'למשל אי-הכללה במפת שיקום, החלטת משרד ממשלתי.', color: 'var(--cat-welfare)' },
  { title: 'יכולת ביצוע של הרשות', body: 'לא הוגש, לא נגבה, לא בוצע.', color: 'var(--cat-infrastructure)' },
];

/** "מה מגיע לנו ולא קיבלנו" (task 35) — the emotional core, blame-free. */
export default function GapPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        הפער בין מה שמגיע לפי נוסחה או זכאות לבין מה שהגיע בפועל — בפירוק לשלוש קטגוריות סיבה,
        בניסוח נטול האשמה. שלוש הקטגוריות מוצגות באותה חומרה.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {CAUSES.map((c) => (
          <div key={c.title} className="rounded-lg border border-[var(--grey-200)] bg-[var(--white)] p-4">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
              <h2 className="text-sm font-semibold text-[var(--navy-700)]">{c.title}</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--grey-500)]">{c.body}</p>
          </div>
        ))}
      </div>

      <NoData
        what="מונה הפער"
        reason="טבלת הפערים ומונה הפער יחושבו ממנוע המדדים והזכאויות לאחר טעינת הנתונים. כל שורה תציג מה מגיע, מה התקבל, והפער — עם מקור."
      />
    </div>
  );
}
