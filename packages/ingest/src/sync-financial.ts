/**
 * Financial sync pipeline (Build tasks 13/17/19). Runs in the egress session.
 *
 * fetch → api_snapshot(source_document) → normalize (schema-drift) → validate
 * → pivot (only mapped rows) → batch insert into fact_financial.
 *
 * Provenance (point א): API data is not a PDF, so each run creates ONE
 * source_document of doc_type 'api_snapshot' (url + sha256 + fetched_at); every
 * fact from the run references it (source_document_id is NOT NULL).
 * Volume (point ב): inserts are batched; unmapped rows are counted, not stored.
 */
import { iterateResource, type FetchDeps } from './datagov';
import { normalizeReportRow, type RawReportRow } from '@kesef/normalize';
import { pivotRow, type CodeMap, type FactRow } from '@kesef/normalize';
import { checkYearRange, checkAuthoritySymbol } from '@kesef/normalize';

export interface FactInsert extends FactRow {
  source_document_id: string;
  authority_id: string;
  extraction_method: 'api';
}

export interface DbWriter {
  startSyncRun(sourceSlug: string): Promise<string>;
  /** Creates the immutable api_snapshot source_document; returns its id. */
  createApiSnapshot(input: { url: string; sha256: string; fetchedAt: string }): Promise<string>;
  authorityIdBySymbol(symbol: number): Promise<string | null>;
  knownCoaCodes(): Promise<Set<number>>;
  knownAuthoritySymbols(): Promise<Set<number>>;
  insertFactsBatch(rows: FactInsert[]): Promise<number>;
  finishSyncRun(
    runId: string,
    r: { status: 'ok' | 'partial' | 'failed'; rowsIn: number; rowsWritten: number; rowsRejected: number; message?: string },
  ): Promise<void>;
}

export interface SyncOptions {
  sourceSlug: string;
  resourceId: string;
  resourceUrl: string;
  year: number;
  /** Only these authorities are loaded (first-load scope: Hatzor + peers). */
  authoritySymbols: number[];
  map: CodeMap;
  batchSize?: number;
}

export interface SyncDeps extends FetchDeps {
  writer: DbWriter;
  hash: (s: string) => string;
}

export interface SyncOutcome {
  rowsIn: number;
  rowsWritten: number;
  rowsRejected: number;
  status: 'ok' | 'partial' | 'failed';
}

export async function syncFinancial(opts: SyncOptions, deps: SyncDeps): Promise<SyncOutcome> {
  const batchSize = opts.batchSize ?? 2000;
  const targets = new Set(opts.authoritySymbols);
  const runId = await deps.writer.startSyncRun(opts.sourceSlug);

  let rowsIn = 0;
  let rowsWritten = 0;
  let rowsRejected = 0;
  const bodies: string[] = [];

  try {
    const knownCoa = await deps.writer.knownCoaCodes();
    const knownAuth = await deps.writer.knownAuthoritySymbols();

    // Capture raw bodies for the immutable snapshot hash.
    const capturingDeps: SyncDeps = {
      ...deps,
      onRawResponse: async (url, body) => {
        bodies.push(body);
        await deps.onRawResponse?.(url, body);
      },
    };

    const rawRows: RawReportRow[] = [];
    for await (const rec of iterateResource<RawReportRow>(
      { resourceId: opts.resourceId, limit: 1000 },
      capturingDeps,
    )) {
      rawRows.push(rec);
    }

    const sha256 = deps.hash(bodies.join('\n'));
    const sourceDocId = await deps.writer.createApiSnapshot({
      url: opts.resourceUrl,
      sha256,
      fetchedAt: new Date().toISOString(),
    });

    const authorityIdCache = new Map<number, string | null>();
    let batch: FactInsert[] = [];

    for (const raw of rawRows) {
      rowsIn += 1;
      let normalized;
      try {
        normalized = normalizeReportRow(opts.year, raw);
      } catch {
        rowsRejected += 1;
        continue;
      }
      if (!targets.has(normalized.authoritySymbol)) continue; // out of scope, not rejected

      // validation gates
      if (checkYearRange(normalized.reportYear) || checkAuthoritySymbol(normalized.authoritySymbol, knownAuth)) {
        rowsRejected += 1;
        continue;
      }

      const fact = pivotRow(normalized, opts.map);
      if (!fact || !knownCoa.has(fact.coa_code)) {
        rowsRejected += 1; // volume rule: unmapped rows are never stored
        continue;
      }

      let authId = authorityIdCache.get(fact.authority_symbol);
      if (authId === undefined) {
        authId = await deps.writer.authorityIdBySymbol(fact.authority_symbol);
        authorityIdCache.set(fact.authority_symbol, authId);
      }
      if (!authId) {
        rowsRejected += 1;
        continue;
      }

      batch.push({ ...fact, source_document_id: sourceDocId, authority_id: authId, extraction_method: 'api' });
      if (batch.length >= batchSize) {
        rowsWritten += await deps.writer.insertFactsBatch(batch);
        batch = [];
      }
    }
    if (batch.length > 0) rowsWritten += await deps.writer.insertFactsBatch(batch);

    const status = rowsRejected > 0 ? 'partial' : 'ok';
    await deps.writer.finishSyncRun(runId, { status, rowsIn, rowsWritten, rowsRejected });
    return { rowsIn, rowsWritten, rowsRejected, status };
  } catch (err) {
    await deps.writer.finishSyncRun(runId, {
      status: 'failed',
      rowsIn,
      rowsWritten,
      rowsRejected,
      message: err instanceof Error ? err.message : String(err),
    });
    return { rowsIn, rowsWritten, rowsRejected, status: 'failed' };
  }
}
