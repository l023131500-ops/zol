import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-shell';

export const metadata: Metadata = { title: 'צור קשר' };

export default function ContactPage() {
  return (
    <>
      <PageHeader title="צור קשר" lead="שאלה, תיקון לנתון, או פנייה מרשות מקומית." />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <form className="space-y-4 rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-6" aria-label="טופס יצירת קשר">
          <div>
            <label htmlFor="c-name" className="block text-sm font-semibold text-[var(--grey-700)]">
              שם
            </label>
            <input
              id="c-name"
              name="name"
              type="text"
              autoComplete="name"
              className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="c-email" className="block text-sm font-semibold text-[var(--grey-700)]">
              דוא״ל
            </label>
            <input
              id="c-email"
              name="email"
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="c-message" className="block text-sm font-semibold text-[var(--grey-700)]">
              הודעה
            </label>
            <textarea
              id="c-message"
              name="message"
              rows={5}
              className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[var(--navy-700)] px-5 py-2.5 font-semibold text-[var(--white)] hover:bg-[var(--navy-900)]"
          >
            שליחה
          </button>
        </form>
      </div>
    </>
  );
}
