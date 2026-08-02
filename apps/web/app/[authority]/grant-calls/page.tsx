import type { Metadata } from 'next';
import Link from 'next/link';
import { NoData } from '@kesef/ui';
import { getGrantCallSourcesInfo } from '@/lib/data/authority';

export const metadata: Metadata = { title: 'קולות קוראים', robots: { index: false } };

const FUNNEL = ['זכאית', 'הגישה', 'זכתה', 'פספסה'];

/**
 * Grant-calls screen (task 39 upgrade — the commercial core). Honest coverage
 * header: we scan N sources, we do NOT claim to cover every grant call in
 * Israel (there is no national registry). "מונה הכסף שהוחמץ" shown prominently.
 */
export default async function GrantCallsPage() {
  const sources = await getGrantCallSourcesInfo();
  const updated = sources.lastUpdated
    ? new Date(sources.lastUpdated).toLocaleString('he-IL')
    : 'טרם סונכרן';

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[var(--grey-200)] bg-[var(--white)] p-4">
        <p className="text-sm text-[var(--grey-700)]">
          סורק <bdi className="font-semibold">{sources.count}</bdi> מקורות · עודכן לאחרונה:{' '}
          <bdi>{updated}</bdi> ·{' '}
          <Link href="/quality" className="text-[var(--blue-600)] underline">
            רשימת המקורות המלאה
          </Link>
        </p>
        <p className="mt-2 text-xs leading-6 text-[var(--grey-500)]">
          שים לב: אין בישראל מרשם לאומי מלא של קולות קוראים. איננו מתיימרים לכסות את כולם — אנחנו
          סורקים את המקורות הרשומים מעלה בלבד.
        </p>
      </div>

      {/* Missed-money counter — the feature that sells */}
      <section className="rounded-xl border border-[var(--alert-notice)] bg-[#FBF3E0] p-5" aria-labelledby="missed-heading">
        <h2 id="missed-heading" className="text-sm font-semibold text-[var(--alert-notice)]">
          מונה הכסף שהוחמץ
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--grey-700)]">
          סך הסכומים של קולות קוראים שהרשות עמדה בתנאי הסף שלהם, שנסגרו, ושלא הוגשה בהם בקשה.
        </p>
        <div className="mt-3">
          <NoData
            what="הסכום שהוחמץ"
            reason="יחושב ממנוע ההתאמה לאחר טעינת קולות הקוראים ופרופיל הרשות. עד אז אין נתון — לא אפס מומצא."
          />
        </div>
      </section>

      <section aria-labelledby="funnel-heading">
        <h2 id="funnel-heading" className="text-lg font-semibold text-[var(--navy-700)]">
          משפך הקולות הקוראים
        </h2>
        <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-label="שלבי המשפך">
          {FUNNEL.map((stage, i) => (
            <li key={stage} className="flex items-center gap-2">
              <span className="rounded-md border border-[var(--grey-200)] bg-[var(--white)] px-3 py-1.5 text-[var(--grey-700)]">
                {stage}
              </span>
              {i < FUNNEL.length - 1 ? <span aria-hidden="true" className="text-[var(--grey-500)]">←</span> : null}
            </li>
          ))}
        </ol>
        <div className="mt-3">
          <NoData
            what="התאמות לרשות"
            reason="מנוע ההתאמה מצליב את תנאי הסף של כל קול קורא מול פרופיל הרשות (match / partial / no_match). תנאי שלא ניתן לאמת מסומן needs_review — לא מנוחש."
          />
        </div>
      </section>
    </div>
  );
}
