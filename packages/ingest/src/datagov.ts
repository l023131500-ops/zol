/**
 * data.gov.il (CKAN) connector (SPEC part ח, source 1; Build task 13).
 *
 * Rules baked in from the guardrails:
 *  - NEVER use datastore_search_sql (server returns 403). Only filters/q/fields.
 *  - Max 1 request/second per domain, with an identified User-Agent.
 *  - Every raw response is meant to be archived to R2 before parsing (hook).
 *  - 403/blocked → record and mark unavailable; never bypass.
 */

const BASE = 'https://data.gov.il/api/3/action';

export const USER_AGENT =
  'kesef-platform/0.1 (budget-transparency research; contact: kesef@example.org)';

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  datastore_active?: boolean;
  license_id?: string;
}

export interface DatastoreSearchParams {
  resourceId: string;
  limit?: number;
  offset?: number;
  /** Equality filters, e.g. { "קוד": 3167 }. */
  filters?: Record<string, string | number>;
  /** Free-text search across the row. */
  q?: string;
  /** Restrict returned fields. */
  fields?: string[];
  distinct?: boolean;
}

/** Build a datastore_search URL. Kept pure so it is unit-testable offline. */
export function buildDatastoreSearchUrl(p: DatastoreSearchParams): string {
  const url = new URL(`${BASE}/datastore_search`);
  url.searchParams.set('resource_id', p.resourceId);
  url.searchParams.set('limit', String(p.limit ?? 1000));
  if (p.offset) url.searchParams.set('offset', String(p.offset));
  if (p.q) url.searchParams.set('q', p.q);
  if (p.fields?.length) url.searchParams.set('fields', p.fields.join(','));
  if (p.distinct) url.searchParams.set('distinct', 'true');
  if (p.filters) url.searchParams.set('filters', JSON.stringify(p.filters));
  return url.toString();
}

export function buildPackageShowUrl(packageId: string): string {
  const url = new URL(`${BASE}/package_show`);
  url.searchParams.set('id', packageId);
  return url.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal rate limiter: at most one request per `minIntervalMs`. */
export class RateLimiter {
  private last = 0;
  constructor(private readonly minIntervalMs = 1000) {}
  async wait(): Promise<void> {
    const now = Date.now();
    const waitMs = this.last + this.minIntervalMs - now;
    if (waitMs > 0) await sleep(waitMs);
    this.last = Date.now();
  }
}

export interface FetchDeps {
  fetch: typeof fetch;
  limiter?: RateLimiter;
  /** Called with every raw JSON body for immutable archival (R2). */
  onRawResponse?: (url: string, body: string) => Promise<void> | void;
}

async function getJson<T>(url: string, deps: FetchDeps): Promise<T> {
  await (deps.limiter ?? new RateLimiter()).wait();
  const res = await deps.fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const body = await res.text();
  await deps.onRawResponse?.(url, body);
  if (res.status === 403) {
    throw new Error(`data.gov.il returned 403 for ${url} — record as unavailable, do not bypass.`);
  }
  if (!res.ok) throw new Error(`data.gov.il ${res.status} for ${url}`);
  const parsed = JSON.parse(body) as { success: boolean; result: T };
  if (!parsed.success) throw new Error(`data.gov.il success=false for ${url}`);
  return parsed.result;
}

export async function packageShow(packageId: string, deps: FetchDeps): Promise<CkanResource[]> {
  const result = await getJson<{ resources: CkanResource[] }>(buildPackageShowUrl(packageId), deps);
  return result.resources;
}

export interface DatastorePage<T> {
  records: T[];
  total: number;
}

export async function datastoreSearch<T = Record<string, unknown>>(
  p: DatastoreSearchParams,
  deps: FetchDeps,
): Promise<DatastorePage<T>> {
  return getJson<DatastorePage<T>>(buildDatastoreSearchUrl(p), deps);
}

/** Async generator that pages through an entire resource, 1 req/s. */
export async function* iterateResource<T = Record<string, unknown>>(
  params: Omit<DatastoreSearchParams, 'offset'>,
  deps: FetchDeps,
): AsyncGenerator<T, void, void> {
  const limit = params.limit ?? 1000;
  let offset = 0;
  for (;;) {
    const page = await datastoreSearch<T>({ ...params, offset }, deps);
    for (const rec of page.records) yield rec;
    offset += page.records.length;
    if (page.records.length < limit || offset >= page.total) break;
  }
}
