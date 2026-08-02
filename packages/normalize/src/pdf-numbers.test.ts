import { describe, it, expect } from 'vitest';
import { reverseDigits, validateExtraction, extractionConfidence } from './pdf-numbers';

describe('RTL number-extraction guard (task 38)', () => {
  it('reverses digits preserving sign', () => {
    expect(reverseDigits(1234)).toBe(4321);
    expect(reverseDigits(-120)).toBe(-21);
  });

  it('passes when parts already sum to the subtotal', () => {
    const c = validateExtraction([100, 200, 300], 600);
    expect(c.ok).toBe(true);
    expect(extractionConfidence(c)).toBeGreaterThan(0.9);
  });

  it('detects a single reversed number and suggests the fix', () => {
    // real line: 123 + 200 = 323, but 123 was extracted reversed as 321
    const c = validateExtraction([321, 200], 323);
    expect(c.ok).toBe(false);
    expect(c.reversalSuspect).toBe(0);
    expect(c.suggested).toBe(123);
    expect(extractionConfidence(c)).toBeLessThan(0.5);
  });

  it('reports an unexplained mismatch (no reversal fixes it) with low confidence', () => {
    const c = validateExtraction([100, 200], 999);
    expect(c.ok).toBe(false);
    expect(c.reversalSuspect).toBeNull();
    expect(extractionConfidence(c)).toBeLessThan(0.3);
  });
});
