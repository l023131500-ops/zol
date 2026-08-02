'use client';

import { cn } from './cn';
import { Bdi } from './bdi';

export interface YearSwitcherProps {
  years: number[];
  selected: number;
  onSelect: (year: number) => void;
  /** Years with no data — rendered grey and disabled with a tooltip. */
  yearsWithoutData?: number[];
  className?: string;
}

/**
 * Large, clear year buttons — not a dropdown. Forward/back arrows.
 * Years without data are greyed with a tooltip, never hidden.
 */
export function YearSwitcher({
  years,
  selected,
  onSelect,
  yearsWithoutData = [],
  className,
}: YearSwitcherProps) {
  const sorted = [...years].sort((a, b) => a - b);
  const missing = new Set(yearsWithoutData);
  const idx = sorted.indexOf(selected);

  const go = (delta: number) => {
    const next = sorted[idx + delta];
    if (next !== undefined) onSelect(next);
  };

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="group"
      aria-label="בחירת שנת תקציב"
    >
      {/* Back = earlier year, on the right in RTL. */}
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={idx <= 0}
        aria-label="שנה קודמת"
        className="rounded-md border border-[var(--grey-200)] px-2 py-1 text-lg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ›
      </button>

      <div className="flex flex-wrap gap-1">
        {sorted.map((year) => {
          const noData = missing.has(year);
          const isSelected = year === selected;
          return (
            <button
              key={year}
              type="button"
              onClick={() => !noData && onSelect(year)}
              disabled={noData}
              aria-pressed={isSelected}
              title={noData ? 'אין נתונים לשנה זו' : undefined}
              className={cn(
                'min-w-[3.5rem] rounded-md border px-3 py-1.5 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                isSelected
                  ? 'border-[var(--navy-700)] bg-[var(--navy-700)] text-[var(--white)]'
                  : 'border-[var(--grey-200)] text-[var(--grey-700)] hover:bg-[var(--blue-100)]',
                noData && 'cursor-not-allowed text-[var(--grey-500)] opacity-50 hover:bg-transparent',
              )}
            >
              <Bdi>{year}</Bdi>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => go(1)}
        disabled={idx >= sorted.length - 1}
        aria-label="שנה הבאה"
        className="rounded-md border border-[var(--grey-200)] px-2 py-1 text-lg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ‹
      </button>
    </div>
  );
}
