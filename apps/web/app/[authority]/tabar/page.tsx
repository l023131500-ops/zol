import type { Metadata } from 'next';
import { NoData, Term } from '@kesef/ui';
export const metadata: Metadata = { title: 'תב״רים', robots: { index: false } };
/** Tabar screen (task 39): table + map + timeline, dormant-tabar clock. */
export default function TabarPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        <Term id="tabar" definition={'תב"ר = תקציב בלתי רגיל. תקציב ייעודי לפרויקט חד-פעמי.'} whyItMatters="חלק גדול מההשקעה בתשתיות עובר דרך תב״רים, ולרוב אינו מפורסם.">תב&quot;רים</Term>{' '}
        — מקורות מימון, סטטוס, ביצוע כספי מול פיזי, איחור וקבלן. כולל "מפת התב״רים" ו"תב״רים רדומים" עם שעון סופר.
      </p>
      <NoData what={'תב"רים'} reason="הרשות לא פרסמה מידע על תקציבים בלתי רגילים, או שטרם נטען. היעדר פרסום הוא ממצא." action={{ label: 'הגש בקשת חופש מידע', href: '/methodology' }} />
    </div>
  );
}
