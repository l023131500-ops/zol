import { describe, it, expect } from 'vitest';
import { CHART_OF_ACCOUNTS_SEED, flowForCode, parentChain } from './chart-of-accounts';

describe('chart of accounts seed (task 15)', () => {
  it('code 1111 exists with parent 111 and receipt flow', () => {
    const row = CHART_OF_ACCOUNTS_SEED.find((r) => r.code === 1111);
    expect(row).toBeDefined();
    expect(row!.parent_code).toBe(111);
    expect(row!.flow).toBe('receipt');
  });

  it('code 6111 exists with payment flow and administration topic', () => {
    const row = CHART_OF_ACCOUNTS_SEED.find((r) => r.code === 6111);
    expect(row!.flow).toBe('payment');
    expect(row!.topic).toBe('administration');
  });

  it('every level-4 code has a full parent chain up to level 1', () => {
    const leaves = CHART_OF_ACCOUNTS_SEED.filter((r) => r.level === 4);
    for (const leaf of leaves) {
      const chain = parentChain(leaf.code, CHART_OF_ACCOUNTS_SEED);
      expect(chain.map((r) => r.level)).toEqual([4, 3, 2, 1]);
    }
  });

  it('flowForCode follows receipts 1-5 / payments 6-9', () => {
    expect(flowForCode(1111)).toBe('receipt');
    expect(flowForCode(3167)).toBe('receipt');
    expect(flowForCode(6111)).toBe('payment');
    expect(flowForCode(9000)).toBe('payment');
  });
});
