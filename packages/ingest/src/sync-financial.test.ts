import { describe, it, expect, vi } from 'vitest';
import { syncFinancial, type DbWriter, type FactInsert } from './sync-financial';
import { buildCodeMap, MOI_CODE_MAP_SEED } from '@kesef/normalize';
import { buildDatastoreSearchUrl, type FetchDeps } from './datagov';

/** Two 2024 EAV rows for Hatzor: one maps (3167 white-book), one does not. */
const HATZOR_ROWS = [
  { שם_רשות: 'חצור הגלילית', שנת_דוח: 2024, גליון: 'ספר לבן', קוד_למס: 2034, קוד_רשות: '90000.0', שורה: 'משכורות ושכר', עמודה: 'ביצוע שנה נוכחית', קוד: 3167, ערך: 1000000 },
  { שם_רשות: 'חצור הגלילית', שנת_דוח: 2024, גליון: 'ספר לבן', קוד_למס: 2034, קוד_רשות: '90000.0', שורה: 'משהו אחר', עמודה: 'ביצוע שנה נוכחית', קוד: 9999, ערך: 5 },
  { שם_רשות: 'עיר אחרת', שנת_דוח: 2024, גליון: 'ספר לבן', קוד_למס: 5000, קוד_רשות: '1.0', שורה: 'משכורות ושכר', עמודה: 'ביצוע שנה נוכחית', קוד: 3167, ערך: 999 },
];

function fetchDeps(): FetchDeps {
  const url = buildDatastoreSearchUrl({ resourceId: 'r2024', limit: 1000, offset: 0 });
  const pages: Record<string, unknown> = { [url]: { records: HATZOR_ROWS, total: HATZOR_ROWS.length } };
  return {
    fetch: (async (u: string) =>
      new Response(JSON.stringify({ success: true, result: pages[String(u)] ?? { records: [], total: 0 } }), {
        status: 200,
      })) as unknown as typeof fetch,
  };
}

function fakeWriter() {
  const inserted: FactInsert[] = [];
  const finished: unknown[] = [];
  const snapshots: unknown[] = [];
  const writer: DbWriter = {
    startSyncRun: vi.fn(async () => 'run-1'),
    createApiSnapshot: vi.fn(async (i) => {
      snapshots.push(i);
      return 'src-doc-1';
    }),
    authorityIdBySymbol: vi.fn(async (s) => (s === 2034 ? 'auth-2034' : null)),
    knownCoaCodes: vi.fn(async () => new Set([6111])),
    knownAuthoritySymbols: vi.fn(async () => new Set([2034])),
    insertFactsBatch: vi.fn(async (rows) => {
      inserted.push(...rows);
      return rows.length;
    }),
    finishSyncRun: vi.fn(async (_id, r) => {
      finished.push(r);
    }),
  };
  return { writer, inserted, finished, snapshots };
}

describe('financial sync pipeline (tasks 13/17/19)', () => {
  it('stores only mapped in-scope facts, all pointing at one api_snapshot', async () => {
    const { writer, inserted, finished, snapshots } = fakeWriter();
    const out = await syncFinancial(
      {
        sourceSlug: 'data_gov_local_authorities',
        resourceId: 'r2024',
        resourceUrl: 'https://data.gov.il/…/r2024',
        year: 2024,
        authoritySymbols: [2034],
        map: buildCodeMap(MOI_CODE_MAP_SEED),
      },
      { ...fetchDeps(), writer, hash: (s) => `sha256:${s.length}` },
    );

    // one mapped Hatzor row → one fact; the unmapped Hatzor row is rejected;
    // the other city is out of scope (skipped, not rejected).
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.coa_code).toBe(6111);
    expect(inserted[0]!.authority_id).toBe('auth-2034');
    expect(inserted[0]!.source_document_id).toBe('src-doc-1'); // provenance (point א)
    expect(snapshots).toHaveLength(1); // exactly one api_snapshot per run

    expect(out.rowsWritten).toBe(1);
    expect(out.rowsRejected).toBe(1); // the unmapped code 9999
    expect(out.status).toBe('partial');
    expect(finished).toHaveLength(1);
  });

  it('marks the run failed if fetch throws, and still finishes the sync_run', async () => {
    const { writer, finished } = fakeWriter();
    const badFetch: FetchDeps = {
      fetch: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    };
    const out = await syncFinancial(
      {
        sourceSlug: 's',
        resourceId: 'r',
        resourceUrl: 'u',
        year: 2024,
        authoritySymbols: [2034],
        map: buildCodeMap(MOI_CODE_MAP_SEED),
      },
      { ...badFetch, writer, hash: (s) => s },
    );
    expect(out.status).toBe('failed');
    expect(finished).toHaveLength(1);
  });
});
