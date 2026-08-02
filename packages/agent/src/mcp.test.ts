import { describe, it, expect } from 'vitest';
import { MCP_TOOLS, dispatchTool, RateLimiter, McpError, type KesefReadSource } from './mcp';

const withSources = (data: unknown) => async () => ({ data, sources: ['doc-1'] });
const source: KesefReadSource = {
  getAuthority: withSources({ symbol: 2034 }),
  queryBudget: withSources({ total: 1000 }),
  compareAuthorities: withSources([{ symbol: 2034 }]),
  getVendor: withSources({ name: 'ספק' }),
  searchDocuments: withSources([{ chunk: '...' }]),
  getAlerts: withSources([]),
  runResearch: withSources({ title: 'דוח' }),
};

describe('public MCP server (task 42)', () => {
  it('exposes exactly the 7 documented tools', () => {
    expect(MCP_TOOLS.map((t) => t.name).sort()).toEqual(
      ['compare_authorities', 'get_alerts', 'get_authority', 'get_vendor', 'query_budget', 'run_research', 'search_documents'],
    );
  });

  it('every tool response includes sources', async () => {
    for (const tool of MCP_TOOLS) {
      const args = { symbol: 2034, year: 2024, symbols: [2034], metric: 'x', registrationId: '1', query: {} };
      const res = await dispatchTool(tool.name, args, source);
      expect(res.sources, tool.name).toContain('doc-1');
    }
  });

  it('rejects an unknown tool', async () => {
    await expect(dispatchTool('drop_table', {}, source)).rejects.toBeInstanceOf(McpError);
  });

  it('is read-only — no tool name implies a mutation', () => {
    for (const t of MCP_TOOLS) {
      expect(/create|update|delete|insert|write|set_/.test(t.name)).toBe(false);
    }
  });

  it('rate limiter blocks past the window cap', () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow(0)).toBe(true);
    expect(rl.allow(100)).toBe(true);
    expect(rl.allow(200)).toBe(false); // 3rd within window
    expect(rl.allow(1300)).toBe(true); // window elapsed
  });
});
