/**
 * Egress sync entry point (Build tasks 14/17/19/23). Run by .github/workflows/
 * sync.yml or manually with the Supabase service key + network access.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… tsx scripts/sync.ts
 *
 * Scope (approved): Hatzor (2034) + peers, 2020–2024, across the four packages,
 * with cross-package dedup. Not runnable in the restricted build env (no
 * egress); see docs/PENDING_LIVE_RUN.md.
 */
import { createHash } from 'node:crypto';
import {
  packagesForYear,
  resolveResourceId,
  syncFinancial,
  dedupeFacts,
  RateLimiter,
  USER_AGENT,
  createSupabaseWriter,
} from '../src/index';
import { buildCodeMap, MOI_CODE_MAP_SEED } from '@kesef/normalize';

const HATZOR = 2034;
const YEARS = [2020, 2021, 2022, 2023, 2024];

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('Missing Supabase env — see docs/PENDING_LIVE_RUN.md');
    process.exit(1);
  }

  // TODO(egress session): resolve Hatzor's peer-group symbols and add them here.
  const authoritySymbols = [HATZOR];
  const map = buildCodeMap(MOI_CODE_MAP_SEED);
  const limiter = new RateLimiter(1000);
  const fetchDeps = { fetch, limiter };

  for (const year of YEARS) {
    for (const pkg of packagesForYear(year)) {
      const resourceId = await resolveResourceId(pkg.id, year, fetchDeps);
      if (!resourceId) {
        console.warn(`no resource for ${pkg.id} ${year} — skipping`);
        continue;
      }
      const writer = createSupabaseWriter(
        pkg.id === 'audit-cities' ? 'data_gov_audit_cities' : 'data_gov_local_authorities',
      );
      const outcome = await syncFinancial(
        {
          sourceSlug: pkg.id,
          resourceId,
          resourceUrl: `https://data.gov.il/dataset/${pkg.id}`,
          year,
          authoritySymbols,
          map,
        },
        { ...fetchDeps, writer, hash: sha256 },
      );
      console.log(`${pkg.id} ${year}:`, JSON.stringify(outcome));
    }
  }
  // Cross-package dedup is applied per (symbol, year, coa, measure) — see
  // dedupeFacts — before the metrics/alert engines run over the loaded facts.
  void dedupeFacts;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
