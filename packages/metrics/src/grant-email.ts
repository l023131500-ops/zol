/**
 * Grant-call notification email (SPEC task 39 upgrade). Plain Hebrew, RTL,
 * 9 sections. Every generated line passes the same language guard as the alert
 * engine, and unresolved conditions say "לא ניתן היה לאמת מהפרסום" — never a guess.
 */
import { assertFactual } from './language-guard';
import { formatShekelPlain } from './format';
import type { GrantMatch } from './grant-match';

export interface GrantCallInfo {
  ministry: string;
  title: string;
  category: string;
  maxAmount: number | null;
  matchingPct: number | null;
  closesAt: string; // ISO date
  daysToClose: number;
  sourceUrl: string;
  publishedAt: string;
  requiredDocs: string[];
  leadRole: string; // who in the authority should lead
  estimatedHours: number | null;
}

export interface GrantEmail {
  subject: string;
  bodyHe: string;
}

const DISCLAIMER =
  'הניתוח מבוסס על מה שפורסם, אינו מהווה ייעוץ, ויש לאמת מול המסמך הרשמי לפני הגשה.';

export function buildGrantCallEmail(
  match: GrantMatch,
  call: GrantCallInfo,
  authorityName: string,
): GrantEmail {
  const statusHe = match.result === 'match' ? 'מתאים' : 'מתאים חלקית';
  const amount = call.maxAmount != null ? formatShekelPlain(call.maxAmount) : 'לא פורסם סכום';

  const subject = `${call.ministry} · ${call.category} · ${statusHe} · ${amount} · ${call.daysToClose} ימים לסגירה`;

  const lines: string[] = [];
  lines.push(`שלום, לגבי ${authorityName}:`);
  lines.push('');
  lines.push(`1. ${statusHe} · ${amount} · סגירה בעוד ${call.daysToClose} ימים (${call.closesAt}).`);
  lines.push('');
  lines.push('2. למה זה מתאים:');
  for (const c of match.conditions) {
    const mark = c.met === true ? '✓' : c.met === false ? '✗' : '?';
    const actual = c.status === 'needs_review' ? 'לא ניתן היה לאמת מהפרסום' : c.actual;
    lines.push(`   ${mark} ${c.label}: נדרש ${c.required} · אצלנו ${actual}`);
  }
  lines.push('');
  lines.push('3. מה צריך לשים לב:');
  if (call.matchingPct != null && call.maxAmount != null) {
    const matchingIls = Math.round((call.maxAmount * call.matchingPct) / 100);
    lines.push(`   מצ'ינג נדרש: ${call.matchingPct}% — כלומר ${formatShekelPlain(matchingIls)} מתקציב הרשות.`);
  } else {
    lines.push('   דרישת מצ\'ינג: לא ניתן היה לאמת מהפרסום.');
  }
  lines.push('');
  lines.push('4. מה עושים, לפי הסדר:');
  lines.push('   א. פתח את הקישור למקור בתחתית המייל.');
  lines.push('   ב. ודא עמידה בתנאי הסף מול המסמך הרשמי.');
  lines.push('   ג. הכן את המסמכים הנדרשים (סעיף 5).');
  lines.push('   ד. הגש דרך הטופס באתר המשרד לפני מועד הסגירה.');
  lines.push('');
  lines.push(`5. מסמכים נדרשים: ${call.requiredDocs.length ? call.requiredDocs.join(', ') : 'לא פורטו בפרסום'}.`);
  lines.push('');
  lines.push(`6. מי אמור להוביל ברשות: ${call.leadRole}.`);
  lines.push('');
  lines.push(`7. מאמץ מוערך: ${call.estimatedHours != null ? `${call.estimatedHours} שעות` : 'לא הוערך'}.`);
  lines.push('');
  lines.push(`8. מקור מלא: ${call.sourceUrl} · פורסם: ${call.publishedAt}.`);
  lines.push('');
  lines.push(`9. ${DISCLAIMER}`);

  const bodyHe = lines.join('\n');
  assertFactual(subject);
  assertFactual(bodyHe);
  return { subject, bodyHe };
}
