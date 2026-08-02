'use client';

import { useEffect, useState } from 'react';

/**
 * Household profile (SPEC part א §3.ב; Build task 28).
 * Stored ONLY in localStorage — never sent to the server. This is a stated
 * privacy decision and is asserted by a Playwright test (no network request
 * carries these values).
 */
interface Profile {
  people: string;
  children: string;
  status: string;
}

const KEY = 'kesef.household';
const EMPTY: Profile = { people: '', children: '', status: '' };

export function HouseholdProfile() {
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      try {
        setProfile({ ...EMPTY, ...JSON.parse(raw) });
      } catch {
        /* ignore corrupt value */
      }
    }
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    window.localStorage.setItem(KEY, JSON.stringify(profile));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <section
      aria-labelledby="household-heading"
      className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-5"
    >
      <h2 id="household-heading" className="text-lg font-semibold text-[var(--navy-700)]">
        התאמה אישית (אופציונלי)
      </h2>
      <p className="mt-1 text-sm leading-6 text-[var(--grey-500)]">
        שלוש שאלות שיעזרו להראות לך כמה מגיע דווקא לך. הנתונים נשמרים{' '}
        <strong>בדפדפן שלך בלבד</strong> ואינם נשלחים לשרת.
      </p>
      <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="hp-people" className="block text-sm font-medium text-[var(--grey-700)]">
            נפשות במשק הבית
          </label>
          <input
            id="hp-people"
            type="number"
            min={1}
            value={profile.people}
            onChange={(e) => setProfile((p) => ({ ...p, people: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="hp-children" className="block text-sm font-medium text-[var(--grey-700)]">
            ילדים
          </label>
          <input
            id="hp-children"
            type="number"
            min={0}
            value={profile.children}
            onChange={(e) => setProfile((p) => ({ ...p, children: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="hp-status" className="block text-sm font-medium text-[var(--grey-700)]">
            סטטוס
          </label>
          <select
            id="hp-status"
            value={profile.status}
            onChange={(e) => setProfile((p) => ({ ...p, status: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
          >
            <option value="">—</option>
            <option value="none">ללא</option>
            <option value="elderly">קשיש</option>
            <option value="disability">נכה</option>
            <option value="allowance">מקבל קצבה</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded-lg bg-[var(--navy-700)] px-5 py-2 text-sm font-semibold text-[var(--white)] hover:bg-[var(--navy-900)]"
          >
            שמור בדפדפן
          </button>
          {saved ? (
            <span role="status" className="ms-3 text-sm text-[var(--exec-over)]">
              נשמר במכשיר שלך בלבד.
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
