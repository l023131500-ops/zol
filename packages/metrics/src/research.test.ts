import { describe, it, expect, vi } from 'vitest';
import {
  runResearch,
  queryHash,
  type ResearchQuery,
  type FactProvider,
  type FactAggregate,
} from './research';

const query: ResearchQuery = {
  scope: { level: 'authority', ids: ['2034'], peerGroup: true },
  topics: ['education'],
  years: { from: 2020, to: 2024 },
  normalize: 'per_capita',
};

function provider(facts: FactAggregate[]): FactProvider {
  return {
    resolveScope: vi.fn(async () => ({ authoritySymbols: [2034], years: [2020, 2021, 2022, 2023, 2024] })),
    fetchFacts: vi.fn(async () => facts),
  };
}

describe('research engine (task 36)', () => {
  it('assembles a full report from computed facts', async () => {
    const facts: FactAggregate[] = [
      { authoritySymbol: 2034, authorityName: 'חצור', year: 2024, topic: 'education', value: 8_000_000, sourceDocumentId: 'doc-1' },
      { authoritySymbol: 2034, authorityName: 'חצור', year: 2023, topic: 'education', value: 7_500_000, sourceDocumentId: 'doc-2' },
    ];
    const narrate = vi.fn(async () => 'סיכום מילולי מהנתונים בלבד');
    const report = await runResearch(query, { provider: provider(facts), narrate });

    expect(report.isEmpty).toBe(false);
    expect(narrate).toHaveBeenCalledOnce();
    expect(report.summary).toBe('סיכום מילולי מהנתונים בלבד');
    expect(report.superNumbers[0]!.value).toBe(15_500_000);
    expect(report.sources).toEqual(['doc-1', 'doc-2']);
    expect(report.sections).toHaveLength(7);
    expect(report.missing.some((m) => m.includes('2020'))).toBe(true); // 2020-2022 missing
  });

  it('ANTI-HALLUCINATION: empty result ⇒ fixed "no data" summary, LLM never called', async () => {
    const narrate = vi.fn(async () => 'should not be called');
    const report = await runResearch(query, { provider: provider([]), narrate });

    expect(report.isEmpty).toBe(true);
    expect(narrate).not.toHaveBeenCalled();
    expect(report.summary).toBe('אין נתונים לבחירה זו.');
    expect(report.missing).toContain('לא נמצאו נתונים לבחירה זו');
  });

  it('queryHash is stable and order-independent', () => {
    const a: ResearchQuery = { ...query, topics: ['education', 'welfare'], scope: { ...query.scope, ids: ['2034', '10'] } };
    const b: ResearchQuery = { ...query, topics: ['welfare', 'education'], scope: { ...query.scope, ids: ['10', '2034'] } };
    expect(queryHash(a)).toBe(queryHash(b));
    expect(queryHash(query)).not.toBe(queryHash(a));
  });
});
