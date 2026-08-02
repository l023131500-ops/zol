import { cn } from './cn';

export interface NoDataProps {
  /** What is missing, e.g. 'תב"רים'. */
  what: string;
  /** Why it is missing, in plain Hebrew. Absence of publication is a finding. */
  reason: string;
  /** Optional call to action, e.g. filing a freedom-of-information request. */
  action?: { label: string; href: string };
  className?: string;
}

/**
 * Given the SAME visual weight as a data card. Missing publication is a
 * finding, not a system failure. Never replace with invented/placeholder data.
 */
export function NoData({ what, reason, action, className }: NoDataProps) {
  return (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-3 rounded-xl border border-dashed border-[var(--grey-200)] bg-[var(--grey-50)] p-5',
        className,
      )}
      role="note"
    >
      <div>
        <div className="flex items-center gap-2 text-[var(--grey-500)]">
          <span aria-hidden="true" className="text-lg">
            ⃠
          </span>
          <span className="text-sm font-medium">אין נתון</span>
        </div>
        <h3 className="mt-1 text-lg font-semibold text-[var(--grey-700)]">{what}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--grey-500)]">{reason}</p>
      </div>
      {action ? (
        <a
          href={action.href}
          className="inline-flex w-fit items-center gap-1 rounded-md border border-[var(--blue-400)] px-3 py-1.5 text-sm font-medium text-[var(--blue-600)] hover:bg-[var(--blue-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-600)]"
        >
          {action.label}
          <span aria-hidden="true">←</span>
        </a>
      ) : null}
    </div>
  );
}
