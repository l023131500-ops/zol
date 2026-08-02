import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a number in Hebrew locale with grouping and tabular figures.
 * Always render the result inside a <Bdi> when placed in Hebrew prose.
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('he-IL', options).format(value);
}

/** Format a shekel amount, e.g. 8400 -> "8,400 ₪". */
export function formatShekel(value: number, options?: Intl.NumberFormatOptions): string {
  return `${formatNumber(value, options)} ₪`;
}
