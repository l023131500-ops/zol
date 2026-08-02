import { describe, it, expect } from 'vitest';
import { findForbiddenWord, isFactualStatement, assertFactual, ForbiddenWordError, FORBIDDEN_WORDS } from './language-guard';

describe('language guard (forbidden wording)', () => {
  it('flags an accusatory sentence', () => {
    expect(findForbiddenWord('התקשרות חשד עם ספק')).toBe('חשד');
    expect(isFactualStatement('הרשות מסתירה תב"רים')).toBe(false);
  });
  it('passes a factual measurement', () => {
    expect(isFactualStatement('הוצאה לתלמיד: 8,400 ₪ · חציון: 11,200 ₪ · פער: 25%')).toBe(true);
  });
  it('assertFactual throws on a banned word', () => {
    expect(() => assertFactual('שחיתות בעירייה')).toThrow(ForbiddenWordError);
  });
  it('lists the 13 canonical forbidden words', () => {
    expect(FORBIDDEN_WORDS.length).toBe(13);
  });
});
