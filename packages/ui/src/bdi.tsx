import type { ReactNode } from 'react';
import { cn } from './cn';

export interface BdiProps {
  children: ReactNode;
  className?: string;
}

/**
 * Bidi isolation wrapper. Any number, date, currency or Latin token embedded
 * in Hebrew (RTL) prose MUST be wrapped so it does not visually reorder.
 * Uses the native <bdi> element plus tabular-nums for aligned digits.
 */
export function Bdi({ children, className }: BdiProps) {
  return <bdi className={cn('tabular-nums', className)}>{children}</bdi>;
}
