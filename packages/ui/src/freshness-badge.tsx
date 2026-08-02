import { cn } from './cn';
import { Bdi } from './bdi';

export interface FreshnessBadgeProps {
  /** The most recent published audited-report year. */
  latestYear: number;
  className?: string;
}

/**
 * Shown on every screen that displays a financial figure. Audited reports are
 * published 12–17 months in arrears — that lag is the state's, not ours, and
 * the user must understand it. Uses a native <details> so it's accessible with
 * no client JS.
 */
export function FreshnessBadge({ latestYear, className }: FreshnessBadgeProps) {
  return (
    <details className={cn('inline-block align-middle', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-[var(--grey-200)] bg-[var(--grey-50)] px-2 py-1 text-xs font-medium text-[var(--grey-700)] marker:content-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <span aria-hidden="true">🗓</span>
        <span>
          השנה העדכנית ביותר שפורסמה: <Bdi>{latestYear}</Bdi>
        </span>
        <span aria-hidden="true" className="text-[var(--grey-500)]">
          ⓘ
        </span>
      </summary>
      <p className="mt-2 max-w-sm rounded-md border border-[var(--grey-200)] bg-[var(--white)] p-3 text-sm leading-6 text-[var(--grey-700)]">
        דוחות כספיים מבוקרים מתפרסמים בפיגור של <Bdi>12–17</Bdi> חודשים ממועד סוף שנת הכספים. כלומר
        השנה המלאה והמבוקרת האחרונה שזמינה כרגע היא <Bdi>{latestYear}</Bdi>. זהו פער הפרסום של המקורות
        הרשמיים, לא עיכוב מצדנו.
      </p>
    </details>
  );
}
