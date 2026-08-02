import { describe, it, expect } from 'vitest';
import { generateMeetingQuestions, briefingHeadlines, type BriefingInputs } from './briefing';
import { findForbiddenWord } from './language-guard';

const inputs: BriefingInputs = {
  authorityName: 'חצור הגלילית',
  metrics: [
    { labelHe: 'הוצאה לתלמיד', value: 8400, peerMedian: 11200, source: { docId: 'd1', page: 47 } },
    { labelHe: 'הכנסה עצמית לנפש', value: 3000, peerMedian: 3100, source: { docId: 'd2' } },
  ],
  collection: { ratePct: 78, floorPct: 84, balancingGrantImpact: 500000, source: { docId: 'd3' } },
  crossCheck: { stateReported: 10_000_000, authorityRecorded: 9_000_000, source: { docId: 'd4' } },
  missedGrants: [{ ministry: 'משרד החינוך', amount: 200000, source: { docId: 'd5' } }],
  nonPublished: [{ what: 'תב"רים לשנים 2022–2024', nationalPct: 5 }],
};

describe('meeting briefing (תיק לפגישה)', () => {
  it('generates open, source-backed questions (max 10)', () => {
    const qs = generateMeetingQuestions(inputs);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(10);
    for (const q of qs) expect(q.text.trim().endsWith('?')).toBe(true); // open question
  });

  it('no question contains forbidden (accusatory) wording', () => {
    for (const q of generateMeetingQuestions(inputs)) {
      expect(findForbiddenWord(q.text), q.text).toBeNull();
    }
  });

  it('only flags metrics with a >20% shortfall', () => {
    const qs = generateMeetingQuestions(inputs);
    // הוצאה לתלמיד (−25%) is flagged; הכנסה עצמית (−3%) is not.
    expect(qs.some((q) => q.text.includes('הוצאה לתלמיד'))).toBe(true);
    expect(qs.some((q) => q.text.includes('הכנסה עצמית'))).toBe(false);
  });

  it('includes the collection, cross-check, missed-grant and non-publication questions', () => {
    const text = generateMeetingQuestions(inputs).map((q) => q.text).join('\n');
    expect(text).toContain('3576');
    expect(text).toContain('מפתח התקציב');
    expect(text).toContain('קול קורא');
    expect(text).toContain('לא נמצא פרסום');
  });

  it('produces three headline numbers for the WhatsApp summary', () => {
    const h = briefingHeadlines(inputs);
    expect(h).toHaveLength(3);
    expect(h[0]!.value).toBe(200000); // missed money total
  });
});
