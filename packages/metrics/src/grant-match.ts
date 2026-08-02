/**
 * Grant-call matching engine (SPEC task 39 upgrade — the commercial core).
 *
 * Crosses a grant call's extracted eligibility against an authority's profile.
 * Conditions that could not be extracted with certainty are marked
 * `needs_review` and never guessed. A missing extraction never counts as a
 * failed condition.
 */

export type ConditionStatus = 'verified' | 'needs_review';
export type MatchResult = 'match' | 'partial' | 'no_match';

export interface Range {
  min?: number;
  max?: number;
}

export interface GrantEligibility {
  clusterRange?: Range;
  peripheralityRange?: Range;
  populationRange?: Range;
  municipalStatus?: string[];
  matchingPct?: number;
  /** Conditions the extractor could not resolve with certainty. */
  unresolved?: string[];
}

export interface AuthorityProfile {
  symbol: number;
  socioEconomicCluster: number | null;
  peripheralityCluster: number | null;
  population: number | null;
  status: string;
}

export interface ConditionCheck {
  label: string;
  required: string;
  actual: string;
  met: boolean | null; // null when needs_review
  status: ConditionStatus;
}

export interface GrantMatch {
  result: MatchResult;
  conditions: ConditionCheck[];
}

function inRange(value: number | null, range: Range | undefined): boolean | null {
  if (!range || value == null) return null;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

function fmtRange(r?: Range): string {
  if (!r) return '—';
  if (r.min != null && r.max != null) return `${r.min}–${r.max}`;
  if (r.min != null) return `≥ ${r.min}`;
  if (r.max != null) return `≤ ${r.max}`;
  return '—';
}

export function matchGrantCall(elig: GrantEligibility, profile: AuthorityProfile): GrantMatch {
  const conditions: ConditionCheck[] = [];

  const addRange = (label: string, range: Range | undefined, value: number | null) => {
    if (!range) return;
    const met = inRange(value, range);
    conditions.push({
      label,
      required: fmtRange(range),
      actual: value == null ? 'לא ידוע' : String(value),
      met,
      status: met == null ? 'needs_review' : 'verified',
    });
  };

  addRange('אשכול חברתי-כלכלי', elig.clusterRange, profile.socioEconomicCluster);
  addRange('פריפריאליות', elig.peripheralityRange, profile.peripheralityCluster);
  addRange('אוכלוסייה', elig.populationRange, profile.population);

  if (elig.municipalStatus?.length) {
    const met = elig.municipalStatus.includes(profile.status);
    conditions.push({
      label: 'מעמד מוניציפלי',
      required: elig.municipalStatus.join(', '),
      actual: profile.status,
      met,
      status: 'verified',
    });
  }

  for (const label of elig.unresolved ?? []) {
    conditions.push({ label, required: 'לא ניתן היה לאמת מהפרסום', actual: '—', met: null, status: 'needs_review' });
  }

  const verified = conditions.filter((c) => c.status === 'verified');
  const anyFailed = verified.some((c) => c.met === false);
  const allMet = verified.length > 0 && verified.every((c) => c.met === true);
  const hasReview = conditions.some((c) => c.status === 'needs_review');

  let result: MatchResult;
  if (anyFailed) result = 'no_match';
  else if (allMet && !hasReview) result = 'match';
  else result = 'partial';

  return { result, conditions };
}

/* ------------------------------------------------------- missed-money counter */

export interface ClosedCall {
  maxAmount: number;
  metThreshold: boolean;
  applied: boolean;
}

/**
 * "מונה הכסף שהוחמץ" — sum of max amounts for closed calls the authority met
 * the threshold for but did not apply to.
 */
export function computeMissedMoney(calls: readonly ClosedCall[]): number {
  return calls
    .filter((c) => c.metThreshold && !c.applied)
    .reduce((sum, c) => sum + Math.max(0, c.maxAmount), 0);
}
