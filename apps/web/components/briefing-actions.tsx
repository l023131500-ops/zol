'use client';

import { formatShekel } from '@kesef/ui';

export interface Headline {
  label: string;
  value: number;
  isCurrency?: boolean;
}

/**
 * Export actions for the meeting briefing: print-to-PDF (browser print with a
 * print stylesheet) and a WhatsApp summary carrying the three headline numbers.
 */
export function BriefingActions({ authorityName, headlines }: { authorityName: string; headlines: Headline[] }) {
  const summary =
    `תיק לפגישה — ${authorityName}\n` +
    headlines
      .map((h) => `• ${h.label}: ${h.isCurrency === false ? h.value : formatShekel(Math.round(h.value))}`)
      .join('\n') +
    `\nהופק מתוך פלטפורמת השקיפות — כל מספר עם מקור רשמי.`;

  const waHref = `https://wa.me/?text=${encodeURIComponent(summary)}`;

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-[var(--navy-700)] px-4 py-2 text-sm font-semibold text-[var(--white)] hover:bg-[var(--navy-900)]"
      >
        הורד PDF (הדפסה)
      </button>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-[var(--blue-400)] px-4 py-2 text-sm font-semibold text-[var(--blue-600)] hover:bg-[var(--blue-100)]"
      >
        שלח בוואטסאפ
      </a>
    </div>
  );
}
