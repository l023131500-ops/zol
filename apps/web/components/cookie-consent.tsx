'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';

type Consent = 'accepted' | 'rejected' | null;
const STORAGE_KEY = 'kesef.cookie-consent';

/**
 * Real cookie consent (Build task 8):
 * - Essential cookies are always on and need no consent.
 * - Analytics loads ONLY after explicit acceptance.
 * - The choice is persisted; refusal is a first-class button.
 * A Playwright test asserts that refusing prevents any analytics request.
 */
export function CookieConsent() {
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setConsent(stored === 'accepted' || stored === 'rejected' ? stored : null);
    setReady(true);
  }, []);

  const choose = (value: Exclude<Consent, null>) => {
    window.localStorage.setItem(STORAGE_KEY, value);
    setConsent(value);
  };

  const analyticsId = process.env.NEXT_PUBLIC_ANALYTICS_ID;
  const loadAnalytics = ready && consent === 'accepted' && Boolean(analyticsId);

  return (
    <>
      {loadAnalytics ? (
        <Script
          id="kesef-analytics"
          strategy="afterInteractive"
          src={`https://plausible.io/js/script.js`}
          data-domain={analyticsId}
        />
      ) : null}

      {ready && consent === null ? (
        <div
          role="dialog"
          aria-label="הודעת עוגיות"
          aria-live="polite"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--grey-200)] bg-[var(--white)] shadow-lg"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-[var(--grey-700)]">
              אנו משתמשים בעוגיות הכרחיות לתפעול האתר. עוגיות אנליטיקה ייטענו רק אם תאשר.{' '}
              <Link href="/legal/cookies" className="underline">
                מדיניות העוגיות
              </Link>
              .
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => choose('rejected')}
                className="rounded-lg border border-[var(--grey-200)] px-4 py-2 text-sm font-semibold text-[var(--grey-700)] hover:bg-[var(--grey-50)]"
              >
                רק הכרחיות
              </button>
              <button
                type="button"
                onClick={() => choose('accepted')}
                className="rounded-lg bg-[var(--navy-700)] px-4 py-2 text-sm font-semibold text-[var(--white)] hover:bg-[var(--navy-900)]"
              >
                אשר הכול
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
