import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';
import { HouseholdProfile } from '@/components/household-profile';
import { getAuthority, slugToSymbol } from '@/lib/data/authority';

export const metadata: Metadata = { title: 'הכסף שלי', robots: { index: false } };

/**
 * "הכסף שלי" — the personalized card (task 28). Not a dashboard.
 * Real numbers arrive with the Wave-2 data load; until then each section shows
 * <NoData> at equal visual weight — never invented figures.
 */
export default async function MyMoneyPage({
  params,
}: {
  params: Promise<{ authority: string }>;
}) {
  const { authority } = await params;
  const summary = await getAuthority(authority);
  const symbol = slugToSymbol(authority);
  const hasData = summary != null;

  return (
    <div className="space-y-6">
      <HouseholdProfile />

      {!hasData ? (
        <div className="rounded-lg border-s-4 border-[var(--blue-400)] bg-[var(--blue-100)] p-3 text-sm leading-6 text-[var(--grey-700)]">
          נתוני האמת של רשות זו (סמל <bdi>{symbol ?? '—'}</bdi>) נטענים בגל 2. עד אז המסך מציג את
          המבנה, ללא מספרים מומצאים.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <NoData
          what="התקציב שלך"
          reason="לאן הלך כל שקל מהארנונה שלך — טבעת חלוקה תוצג לאחר טעינת הדוח הכספי המבוקר."
        />
        <NoData
          what="הילד שלך"
          reason="כמה מגיע לתלמיד מהמדינה ומהרשות, מול קבוצת ההשוואה — יחושב במנוע המדדים."
        />
        <NoData
          what="אולי מגיע לך ולא ביקשת"
          reason="זכויות מדורגות לפי שווי כספי — ייטענו משכבת הזכויות."
          action={{ label: 'מדריך הזכויות', href: '/methodology' }}
        />
        <NoData
          what="מה נתקע"
          reason="תב״ר שאושר ולא בוצע, קול קורא שלא הוגש, זכות שלא מומשה — מנוע הפערים."
          action={{ label: 'למסך הפערים', href: `/${authority}/gap` }}
        />
      </div>

      <p className="text-sm text-[var(--grey-500)]">
        הנתונים יתבססו על מסמכים רשמיים בלבד, וכל מספר יהיה לחיץ אל המקור שלו.
      </p>
    </div>
  );
}
