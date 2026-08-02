import { describe, it, expect } from 'vitest';
import {
  validateAnswer,
  safeValidateAnswer,
  extractNumbers,
  shouldRefuse,
  HallucinationError,
  MissingCitationError,
} from './validate-answer';

const context = [{ value: 8400 }, { value: 11200 }];

describe('anti-hallucination guard (task 41)', () => {
  it('extracts grouped and decimal numbers', () => {
    expect(extractNumbers('ההוצאה 8,400 ₪ מול 11,200')).toEqual([8400, 11200]);
  });

  it('accepts an answer whose numbers are all grounded and cited', () => {
    const a = 'ההוצאה לתלמיד היא 8,400 ₪ מול חציון 11,200 [source:doc-1]';
    expect(validateAnswer(a, context)).toBe(a);
  });

  it('throws HallucinationError on an ungrounded number', () => {
    expect(() => validateAnswer('ההוצאה 9,999 ₪ [source:doc-1]', context)).toThrow(HallucinationError);
  });

  it('throws MissingCitationError when numbers lack a source', () => {
    expect(() => validateAnswer('ההוצאה 8,400 ₪', context)).toThrow(MissingCitationError);
  });

  it('does not require grounding for year-like numbers', () => {
    expect(validateAnswer('בשנת 2024 לא היו נתונים', context)).toContain('2024');
  });

  it('safeValidateAnswer returns a result instead of throwing', () => {
    const r = safeValidateAnswer('12,345 ₪ [source:x]', context);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(HallucinationError);
  });

  it('refuses political / prediction / intent questions', () => {
    expect(shouldRefuse('האם ראש המועצה מושחת?').refuse).toBe(true);
    expect(shouldRefuse('למי להצביע בבחירות?').refuse).toBe(true);
    expect(shouldRefuse('מה תהיה התחזית לשנה הבאה?').refuse).toBe(true);
    expect(shouldRefuse('כמה הוצאה לחינוך ב-2024?').refuse).toBe(false);
  });
});
