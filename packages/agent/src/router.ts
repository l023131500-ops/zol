/**
 * Agent router (SPEC part ב §6; Build task 41). Classifies a Hebrew question to
 * one of three grounded routes — none of them answers "from memory":
 *   sql   — quantitative ("כמה", "מה שיעור", comparisons, sums)
 *   tools — specific calculators/lookups (entitlements, balancing grant, tabar…)
 *   rag   — questions about document content ("מה כתוב", "לפי הפרוטוקול")
 */

export type Route = 'sql' | 'rag' | 'tools';

export interface RouteDecision {
  route: Route;
  tool?: string;
  reason: string;
}

const TOOL_PATTERNS: { tool: string; pattern: RegExp }[] = [
  { tool: 'calc_balancing_grant', pattern: /מענק איזון|גדיש/ },
  { tool: 'check_entitlements', pattern: /מגיע לי|זכא|זכות|הנחה/ },
  { tool: 'compare_peers', pattern: /קבוצת השווים|רשויות דומות|מול הממוצע|מול החציון/ },
  { tool: 'vendor_flags', pattern: /ספק|פטור ממכרז|התקשרות/ },
  { tool: 'get_tabar_status', pattern: /תב["״]?ר|תקציב בלתי רגיל/ },
  { tool: 'list_missed_grant_calls', pattern: /קול קורא|קולות קוראים|קרן/ },
];

const SQL_PATTERNS = /כמה|מה שיעור|כמות|סך|סכום|ממוצע|השווה|גבוה מ|נמוך מ|לפי שנה/;
const RAG_PATTERNS = /מה כתוב|לפי הפרוטוקול|במסמך|בדוח|נוסח|החלטה מספר|סעיף/;

export function routeQuestion(question: string): RouteDecision {
  for (const { tool, pattern } of TOOL_PATTERNS) {
    if (pattern.test(question)) return { route: 'tools', tool, reason: `התאמה לכלי ${tool}` };
  }
  if (RAG_PATTERNS.test(question)) return { route: 'rag', reason: 'שאלה על תוכן מסמך' };
  if (SQL_PATTERNS.test(question)) return { route: 'sql', reason: 'שאלה כמותית' };
  return { route: 'sql', reason: 'ברירת מחדל — שאילתה כמותית מוגבלת' };
}
