import { cn, formatNumber } from './cn';
import { Bdi } from './bdi';
import { SourceLink, type SourceRef } from './source-link';
import { ValueStatus, type ValueStatusKind } from './value-status';

export interface MetricComparison {
  label: string;
  value: number;
}

export interface MetricCardProps {
  /** The one big number that is the story. */
  value: number;
  unit?: string;
  /** Short label above the number. */
  label: string;
  /** One plain-Hebrew sentence of context. */
  sentence: string;
  /** Optional peer-group / previous-year comparison shown beneath. */
  comparison?: MetricComparison;
  /** reported | computed | estimated. */
  status?: ValueStatusKind;
  statusDetail?: string;
  /** Mandatory source, unless the value is missing (then use <NoData>). */
  source?: SourceRef;
  className?: string;
}

/**
 * "מספר אחד, משפט אחד, גרף אחד" — the atomic content unit.
 * One large number + one Hebrew sentence + context + a clickable source.
 */
export function MetricCard({
  value,
  unit,
  label,
  sentence,
  comparison,
  status = 'reported',
  statusDetail,
  source,
  className,
}: MetricCardProps) {
  const diffPct =
    comparison && comparison.value !== 0
      ? Math.round(((value - comparison.value) / comparison.value) * 100)
      : null;

  return (
    <figure
      className={cn(
        'flex h-full flex-col gap-3 rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-5 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--grey-500)]">{label}</span>
        <ValueStatus kind={status} detail={statusDetail} />
      </div>

      <div className="flex items-baseline gap-1.5 text-[var(--navy-700)]">
        <Bdi className="text-[2.25rem] font-bold leading-none">{formatNumber(value)}</Bdi>
        {unit ? <span className="text-xl font-semibold text-[var(--grey-500)]">{unit}</span> : null}
      </div>

      <figcaption className="text-base leading-6 text-[var(--grey-700)]">{sentence}</figcaption>

      {comparison ? (
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--grey-200)] pt-3 text-sm text-[var(--grey-500)]">
          <span>{comparison.label}:</span>
          <Bdi className="font-semibold text-[var(--grey-700)]">
            {formatNumber(comparison.value)}
            {unit ? ` ${unit}` : ''}
          </Bdi>
          {diffPct !== null ? (
            <span className="text-[var(--grey-500)]">
              (פער <Bdi>{Math.abs(diffPct)}%</Bdi> {diffPct >= 0 ? 'מעל' : 'מתחת'})
            </span>
          ) : null}
        </div>
      ) : null}

      {source ? <SourceLink {...source} className="mt-1" /> : null}
    </figure>
  );
}
