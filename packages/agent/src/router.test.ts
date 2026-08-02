import { describe, it, expect } from 'vitest';
import { routeQuestion } from './router';
import { normalizeTerm, mustNotConfuse } from './terms';

describe('agent router (task 41)', () => {
  it('routes quantitative questions to sql', () => {
    expect(routeQuestion('כמה הוצאה לחינוך ב-2024?').route).toBe('sql');
  });
  it('routes document questions to rag', () => {
    expect(routeQuestion('מה כתוב בפרוטוקול על התב"רים?').route).toBe('tools'); // tabar pattern wins first
    expect(routeQuestion('מה כתוב בדוח על החינוך?').route).toBe('rag');
  });
  it('routes to the right tool', () => {
    expect(routeQuestion('כמה מענק איזון מגיע?').tool).toBe('calc_balancing_grant');
    expect(routeQuestion('אילו קולות קוראים פספסנו?').tool).toBe('list_missed_grant_calls');
  });
});

describe('term normalization — תב"ר vs תב"ע (task 41)', () => {
  it('normalizes spelling variants to canonical', () => {
    expect(normalizeTerm('תבר')).toBe('תב"ר');
    expect(normalizeTerm('תקציב בלתי רגיל')).toBe('תב"ר');
    expect(normalizeTerm('גדיש')).toBe('מענק איזון');
  });
  it('keeps תב"ר and תב"ע distinct', () => {
    expect(normalizeTerm('תבע')).toBe('תב"ע');
    expect(normalizeTerm('תבר')).not.toBe(normalizeTerm('תבע'));
  });
  it('flags the pair that must never be conflated', () => {
    expect(mustNotConfuse('תבר', 'תבע')).toBe(true);
    expect(mustNotConfuse('תב"ר', 'מענק איזון')).toBe(false);
  });
});
