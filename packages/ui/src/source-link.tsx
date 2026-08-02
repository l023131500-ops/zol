import { cn } from './cn';
import { Bdi } from './bdi';

export interface SourceRef {
  /** source_document.id — the immutable archived document. */
  docId: string;
  /** 1-based page number inside the source document. */
  page?: number;
  /** Optional human label; defaults to "צפה במסמך המקור". */
  label?: string;
}

export interface SourceLinkProps extends SourceRef {
  className?: string;
}

/**
 * Mandatory next to every number. Opens the source document at the correct
 * page. A number without a source is a guardrail violation.
 */
export function SourceLink({ docId, page, label, className }: SourceLinkProps) {
  const href = page ? `/sources/${docId}#page=${page}` : `/sources/${docId}`;
  const text = label ?? 'צפה במסמך המקור';
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center gap-1 text-sm text-[var(--blue-600)] underline decoration-dotted underline-offset-2',
        'hover:text-[var(--navy-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-600)]',
        className,
      )}
    >
      <span aria-hidden="true">↗</span>
      <span>{text}</span>
      {page ? (
        <span className="text-[var(--grey-500)]">
          (עמ׳ <Bdi>{page}</Bdi>)
        </span>
      ) : null}
    </a>
  );
}
