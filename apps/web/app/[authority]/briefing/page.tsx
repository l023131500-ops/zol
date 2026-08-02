import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';
import { BriefingActions } from '@/components/briefing-actions';
import { getAuthority, slugToSymbol } from '@/lib/data/authority';

export const metadata: Metadata = { title: 'תיק לפגישה עם ראש הרשות', robots: { index: false } };

const SECTIONS: { n: number; title: string; note: string }[] = [
  { n: 1, title: 'מה מגיע לרשות ולא הגיע', note: 'קולות קוראים שהוחמצו, זכאות שלא מומשה, ותוכניות שהרשות הוצאה מהן. כאן התושב והרשות באותו צד.' },
  { n: 2, title: 'חמישה מדדים מול חציון קבוצת השווים', note: 'הוצאה לתלמיד · הוצאה לרווחה לנפש · שיעור גבייה · נטל הנהלה כללית · הכנסה עצמית לנפש.' },
  { n: 3, title: 'שיעור הגבייה מול סף החלטה 3576', note: 'כולל ההשלכה הכספית המחושבת על מענק האיזון.' },
  { n: 4, title: 'הצלבה מול מפתח התקציב', note: 'כמה המדינה דיווחה שהעבירה מול כמה נרשם שהתקבל.' },
  { n: 5, title: 'העברות לגופי סמך', note: 'עם ציון מפורש אילו מהם אינם מפרסמים דוחות כספיים.' },
  { n: 6, title: 'מה לא פורסם', note: 'תקציב, תב"רים, פרוטוקולי ועדת תמיכות, פרוטוקולי מועצה — מול האחוז הארצי.' },
  { n: 7, title: 'עשר שאלות לפגישה', note: 'נוצרות אוטומטית מהממצאים, כל אחת כשאלה פתוחה עם מקור ועמוד.' },
];

export default async function BriefingPage({ params }: { params: Promise<{ authority: string }> }) {
  const { authority } = await params;
  const summary = await getAuthority(authority);
  const symbol = slugToSymbol(authority);
  const name = summary?.name_he ?? (authority === 'hatzor-haglilit' ? 'חצור הגלילית' : authority);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--navy-700)]">תיק לפגישה עם ראש הרשות</h2>
          <p className="mt-1 text-sm text-[var(--grey-500)]">
            דוח בן 2–3 עמודים. כל שורה עובדה עם מקור, מנוסחת כשאלה ולא כהאשמה.
          </p>
        </div>
        <BriefingActions authorityName={name} headlines={[]} />
      </div>

      <div className="rounded-lg border-s-4 border-[var(--blue-400)] bg-[var(--blue-100)] p-3 text-sm leading-6 text-[var(--grey-700)] print:hidden">
        נתוני האמת של רשות זו (סמל <bdi>{symbol ?? '—'}</bdi>) נטענים בגל 2. מבנה התיק מוכן; כל
        מספר יופיע עם קישור למקור, וכל סעיף ללא נתון מוצג כ"אין נתון".
      </div>

      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <section key={s.n} className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-5">
            <h3 className="text-lg font-semibold text-[var(--navy-700)]">
              {s.n}. {s.title}
            </h3>
            <p className="mt-1 text-sm text-[var(--grey-500)]">{s.note}</p>
            <div className="mt-3">
              <NoData what={s.title} reason="ימולא מנתוני האמת לאחר טעינת הדוחות, המדדים ומנוע הדגלים." />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
