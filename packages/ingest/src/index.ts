/**
 * @kesef/ingest — source connectors (Wave 2).
 * Guardrails: max 1 req/s per domain, identified User-Agent, never bypass
 * 403 / CAPTCHA / robots.txt — record status and mark unavailable.
 */
export * from './datagov';
export * from './sync-financial';
export * from './packages';
export * from './supabase-writer';

export interface SyncResult {
  sourceSlug: string;
  rowsIn: number;
  rowsWritten: number;
  rowsRejected: number;
  status: 'ok' | 'partial' | 'failed';
}
