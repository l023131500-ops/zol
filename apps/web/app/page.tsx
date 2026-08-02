import Link from 'next/link';

/**
 * Marketing home (Build task 9). The three headline numbers are placeholders
 * tagged [יוחלף בנתוני אמת במשימה 24] and are NOT presented as real figures —
 * per guardrails, no invented data may look real.
 */
const PLACEHOLDER_STATS = [
  {
    label: 'תושבים בחצור הגלילית',
    value: '11,251',
    note: 'לפי הלמ"ס',
  },
  {
    label: 'רשויות פרסמו דוח כספי מבוקר עדכני',
    value: '19%',
    note: 'המכון הישראלי לדמוקרטיה, 2023',
  },
  {
    label: 'רשויות פרסמו מידע על תב"רים',
    value: '5%',
    note: 'מתוך היקף שנתי של כ-22.2 מיליארד ₪',
  },
];

const WHAT_WE_DO = [
  {
    title: 'כמה מגיע אליי',
    body: 'חישוב מבוסס-נוסחה: מענק איזון, השתתפות משרדי ממשלה, וזכאות משק בית — מנורמל לנפש, לילד ולמשק בית.',
  },
  {
    title: 'כמה הגיע בפועל',
    body: 'מה שנרשם בדוחות הכספיים המבוקרים, בהצלבה מול מפתח התקציב. כל מספר מקושר למסמך המקור.',
  },
  {
    title: 'מה נתקע',
    body: 'הפער: תב"ר שאושר ולא בוצע, קול קורא שלא הוגש, זכות שלא מומשה. עובדות בלבד, בלי האשמה.',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="py-16 text-center md:py-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--blue-600)]">
          פיילוט: חצור הגלילית
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-bold leading-tight text-[var(--navy-700)] md:text-5xl">
          כל הכסף הציבורי של הרשות שלך — בשפה שלך
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-[var(--grey-700)]">
          כמה כסף היה אמור להגיע ליישוב שלך, כמה הגיע בפועל, ומה נתקע בדרך. המערכת מציגה מה פורסם
          במקורות רשמיים — לא מה קרה — וכל מספר לחיץ אל המסמך שממנו נלקח.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/hatzor-haglilit"
            className="rounded-lg bg-[var(--navy-700)] px-6 py-3 text-lg font-semibold text-[var(--white)] hover:bg-[var(--navy-900)]"
          >
            בדוק את היישוב שלי
          </Link>
          <Link
            href="/for-municipalities"
            className="rounded-lg border border-[var(--blue-400)] px-6 py-3 text-lg font-semibold text-[var(--blue-600)] hover:bg-[var(--blue-100)]"
          >
            אני מרשות מקומית
          </Link>
        </div>
      </section>

      {/* Three numbers */}
      <section aria-labelledby="stats-heading" className="pb-8">
        <h2 id="stats-heading" className="sr-only">
          שלושה מספרים מהמחקר
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PLACEHOLDER_STATS.map((stat) => (
            <figure
              key={stat.label}
              className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-6 shadow-sm"
            >
              <span className="inline-block rounded bg-[var(--blue-100)] px-2 py-0.5 text-xs font-medium text-[var(--blue-600)]">
                יוחלף בנתוני אמת במשימה 24
              </span>
              <bdi className="mt-3 block text-4xl font-bold tabular-nums text-[var(--navy-700)]">
                {stat.value}
              </bdi>
              <figcaption className="mt-2 text-base text-[var(--grey-700)]">{stat.label}</figcaption>
              <p className="mt-1 text-sm text-[var(--grey-500)]">{stat.note}</p>
            </figure>
          ))}
        </div>
      </section>

      {/* What we do */}
      <section aria-labelledby="what-heading" className="py-12">
        <h2 id="what-heading" className="text-2xl font-semibold text-[var(--navy-700)]">
          שלוש שאלות, תשובה אחת
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {WHAT_WE_DO.map((item) => (
            <div key={item.title} className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-6">
              <h3 className="text-lg font-semibold text-[var(--navy-700)]">{item.title}</h3>
              <p className="mt-2 text-base leading-7 text-[var(--grey-700)]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Transparency about ourselves */}
      <section className="mb-16 rounded-2xl border border-[var(--grey-200)] bg-[var(--white)] p-8">
        <h2 className="text-2xl font-semibold text-[var(--navy-700)]">שקיפות על עצמנו</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--grey-700)]">
          אנחנו לא מאמתים שהמספר במקור נכון — רק שהעתקנו אותו נכון, מהעמוד המדויק. עמוד איכות
          הנתונים מציג את אחוז האימות הידני, השגיאות הידועות, ותאריך הסנכרון האחרון לכל מקור.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/quality" className="font-semibold text-[var(--blue-600)] underline">
            איכות הנתונים ←
          </Link>
          <Link href="/methodology" className="font-semibold text-[var(--blue-600)] underline">
            מתודולוגיה ←
          </Link>
        </div>
      </section>
    </div>
  );
}
