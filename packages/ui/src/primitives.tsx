import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/* ------------------------------------------------------------------ Button */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-600)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--navy-700)] text-[var(--white)] hover:bg-[var(--navy-900)]',
        secondary:
          'border border-[var(--blue-400)] text-[var(--blue-600)] hover:bg-[var(--blue-100)]',
        ghost: 'text-[var(--blue-600)] hover:bg-[var(--blue-100)]',
      },
      size: {
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
        sm: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-5 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-[var(--grey-200)] motion-reduce:animate-none',
        className,
      )}
      aria-hidden="true"
    />
  );
}

/* --------------------------------------------------------------- DataTable */

export interface AccessibleTableProps {
  caption: string;
  head: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A caption-labelled table used as the accessible alternative for every chart. */
export function AccessibleTable({ caption, head, children, className }: AccessibleTableProps) {
  return (
    <table className={cn('w-full border-collapse text-start text-sm', className)}>
      <caption className="mb-2 text-start text-sm text-[var(--grey-500)]">{caption}</caption>
      <thead>{head}</thead>
      <tbody>{children}</tbody>
    </table>
  );
}
