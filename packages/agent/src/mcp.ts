/**
 * Public MCP server core (SPEC part ב §7; Build task 42). Exposes the warehouse
 * as read-only tools. Every response includes its sources; there are NO write
 * tools. A transport (stdio/http) wraps this registry; the core is pure so it
 * is unit-tested.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResponse {
  data: unknown;
  /** source_document ids backing the response — always present. */
  sources: string[];
}

/**
 * Read-only data surface the MCP tools call. Implemented over Supabase in the
 * server; faked in tests. No method mutates anything.
 */
export interface KesefReadSource {
  getAuthority(symbol: number): Promise<{ data: unknown; sources: string[] }>;
  queryBudget(symbol: number, year: number, topic?: string): Promise<{ data: unknown; sources: string[] }>;
  compareAuthorities(symbols: number[], metric: string, year: number): Promise<{ data: unknown; sources: string[] }>;
  getVendor(registrationId: string): Promise<{ data: unknown; sources: string[] }>;
  searchDocuments(query: string): Promise<{ data: unknown; sources: string[] }>;
  getAlerts(symbol: number): Promise<{ data: unknown; sources: string[] }>;
  runResearch(query: unknown): Promise<{ data: unknown; sources: string[] }>;
}

const num = { type: 'number' };
const str = { type: 'string' };

export const MCP_TOOLS: readonly McpTool[] = [
  { name: 'get_authority', description: 'פרטי רשות לפי סמל', inputSchema: { type: 'object', properties: { symbol: num }, required: ['symbol'] } },
  { name: 'query_budget', description: 'נתוני תקציב לרשות לפי שנה ונושא', inputSchema: { type: 'object', properties: { symbol: num, year: num, topic: str }, required: ['symbol', 'year'] } },
  { name: 'compare_authorities', description: 'השוואת רשויות לפי מדד ושנה', inputSchema: { type: 'object', properties: { symbols: { type: 'array', items: num }, metric: str, year: num }, required: ['symbols', 'metric', 'year'] } },
  { name: 'get_vendor', description: 'ספק והזכיות שלו לפי ח"פ/ע"ר', inputSchema: { type: 'object', properties: { registrationId: str }, required: ['registrationId'] } },
  { name: 'search_documents', description: 'חיפוש סמנטי במסמכי המקור', inputSchema: { type: 'object', properties: { query: str }, required: ['query'] } },
  { name: 'get_alerts', description: 'תמרורי אזהרה פומביים לרשות', inputSchema: { type: 'object', properties: { symbol: num }, required: ['symbol'] } },
  { name: 'run_research', description: 'הפקת דוח מחקר לפי בורר', inputSchema: { type: 'object', properties: { query: { type: 'object' } }, required: ['query'] } },
];

export class RateLimiter {
  private hits: number[] = [];
  constructor(private readonly max = 60, private readonly windowMs = 60_000) {}
  allow(now: number): boolean {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}

export class McpError extends Error {}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  source: KesefReadSource,
): Promise<ToolResponse> {
  switch (name) {
    case 'get_authority':
      return source.getAuthority(Number(args.symbol));
    case 'query_budget':
      return source.queryBudget(Number(args.symbol), Number(args.year), args.topic as string | undefined);
    case 'compare_authorities':
      return source.compareAuthorities(args.symbols as number[], String(args.metric), Number(args.year));
    case 'get_vendor':
      return source.getVendor(String(args.registrationId));
    case 'search_documents':
      return source.searchDocuments(String(args.query));
    case 'get_alerts':
      return source.getAlerts(Number(args.symbol));
    case 'run_research':
      return source.runResearch(args.query);
    default:
      throw new McpError(`כלי לא ידוע: ${name}`);
  }
}
