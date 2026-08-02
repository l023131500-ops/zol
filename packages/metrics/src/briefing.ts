/**
 * Meeting-briefing generator (new high-priority feature: "תיק לפגישה עם ראש הרשות").
 *
 * Produces the "ten questions for the meeting" from the findings — each phrased
 * as an OPEN QUESTION, never an accusation, each carrying a source reference.
 * Every generated line passes the alert engine's language guard.
 */
import { assertFactual } from './language-guard';
import { formatShekelPlain, formatPct } from './format';

export interface SourceRef {
  docId: string;
  page?: number;
}

export interface MetricFinding {
  labelHe: string;
  value: number;
  peerMedian: number;
  source: SourceRef;
}

export interface CollectionFinding {
  ratePct: number;
  floorPct: number;
  balancingGrantImpact: number | null;
  source: SourceRef;
}

export interface CrossCheckFinding {
  stateReported: number;
  authorityRecorded: number;
  source: SourceRef;
}

export interface MissedGrantFinding {
  ministry: string;
  amount: number;
  source: SourceRef;
}

export interface NonPublishedFinding {
  what: string;
  nationalPct: number | null;
}

export interface BriefingInputs {
  authorityName: string;
  metrics: MetricFinding[];
  collection?: CollectionFinding;
  crossCheck?: CrossCheckFinding;
  missedGrants: MissedGrantFinding[];
  nonPublished: NonPublishedFinding[];
}

export interface MeetingQuestion {
  text: string;
  source?: SourceRef;
}

/** Build up to ten open, source-backed questions from the findings. */
export function generateMeetingQuestions(inputs: BriefingInputs): MeetingQuestion[] {
  const q: MeetingQuestion[] = [];

  for (const m of inputs.metrics) {
    const gap = m.peerMedian === 0 ? 0 : Math.round(((m.value - m.peerMedian) / m.peerMedian) * 100);
    if (gap <= -20) {
      q.push({
        text: `${m.labelHe} עומדת על ${formatShekelPlain(m.value)} מול חציון ${formatShekelPlain(m.peerMedian)} בקבוצת השווים (פער ${formatPct(Math.abs(gap))}). מה מסביר את הפער, והאם מתוכננת התאמה?`,
        source: m.source,
      });
    }
  }

  if (inputs.collection && inputs.collection.ratePct < inputs.collection.floorPct) {
    const impact =
      inputs.collection.balancingGrantImpact != null
        ? ` ההשלכה המחושבת על מענק האיזון היא ${formatShekelPlain(inputs.collection.balancingGrantImpact)}.`
        : '';
    q.push({
      text: `שיעור הגבייה הוא ${formatPct(inputs.collection.ratePct)}, מתחת לסף החלטת ממשלה 3576 (${formatPct(inputs.collection.floorPct)}).${impact} אילו צעדים ננקטים כדי לעמוד בסף?`,
      source: inputs.collection.source,
    });
  }

  if (inputs.crossCheck) {
    const gap = inputs.crossCheck.stateReported - inputs.crossCheck.authorityRecorded;
    if (Math.abs(gap) > 0) {
      q.push({
        text: `מפתח התקציב מדווח על העברה של ${formatShekelPlain(inputs.crossCheck.stateReported)} מהמדינה, בעוד בדוח נרשמה קבלה של ${formatShekelPlain(inputs.crossCheck.authorityRecorded)}. מה מקור ההפרש?`,
        source: inputs.crossCheck.source,
      });
    }
  }

  for (const g of inputs.missedGrants) {
    q.push({
      text: `נמצא קול קורא של ${g.ministry} בסכום ${formatShekelPlain(g.amount)} שהרשות עמדה בתנאי הסף שלו ולא הוגשה בו בקשה. מה מנע את ההגשה, וכיצד ניתן להיערך לפעם הבאה?`,
      source: g.source,
    });
  }

  for (const np of inputs.nonPublished) {
    const nat = np.nationalPct != null ? ` (ארצית, ${formatPct(np.nationalPct)} מהרשויות מפרסמות)` : '';
    q.push({
      text: `לא נמצא פרסום של ${np.what}${nat}. האם ומתי מתוכנן פרסום?`,
    });
  }

  const ten = q.slice(0, 10);
  for (const item of ten) assertFactual(item.text); // blame-free wording enforced
  return ten;
}

export interface BriefingHeadline {
  label: string;
  value: number;
}

/** The three headline numbers for the WhatsApp summary image. */
export function briefingHeadlines(inputs: BriefingInputs): BriefingHeadline[] {
  const missedTotal = inputs.missedGrants.reduce((s, g) => s + g.amount, 0);
  const worstMetric = [...inputs.metrics]
    .map((m) => ({ m, gap: m.peerMedian === 0 ? 0 : (m.value - m.peerMedian) / m.peerMedian }))
    .sort((a, b) => a.gap - b.gap)[0];
  return [
    { label: 'כסף שהוחמץ בקולות קוראים', value: missedTotal },
    ...(inputs.collection ? [{ label: 'שיעור גבייה', value: inputs.collection.ratePct }] : []),
    ...(worstMetric ? [{ label: worstMetric.m.labelHe, value: worstMetric.m.value }] : []),
  ];
}
