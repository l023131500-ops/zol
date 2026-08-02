import type { Metadata } from 'next';
import {
  MetricCard,
  NoData,
  AlertBadge,
  ValueStatus,
  SourceLink,
  GeoDisclaimer,
  Button,
  Card,
} from '@kesef/ui';
import { Term } from '@kesef/ui';
import { YearDemo } from './year-demo';

export const metadata: Metadata = { title: 'רכיבים — עמוד בדיקה', robots: { index: false } };

const DEMO_DOC = '00000000-0000-0000-0000-000000000000';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold text-[var(--navy-700)]">{title}</h2>
      {children}
    </section>
  );
}

/** Task 3 acceptance page: renders every core component. */
export default function ComponentsDevPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10" dir="rtl">
      <h1 className="text-3xl font-bold text-[var(--navy-700)]">ספריית הרכיבים</h1>
      <p className="mt-2 text-[var(--grey-700)]">כל רכיבי הליבה של מערכת העיצוב.</p>

      <Section title="MetricCard">
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            value={8400}
            unit="₪"
            label="הוצאה לתלמיד"
            sentence="לכל תלמיד בחצור הגלילית, בשנת 2024"
            comparison={{ label: 'חציון קבוצת השווים', value: 11200 }}
            status="reported"
            source={{ docId: DEMO_DOC, page: 47 }}
          />
          <MetricCard
            value={2750000}
            unit="₪"
            label="מענק איזון"
            sentence="חושב לפי נוסחת גדיש עם הפרמטרים של הרשות"
            status="computed"
            statusDetail="גדיש: צד הוצאה − צד הכנסה"
            source={{ docId: DEMO_DOC, page: 12 }}
          />
        </div>
      </Section>

      <Section title="NoData">
        <div className="grid gap-4 sm:grid-cols-2">
          <NoData
            what={'תב"רים'}
            reason="הרשות לא פרסמה מידע על תקציבים בלתי רגילים לשנים 2022–2024"
            action={{ label: 'הגש בקשת חופש מידע', href: '/foi/new?topic=tabar' }}
          />
          <Card>
            <p className="text-sm text-[var(--grey-500)]">כרטיס רגיל לצד NoData — אותו משקל ויזואלי.</p>
          </Card>
        </div>
      </Section>

      <Section title="AlertBadge">
        <div className="space-y-3">
          <AlertBadge
            severity="notice"
            statement="הוצאה לתלמיד: 8,400 ₪ · חציון קבוצת השווים: 11,200 ₪ · פער: 25%"
            methodologyHref="/methodology#alerts"
          />
          <AlertBadge
            severity="high"
            statement="לא נמצא פרסום של תב״רים לשנים 2022–2024"
            methodologyHref="/methodology#alerts"
            response={{ text: 'הרשות מסרה כי התב״רים יפורסמו עד סוף הרבעון.', publishedAt: '2026-07-01' }}
          />
        </div>
      </Section>

      <Section title="ValueStatus">
        <div className="flex flex-wrap gap-3">
          <ValueStatus kind="reported" />
          <ValueStatus kind="computed" detail="הכנסה עצמית ÷ אוכלוסייה" />
          <ValueStatus kind="estimated" detail="טווח: 3.2M–3.8M" />
        </div>
      </Section>

      <Section title="Term">
        <p className="text-base leading-7 text-[var(--grey-700)]">
          <Term
            id="tabar"
            definition={'תב"ר = תקציב בלתי רגיל. תקציב ייעודי לפרויקט חד-פעמי, נפרד מהתקציב השוטף.'}
            whyItMatters="חלק גדול מההשקעה בתשתיות עובר דרך תב״רים, ולרוב אינו מפורסם."
            example="בחצור הגלילית טרם פורסמו תב״רים לשנים האחרונות."
          >
            תב&quot;ר
          </Term>{' '}
          הוא מנגנון מרכזי במימון פרויקטים. לחיצה על המונח פותחת הסבר.
        </p>
      </Section>

      <Section title="SourceLink">
        <SourceLink docId={DEMO_DOC} page={47} />
      </Section>

      <Section title="YearSwitcher">
        <YearDemo />
      </Section>

      <Section title="GeoDisclaimer">
        <GeoDisclaimer />
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap gap-3">
          <Button>ראשי</Button>
          <Button variant="secondary">משני</Button>
          <Button variant="ghost">שקוף</Button>
        </div>
      </Section>
    </div>
  );
}
