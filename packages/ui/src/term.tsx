'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from './cn';

export interface TermProps {
  /** Stable id from the glossary, e.g. "tabar", "balancing_grant". */
  id: string;
  /** The inline word shown in prose. */
  children: ReactNode;
  /** Two-line definition. */
  definition: string;
  /** Why it matters to the reader. */
  whyItMatters?: string;
  /** A concrete example from the current authority. */
  example?: string;
  className?: string;
}

/**
 * Wraps a professional term appearing in the UI. Click/Enter opens a card:
 * two-line definition · why it matters to you · example from this authority.
 * Keyboard accessible; toggles an aria-controlled disclosure.
 */
export function Term({ id, children, definition, whyItMatters, example, className }: TermProps) {
  const [open, setOpen] = useState(false);
  const panelId = `term-${id}-${useId()}`;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'cursor-help border-b border-dotted border-[var(--blue-400)] text-[var(--blue-600)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-600)]',
          className,
        )}
      >
        {children}
      </button>
      {open ? (
        <span
          id={panelId}
          role="dialog"
          aria-label={`הסבר: ${typeof children === 'string' ? children : id}`}
          className="absolute end-0 top-full z-20 mt-1 block w-72 rounded-lg border border-[var(--grey-200)] bg-[var(--white)] p-4 text-start shadow-lg"
        >
          <span className="block text-sm leading-6 text-[var(--grey-700)]">{definition}</span>
          {whyItMatters ? (
            <span className="mt-2 block text-sm leading-6 text-[var(--grey-500)]">
              <span className="font-semibold text-[var(--grey-700)]">למה זה חשוב לך: </span>
              {whyItMatters}
            </span>
          ) : null}
          {example ? (
            <span className="mt-2 block text-sm leading-6 text-[var(--grey-500)]">
              <span className="font-semibold text-[var(--grey-700)]">דוגמה: </span>
              {example}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
