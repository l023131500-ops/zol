/**
 * Supabase implementation of DbWriter (used by the egress sync run).
 * Writes go through the service-role client into the kesef schema. All inserts
 * are batched; source_document rows are the immutable api_snapshot provenance.
 */
import { createServiceDb } from '@kesef/db';
import type { DbWriter, FactInsert } from './sync-financial';

/**
 * Loosely-typed handle for the ETL runner: the hand-written Database type only
 * models the app's read tables, while the writer touches sync_run /
 * source_document / fact_financial inserts. Once `supabase gen types` is run
 * against the live project this cast can be dropped.
 */
type LooseDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function createSupabaseWriter(sourceSlug: string): DbWriter {
  const db = createServiceDb() as unknown as LooseDb;

  async function sourceIdForSlug(slug: string): Promise<string> {
    const { data, error } = await db.from('data_source').select('id').eq('slug', slug).maybeSingle();
    if (error || !data) throw new Error(`data_source '${slug}' not found`);
    return (data as { id: string }).id;
  }

  return {
    async startSyncRun(slug) {
      const sourceId = await sourceIdForSlug(slug);
      const { data, error } = await db
        .from('sync_run')
        .insert({ source_id: sourceId, status: 'running' })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async createApiSnapshot(input) {
      const sourceId = await sourceIdForSlug(sourceSlug);
      const { data, error } = await db
        .from('source_document')
        .insert({
          source_id: sourceId,
          r2_key: `api_snapshot/${input.sha256}`,
          sha256: input.sha256,
          doc_type: 'api_snapshot',
          url: input.url,
          fetched_at: input.fetchedAt,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async authorityIdBySymbol(symbol) {
      const { data } = await db.from('authority').select('id').eq('symbol', symbol).maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    },

    async knownCoaCodes() {
      const { data } = await db.from('chart_of_accounts').select('code');
      return new Set(((data as { code: number }[] | null) ?? []).map((r) => r.code));
    },

    async knownAuthoritySymbols() {
      const { data } = await db.from('authority').select('symbol');
      return new Set(((data as { symbol: number }[] | null) ?? []).map((r) => r.symbol));
    },

    async insertFactsBatch(rows: FactInsert[]) {
      if (rows.length === 0) return 0;
      const payload = rows.map((r) => ({
        authority_id: r.authority_id,
        fiscal_year: r.fiscal_year,
        coa_code: r.coa_code,
        moi_code: r.moi_code,
        sheet_name: r.sheet_name,
        row_label: r.row_label,
        column_label: r.column_label,
        measure: r.measure,
        value: r.value,
        source_document_id: r.source_document_id,
        extraction_method: r.extraction_method,
      }));
      const { error } = await db.from('fact_financial').insert(payload);
      if (error) throw error;
      return rows.length;
    },

    async finishSyncRun(runId, r) {
      await db
        .from('sync_run')
        .update({
          status: r.status,
          rows_in: r.rowsIn,
          rows_written: r.rowsWritten,
          rows_rejected: r.rowsRejected,
          message: r.message ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    },
  };
}
