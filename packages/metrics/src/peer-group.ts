/**
 * Peer-group computation (SPEC part א §3.ה, part ב; Build task 26).
 * A peer group is built from: socio-economic cluster ±1, peripherality ±1,
 * population ±40%, same status. Percentiles (median, p25, p75) are computed
 * per metric across the group.
 */

export interface AuthorityLike {
  symbol: number;
  status: string;
  socioEconomicCluster: number | null;
  peripheralityCluster: number | null;
  population: number | null;
}

export interface PeerCriteria {
  clusterTolerance?: number;
  peripheralityTolerance?: number;
  populationTolerancePct?: number;
  requireSameStatus?: boolean;
}

const DEFAULTS: Required<PeerCriteria> = {
  clusterTolerance: 1,
  peripheralityTolerance: 1,
  populationTolerancePct: 40,
  requireSameStatus: true,
};

export function isPeer(a: AuthorityLike, b: AuthorityLike, criteria: PeerCriteria = {}): boolean {
  if (a.symbol === b.symbol) return false;
  const c = { ...DEFAULTS, ...criteria };
  if (c.requireSameStatus && a.status !== b.status) return false;
  if (
    a.socioEconomicCluster != null &&
    b.socioEconomicCluster != null &&
    Math.abs(a.socioEconomicCluster - b.socioEconomicCluster) > c.clusterTolerance
  )
    return false;
  if (
    a.peripheralityCluster != null &&
    b.peripheralityCluster != null &&
    Math.abs(a.peripheralityCluster - b.peripheralityCluster) > c.peripheralityTolerance
  )
    return false;
  if (a.population != null && b.population != null && a.population > 0) {
    const diffPct = (Math.abs(a.population - b.population) / a.population) * 100;
    if (diffPct > c.populationTolerancePct) return false;
  }
  return true;
}

export function buildPeerGroup(
  target: AuthorityLike,
  all: AuthorityLike[],
  criteria: PeerCriteria = {},
): AuthorityLike[] {
  return all.filter((other) => isPeer(target, other, criteria));
}

/** Linear-interpolation percentile (same method as PostgreSQL percentile_cont). */
export function percentile(values: number[], p: number): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0]!;
  const rank = (p / 100) * (xs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return xs[lo]!;
  return xs[lo]! + (xs[hi]! - xs[lo]!) * (rank - lo);
}

export interface PeerStats {
  median: number | null;
  p25: number | null;
  p75: number | null;
  n: number;
}

export function peerStats(values: (number | null)[]): PeerStats {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  return {
    median: percentile(xs, 50),
    p25: percentile(xs, 25),
    p75: percentile(xs, 75),
    n: xs.length,
  };
}
