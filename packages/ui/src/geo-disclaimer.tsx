import { cn } from './cn';

export interface GeoDisclaimerProps {
  className?: string;
}

/**
 * Appears on every geographic screen. Authorities do not budget by
 * neighbourhood — the map shows the location of projects and institutions,
 * not a neighbourhood-level budget allocation.
 */
export function GeoDisclaimer({ className }: GeoDisclaimerProps) {
  return (
    <p
      className={cn(
        'rounded-md border-s-4 border-[var(--blue-400)] bg-[var(--blue-100)] p-3 text-sm leading-6 text-[var(--grey-700)]',
        className,
      )}
      role="note"
    >
      <span className="font-semibold">שים לב: </span>
      רשויות מקומיות אינן מתקצבות לפי שכונה. המפה מציגה מיקום של פרויקטים ומוסדות, לא הקצאה
      תקציבית שכונתית.
    </p>
  );
}
