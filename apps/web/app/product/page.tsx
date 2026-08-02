import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-shell';

export const metadata: Metadata = { title: 'המוצר' };

const SCREENS = [
  { name: 'הכסף שלי', desc: 'כרטיס אישי לתושב — לא דשבורד. כמה עבר דרך הרשות, לאן הלך כל שקל מהארנונה שלך, וכמה מגיע לילד שלך.' },
  { name: 'מאין מגיע הכסף', desc: 'תרשים זרימה מימין לשמאל: הכנסות עצמיות, מענק איזון, השתתפות משרדי ממשלה — עד לפירוק נוסחת גדיש.' },
  { name: 'לאן הולך הכסף', desc: 'מפת עץ היררכית לפי ספר הקידודים, עם מתגי מאושר/מעודכן/ביצוע וקישור לכל מסמך מקור.' },
  { name: 'מה מגיע לנו ולא קיבלנו', desc: 'טבלת הפערים ומונה הפער, בפירוק לשלוש קטגוריות סיבה — בניסוח נטול האשמה.' },
  { name: 'השוואה לקבוצת שווים', desc: 'קבוצה נבנית אוטומטית לפי אשכול, פריפריאליות ואוכלוסייה. היכן הרשות חריגה, לחיוב ולשלילה.' },
  { name: 'תמרורי אזהרה', desc: 'מנוע דגלים מנורמל. כל דגל הוא מדידה, לא שיפוט — עם הגדרה מתודולוגית פומבית וזכות תגובה לרשות.' },
];

export default function ProductPage() {
  return (
    <>
      <PageHeader
        eyebrow="סקירת המוצר"
        title="מוצר אחד שמשרת גם את התושב וגם את הגזבר"
        lead="התושב הוא המשתמש, הגזבר הוא הלקוח. אותו מנוע משרת את שניהם — אין שני מקורות אמת."
      />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-4 md:grid-cols-2">
          {SCREENS.map((s) => (
            <div key={s.name} className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-6">
              <h2 className="text-lg font-semibold text-[var(--navy-700)]">{s.name}</h2>
              <p className="mt-2 text-base leading-7 text-[var(--grey-700)]">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
