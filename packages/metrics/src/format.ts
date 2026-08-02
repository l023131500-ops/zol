/** Plain Hebrew formatting for generated statements (server-side, no JSX). */

export function formatShekelPlain(value: number): string {
  return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(value))} ₪`;
}

export function formatPct(value: number, digits = 1): string {
  return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: digits }).format(value)}%`;
}
