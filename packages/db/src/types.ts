/**
 * Hand-authored types mirroring migrations/0001_init.sql.
 * Once a live Supabase project exists, replace with generated types:
 *   supabase gen types typescript --project-id <id> > src/types.ts
 * Until then these keep the app type-safe against the canonical schema.
 */

export type SourceKind = 'api' | 'bulk_file' | 'scrape' | 'foi_response' | 'manual_upload';
export type AuthorityStatus = 'municipality' | 'local_council' | 'regional_council';
export type ValueStatusDb = 'reported' | 'calculated' | 'estimated';
export type ExtractionMethod = 'api' | 'regex' | 'llm' | 'manual';
export type AlertSeverityDb = 'info' | 'notice' | 'high';
export type UserRole =
  | 'resident'
  | 'activist'
  | 'council_member'
  | 'journalist'
  | 'municipality_admin'
  | 'staff'
  | 'superadmin';

export interface Authority {
  id: string;
  symbol: number;
  name_he: string;
  name_variants: string[];
  status: AuthorityStatus;
  district: string | null;
  socio_economic_cluster: number | null;
  peripherality_cluster: number | null;
  population: number | null;
  pct_children: number | null;
  pct_elderly: number | null;
  website_url: string | null;
  financial_status: string | null;
}

export interface ChartOfAccount {
  code: number;
  level: number;
  parent_code: number | null;
  name_he: string;
  plain_he: string | null;
  flow: 'receipt' | 'payment';
  topic: string | null;
  is_leaf: boolean;
}

export interface FactFinancial {
  id: string;
  authority_id: string;
  fiscal_year: number;
  coa_code: number | null;
  measure: string;
  value: number;
  unit: string;
  source_document_id: string;
  page_number: number | null;
  extraction_method: ExtractionMethod;
  value_status: ValueStatusDb;
  calculation_formula: string | null;
  superseded_by: string | null;
}

export interface Alert {
  id: string;
  authority_id: string;
  fiscal_year: number | null;
  rule_key: string;
  severity: AlertSeverityDb;
  statement_he: string;
  measured_value: number | null;
  reference_value: number | null;
  delta_pct: number | null;
  methodology_url: string;
  notified_at: string | null;
  response_text: string | null;
  response_published_at: string | null;
  is_public: boolean;
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  authority_id: string | null;
}

/**
 * Minimal Database shape consumed by the typed Supabase client.
 * kesef objects live in the `kesef` schema (see migration 0003), so the app
 * client is created with { db: { schema: 'kesef' } } and this schema key.
 */
export const KESEF_SCHEMA = 'kesef' as const;

export interface Database {
  kesef: {
    Tables: {
      authority: { Row: Authority };
      chart_of_accounts: { Row: ChartOfAccount };
      fact_financial: { Row: FactFinancial };
      alert: { Row: Alert };
      app_user: { Row: AppUser };
      data_source: { Row: { slug: string; display_name: string; sync_frequency: string | null; last_ok_at: string | null } };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
