/**
 * Audited-report package registry (SPEC part ח + user correction).
 *
 * FOUR data.gov.il packages together give a continuous 2014–2024 series. The
 * same authority can appear in two packages for the same year, so facts are
 * de-duplicated by (symbol, year, coa_code, measure) with the NEWER package
 * winning; dropped duplicates are counted into sync_run.
 *
 * Verified facts encoded here:
 *  - the `תקופה` field is always the single value "שנתי" — there is NO quarterly
 *    data; never build quarter logic (EXPECTED_PERIOD).
 *  - the 2024 resource id is 6e153ddd-… but is NEVER hardcoded; always resolve
 *    it via package_show (resolveResourceId).
 */
import { packageShow, type FetchDeps } from './datagov';

/** The only value the dataset's period field ever contains. */
export const EXPECTED_PERIOD = 'שנתי';

export interface AuditedReportPackage {
  id: string;
  label: string;
  years: number[];
  /** Higher wins on duplicate. local-authorities is the current/newer source. */
  priority: number;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const AUDITED_REPORT_PACKAGES: readonly AuditedReportPackage[] = [
  { id: 'local-authorities', label: 'רשויות (חדש)', years: [2018, 2019, 2022, 2023, 2024], priority: 40 },
  { id: 'audit-cities', label: 'עיריות 2014–2021', years: range(2014, 2021), priority: 30 },
  { id: 'local-council-1', label: 'מועצות מקומיות 2014–2021', years: range(2014, 2021), priority: 20 },
  { id: 'local_council', label: 'מועצות אזוריות 2014–2021', years: range(2014, 2021), priority: 10 },
];

/** Packages that can supply a given year, highest priority first. */
export function packagesForYear(year: number): AuditedReportPackage[] {
  return AUDITED_REPORT_PACKAGES.filter((p) => p.years.includes(year)).sort(
    (a, b) => b.priority - a.priority,
  );
}

/**
 * Resolve a package's resource id for a year via package_show — never hardcode.
 * Picks the resource whose name/description mentions the year (falls back to the
 * single datastore resource if unambiguous).
 */
export async function resolveResourceId(
  packageId: string,
  year: number,
  deps: FetchDeps,
): Promise<string | null> {
  const resources = (await packageShow(packageId, deps)).filter((r) => r.datastore_active !== false);
  const byYear = resources.find((r) => `${r.name ?? ''}`.includes(String(year)));
  if (byYear) return byYear.id;
  return resources.length === 1 ? resources[0]!.id : null;
}

/* ------------------------------------------------------------------ dedup */

export interface DedupKeyed {
  authority_symbol: number;
  fiscal_year: number;
  coa_code: number;
  measure: string;
  /** priority of the package this row came from. */
  packagePriority: number;
}

export function dedupeKey(r: DedupKeyed): string {
  return `${r.authority_symbol}|${r.fiscal_year}|${r.coa_code}|${r.measure}`;
}

export interface DedupeResult<T extends DedupKeyed> {
  kept: T[];
  duplicatesDropped: number;
}

/** Keep one row per (symbol, year, coa_code, measure): the highest-priority package. */
export function dedupeFacts<T extends DedupKeyed>(rows: readonly T[]): DedupeResult<T> {
  const best = new Map<string, T>();
  let duplicatesDropped = 0;
  for (const row of rows) {
    const key = dedupeKey(row);
    const cur = best.get(key);
    if (!cur) {
      best.set(key, row);
    } else {
      duplicatesDropped += 1;
      if (row.packagePriority > cur.packagePriority) best.set(key, row);
    }
  }
  return { kept: [...best.values()], duplicatesDropped };
}
