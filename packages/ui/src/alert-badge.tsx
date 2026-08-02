import { cn } from './cn';

export type AlertSeverity = 'info' | 'notice' | 'high';

export interface AuthorityResponse {
  text: string;
  publishedAt: string;
}

const SEVERITY: Record<
  AlertSeverity,
  { label: string; icon: string; className: string }
> = {
  info: {
    label: 'לידיעה',
    icon: 'ℹ',
    className: 'border-[var(--alert-info)] bg-[#EDF1F8] text-[var(--alert-info)]',
  },
  notice: {
    label: 'נדרשת בדיקה',
    icon: '△',
    className: 'border-[var(--alert-notice)] bg-[#FBF3E0] text-[var(--alert-notice)]',
  },
  high: {
    label: 'נדרשת בדיקה מעמיקה',
    icon: '◆',
    className: 'border-[var(--alert-high)] bg-[#FBEDE0] text-[var(--alert-high)]',
  },
};

export interface AlertBadgeProps {
  severity: AlertSeverity;
  /** Factual statement only — measurement, not judgement. */
  statement: string;
  /** Link to the public methodology definition of this flag. */
  methodologyHref: string;
  /** The authority's right-of-reply, once published. */
  response?: AuthorityResponse;
  className?: string;
}

/**
 * A warning flag. Amber, never red. Factual wording ("נדרשת בדיקה", not
 * "חריגה"). Always links to a public methodology definition, and shows the
 * authority's response when present.
 */
export function AlertBadge({
  severity,
  statement,
  methodologyHref,
  response,
  className,
}: AlertBadgeProps) {
  const cfg = SEVERITY[severity];
  return (
    <div
      className={cn('rounded-lg border p-4', cfg.className, className)}
      role="region"
      aria-label={`תמרור אזהרה: ${cfg.label}`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-base">
          {cfg.icon}
        </span>
        <span className="text-sm font-semibold">{cfg.label}</span>
      </div>
      <p className="mt-2 text-base leading-6 text-[var(--grey-700)]">{statement}</p>
      <a
        href={methodologyHref}
        className="mt-2 inline-block text-sm underline decoration-dotted underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        איך חושב הדגל הזה?
      </a>
      {response ? (
        <div className="mt-3 rounded-md border border-[var(--grey-200)] bg-[var(--white)] p-3">
          <p className="text-xs font-semibold text-[var(--grey-500)]">תגובת הרשות</p>
          <p className="mt-1 text-sm leading-6 text-[var(--grey-700)]">{response.text}</p>
        </div>
      ) : null}
    </div>
  );
}
