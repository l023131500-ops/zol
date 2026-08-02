import { describe, it, expect } from 'vitest';
import {
  buildDatastoreSearchUrl,
  buildPackageShowUrl,
  packageShow,
  iterateResource,
  type FetchDeps,
} from './datagov';

describe('data.gov.il URL building', () => {
  it('never emits a datastore_search_sql endpoint', () => {
    const url = buildDatastoreSearchUrl({ resourceId: 'r1', filters: { קוד: 3167 }, limit: 300 });
    expect(url).toContain('/datastore_search?');
    expect(url).not.toContain('datastore_search_sql');
  });

  it('encodes filters as JSON and preserves Hebrew keys', () => {
    const url = buildDatastoreSearchUrl({ resourceId: 'r1', filters: { קוד: 3167 } });
    const parsed = new URL(url);
    expect(JSON.parse(parsed.searchParams.get('filters')!)).toEqual({ קוד: 3167 });
  });

  it('builds package_show url', () => {
    expect(buildPackageShowUrl('local-authorities')).toContain('package_show?id=local-authorities');
  });
});

/** A tiny fake fetch so the connector logic is testable without egress. */
function fakeDeps(pages: Record<string, unknown>): FetchDeps {
  return {
    fetch: (async (url: string) =>
      new Response(JSON.stringify({ success: true, result: pages[String(url)] ?? {} }), {
        status: 200,
      })) as unknown as typeof fetch,
  };
}

describe('data.gov.il connector logic', () => {
  it('packageShow returns resources', async () => {
    const url = buildPackageShowUrl('local-authorities');
    const deps = fakeDeps({ [url]: { resources: [{ id: 'r1', name: '2024', format: 'CSV' }] } });
    const resources = await packageShow('local-authorities', deps);
    expect(resources).toHaveLength(1);
    expect(resources[0]!.id).toBe('r1');
  });

  it('iterateResource pages until total is reached', async () => {
    const p0 = buildDatastoreSearchUrl({ resourceId: 'r1', limit: 2, offset: 0 });
    const p1 = buildDatastoreSearchUrl({ resourceId: 'r1', limit: 2, offset: 2 });
    const deps = fakeDeps({
      [p0]: { records: [{ i: 1 }, { i: 2 }], total: 3 },
      [p1]: { records: [{ i: 3 }], total: 3 },
    });
    const out: number[] = [];
    for await (const rec of iterateResource<{ i: number }>({ resourceId: 'r1', limit: 2 }, deps)) {
      out.push(rec.i);
    }
    expect(out).toEqual([1, 2, 3]);
  });
});
