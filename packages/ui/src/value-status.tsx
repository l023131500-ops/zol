import { cn } from './cn';

export type ValueStatusKind = 'reported' | 'computed' | 'estimated';

const CONFIG: Record<
  ValueStatusKind,
  { label: string; icon: string; className: string; title: string }
> = {
  reported: {
    label: 'דווח',
    icon: '📄',
    className: 'text-[var(--grey-700)] bg-[var(--grey-50)] border-[var(--grey-200)]',
    title: 'ערך שנלקח ישירות ממסמך מקור רשמי',
  },
  computed: {
    label: 'מחושב',
    icon: 'ƒ',
    className: 'text-[var(--blue-600)] bg-[var(--blue-100)] border-[var(--blue-400)]',
    title: 'ערך שחושב לפי נוסחה גלויה מתוך ערכים מדווחים',
  },
  estimated: {
    label: 'מוערך',
    icon: '≈',
    className: 'text-[var(--alert-notice)] bg-[#FBF3E0] border-[var(--alert-notice)]',
    title: 'הערכה או הקרנה — אינה נתון מדווח',
  },
};

export interface ValueStatusProps {
  kind: ValueStatusKind;
  /** Optional detail, e.g. the formula for `computed` or the range for `estimated`. */
  detail?: string;
  className?: string;
}

/**
 * Marks every displayed value as reported / computed / estimated.
 * Distinct icon + color + text — never color alone (WCAG).
 */
export function ValueStatus({ kind, detail, className }: ValueStatusProps) {
  const cfg = CONFIG[kind];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        cfg.className,
        className,
      )}
      title={detail ? `${cfg.title} — ${detail}` : cfg.title}
    >
      <span aria-hidden="true">{cfg.icon}</span>
      <span>{cfg.label}</span>
      {detail ? <span className="sr-only">: {detail}</span> : null}
    </span>
  );
}
