'use client';

import { useState } from 'react';
import { NoData } from '@kesef/ui';

/**
 * On-demand research selector (task 36). The multi-dimensional picker builds a
 * ResearchQuery; "הפק דוח" assembles a report from ready data. Until the data
 * is loaded, generation returns the honest empty state — never invented output.
 */
const TOPICS = [
  { id: 'education', label: 'חינוך' },
  { id: 'welfare', label: 'רווחה' },
  { id: 'culture', label: 'תרבות' },
  { id: 'religion', label: 'דת' },
  { id: 'infrastructure', label: 'תשתיות' },
  { id: 'administration', label: 'הנהלה' },
  { id: 'debt', label: 'חוב' },
];

export default function ResearchPage() {
  const [level, setLevel] = useState('authority');
  const [topics, setTopics] = useState<string[]>(['education']);
  const [fromYear, setFromYear] = useState(2020);
  const [toYear, setToYear] = useState(2024);
  const [normalize, setNormalize] = useState('per_capita');
  const [generated, setGenerated] = useState(false);

  const toggleTopic = (id: string) =>
    setTopics((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-[var(--navy-700)]">מחקר לפי בחירה</h1>
      <p className="mt-2 text-base leading-7 text-[var(--grey-700)]">
        בורר רב-ממדי מעל נתונים מוכנים. הדוח מורכב מהנתונים שכבר נטענו — לא מחיפוש חי ברשת.
      </p>

      <section className="mt-6 space-y-5 rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-5">
        <div>
          <label htmlFor="level" className="block text-sm font-semibold text-[var(--grey-700)]">רמה</label>
          <select id="level" value={level} onChange={(e) => setLevel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2">
            <option value="national">ארצי</option>
            <option value="district">מחוז</option>
            <option value="cluster">אשכול</option>
            <option value="authority">רשות</option>
            <option value="institution">מוסד</option>
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-[var(--grey-700)]">נושאים</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <button key={t.id} type="button" onClick={() => toggleTopic(t.id)}
                aria-pressed={topics.includes(t.id)}
                className={`rounded-md border px-3 py-1.5 text-sm ${topics.includes(t.id) ? 'border-[var(--navy-700)] bg-[var(--navy-700)] text-[var(--white)]' : 'border-[var(--grey-200)] text-[var(--grey-700)]'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="from" className="block text-sm font-semibold text-[var(--grey-700)]">משנה</label>
            <input id="from" type="number" value={fromYear} min={2014} max={2024}
              onChange={(e) => setFromYear(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2" />
          </div>
          <div>
            <label htmlFor="to" className="block text-sm font-semibold text-[var(--grey-700)]">עד שנה</label>
            <input id="to" type="number" value={toYear} min={2014} max={2024}
              onChange={(e) => setToYear(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2" />
          </div>
          <div>
            <label htmlFor="norm" className="block text-sm font-semibold text-[var(--grey-700)]">נרמול</label>
            <select id="norm" value={normalize} onChange={(e) => setNormalize(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2">
              <option value="absolute">מוחלט</option>
              <option value="per_capita">לנפש</option>
              <option value="per_child">לילד</option>
              <option value="per_pupil">לתלמיד</option>
              <option value="pct_of_budget">% מהתקציב</option>
            </select>
          </div>
        </div>

        <button type="button" onClick={() => setGenerated(true)}
          className="rounded-lg bg-[var(--navy-700)] px-6 py-2.5 font-semibold text-[var(--white)] hover:bg-[var(--navy-900)]">
          הפק דוח
        </button>
      </section>

      {generated ? (
        <section className="mt-6" aria-label="דוח מחקר">
          <NoData
            what="דוח לבחירה שלך"
            reason="הבורר תקין והצינור מוכן, אך נתוני האמת עדיין לא נטענו (גל 2). כמתחייב מהמעקות — כשאין נתונים מוצג 'אין נתונים', לא המצאה."
          />
          <ol className="mt-4 grid gap-2 text-sm text-[var(--grey-500)] sm:grid-cols-2">
            {['שלושה מספרי-על', 'סיכום מילולי', 'גרף ראשי', 'השוואה לשווים', 'תמרורי אזהרה', 'פירוט טבלאי', 'מה חסר', 'מקורות'].map((s) => (
              <li key={s} className="rounded-md border border-dashed border-[var(--grey-200)] px-3 py-2">{s}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
