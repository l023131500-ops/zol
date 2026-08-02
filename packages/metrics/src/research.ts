/**
 * On-demand research engine (SPEC part ב §5; Build task 36) — the central
 * feature. NOT a live web agent: an assembly engine over ready data.
 *
 * Pipeline (LLM only at stage 5, which receives computed JSON ONLY):
 *   1 Resolve  → scope to authorities/years/codes
 *   2 Fetch    → aggregate queries on fact tables (via FactProvider)
 *   3 Compute  → normalize, peer group, deltas, trends
 *   4 Detect   → run the alert engine on the result
 *   5 Narrate  → LLM writes a summary FROM THE RESULT ONLY (empty ⇒ "no data")
 *   6 Render   → assemble the report blocks
 *
 * Anti-hallucination: if the fetched result is empty the narration is a fixed
 * "no data for this selection" string and the LLM is never called.
 */

export type ResearchLevel = 'national' | 'district' | 'cluster' | 'authority' | 'institution';
export type TopicId =
  | 'education'
  | 'welfare'
  | 'culture'
  | 'religion'
  | 'infrastructure'
  | 'security'
  | 'sanitation'
  | 'administration'
  | 'debt'
  | 'all';
export type Normalization = 'absolute' | 'per_capita' | 'per_child' | 'per_pupil' | 'pct_of_budget';

export interface ResearchQuery {
  scope: { level: ResearchLevel; ids: string[]; peerGroup?: boolean };
  topics: TopicId[];
  years: { from: number; to: number };
  fundingSource?: ('self' | 'balancing_grant' | 'ministry' | 'loan' | 'pais' | 'donation' | 'grant_call')[];
  expenseType?: 'regular' | 'tabar' | 'both';
  normalize?: Normalization;
  includeSatellites?: boolean;
}

export interface FactAggregate {
  authoritySymbol: number;
  authorityName: string;
  year: number;
  topic: TopicId;
  value: number;
  sourceDocumentId: string;
}

export interface ResolvedScope {
  authoritySymbols: number[];
  years: number[];
}

export interface FactProvider {
  resolveScope(scope: ResearchQuery['scope'], years: ResearchQuery['years']): Promise<ResolvedScope>;
  fetchFacts(resolved: ResolvedScope, topics: TopicId[]): Promise<FactAggregate[]>;
}

export type NarrateFn = (computed: ComputedResult) => Promise<string>;

export interface SuperNumber {
  label: string;
  value: number;
  context: string;
}

export interface ComputedResult {
  superNumbers: SuperNumber[];
  totalsByTopic: { topic: TopicId; total: number }[];
  yearsCovered: number[];
  authorityCount: number;
  facts: FactAggregate[];
}

export interface ReportSection {
  id: string;
  title: string;
}

export interface ResearchReport {
  title: string;
  superNumbers: SuperNumber[];
  summary: string;
  totalsByTopic: { topic: TopicId; total: number }[];
  missing: string[];
  sources: string[];
  sections: ReportSection[];
  isEmpty: boolean;
}

const EMPTY_NARRATION = 'אין נתונים לבחירה זו.';

/** Deterministic hash for report_cache (stable, order-independent on arrays). */
export function queryHash(q: ResearchQuery): string {
  const norm = {
    scope: { level: q.scope.level, ids: [...q.scope.ids].sort(), peerGroup: !!q.scope.peerGroup },
    topics: [...q.topics].sort(),
    years: q.years,
    fundingSource: q.fundingSource ? [...q.fundingSource].sort() : undefined,
    expenseType: q.expenseType ?? 'both',
    normalize: q.normalize ?? 'absolute',
    includeSatellites: !!q.includeSatellites,
  };
  const json = JSON.stringify(norm);
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) >>> 0;
  return `rq_${h.toString(16)}`;
}

function compute(facts: FactAggregate[]): ComputedResult {
  const totals = new Map<TopicId, number>();
  const years = new Set<number>();
  const authorities = new Set<number>();
  for (const f of facts) {
    totals.set(f.topic, (totals.get(f.topic) ?? 0) + f.value);
    years.add(f.year);
    authorities.add(f.authoritySymbol);
  }
  const totalsByTopic = [...totals.entries()]
    .map(([topic, total]) => ({ topic, total }))
    .sort((a, b) => b.total - a.total);
  const grand = totalsByTopic.reduce((s, t) => s + t.total, 0);

  const superNumbers: SuperNumber[] = [
    { label: 'סך הכול בבחירה', value: grand, context: `על פני ${authorities.size} רשויות ו-${years.size} שנים` },
    ...(totalsByTopic[0] ? [{ label: `הנושא הגדול ביותר: ${totalsByTopic[0].topic}`, value: totalsByTopic[0].total, context: 'הסכום המצטבר' }] : []),
  ];

  return {
    superNumbers,
    totalsByTopic,
    yearsCovered: [...years].sort(),
    authorityCount: authorities.size,
    facts,
  };
}

/** Run the full pipeline. `narrate` is the injected LLM step (stubbed in tests). */
export async function runResearch(
  query: ResearchQuery,
  deps: { provider: FactProvider; narrate: NarrateFn },
): Promise<ResearchReport> {
  const resolved = await deps.provider.resolveScope(query.scope, query.years); // 1
  const facts = await deps.provider.fetchFacts(resolved, query.topics); // 2
  const computed = compute(facts); // 3 (+4 detection would run here)

  const isEmpty = facts.length === 0;
  const summary = isEmpty ? EMPTY_NARRATION : await deps.narrate(computed); // 5 — LLM skipped if empty

  const requestedYears = Array.from(
    { length: query.years.to - query.years.from + 1 },
    (_, i) => query.years.from + i,
  );
  const missingYears = requestedYears.filter((y) => !computed.yearsCovered.includes(y));
  const missing = [
    ...(isEmpty ? ['לא נמצאו נתונים לבחירה זו'] : []),
    ...(missingYears.length ? [`שנים ללא נתונים: ${missingYears.join(', ')}`] : []),
  ];

  const sources = [...new Set(facts.map((f) => f.sourceDocumentId))];

  return {
    title: `דוח מחקר — ${query.topics.join(', ')} · ${query.years.from}–${query.years.to}`,
    superNumbers: computed.superNumbers,
    summary,
    totalsByTopic: computed.totalsByTopic,
    missing,
    sources,
    sections: [
      { id: 'summary', title: 'סיכום' },
      { id: 'chart', title: 'גרף ראשי' },
      { id: 'peers', title: 'השוואה לקבוצת שווים' },
      { id: 'alerts', title: 'תמרורי אזהרה' },
      { id: 'table', title: 'פירוט טבלאי' },
      { id: 'missing', title: 'מה חסר' },
      { id: 'sources', title: 'מקורות' },
    ],
    isEmpty,
  };
}
