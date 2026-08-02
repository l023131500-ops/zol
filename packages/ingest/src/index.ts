/**
 * @kesef/ingest — source connectors (Wave 2).
 *
 * Fetch → hash → dedupe → store(R2) → classify → parse → validate.
 * Connectors to build: data.gov.il (task 13), obudget (task 20),
 * National Insurance + CBS (task 22), authority-website crawler (task 37).
 *
 * Guardrails: max 1 request/second per domain, identified User-Agent,
 * never bypass 403 / CAPTCHA / robots.txt — record status and mark unavailable.
 */

export interface SyncResult {
  sourceSlug: string;
  rowsIn: number;
  rowsWritten: number;
  rowsRejected: number;
  status: 'ok' | 'partial' | 'failed';
}

export const INGEST_PLACEHOLDER = true;
