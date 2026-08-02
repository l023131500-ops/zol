import type { Metadata } from 'next';
import { PageHeader, Prose } from '@/components/page-shell';

export const metadata: Metadata = { title: 'מדיניות עוגיות' };

export default function CookiesPage() {
  return (
    <>
      <PageHeader title="מדיניות עוגיות" />
      <Prose>
        <h2>מה זו עוגייה</h2>
        <p>קובץ טקסט קטן שהאתר שומר בדפדפן שלך.</p>

        <h2>אילו עוגיות אנחנו משתמשים</h2>
        <h3>עוגיות הכרחיות (תמיד פעילות)</h3>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">עוגיות הכרחיות</caption>
          <thead>
            <tr className="border-b border-[var(--grey-200)] text-start">
              <th scope="col" className="py-2 text-start">שם</th>
              <th scope="col" className="py-2 text-start">מטרה</th>
              <th scope="col" className="py-2 text-start">משך</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--grey-200)]">
              <td className="py-2">sb-access-token</td>
              <td className="py-2">שמירת מצב התחברות</td>
              <td className="py-2">פעיל עד יציאה</td>
            </tr>
            <tr>
              <td className="py-2">cookie-consent</td>
              <td className="py-2">זכירת הבחירה שלך לגבי עוגיות</td>
              <td className="py-2">12 חודשים</td>
            </tr>
          </tbody>
        </table>

        <h3>עוגיות אנליטיקה (רק באישורך)</h3>
        <p>
          נטענות אך ורק לאחר אישור אקטיבי בהודעת העוגיות. ברירת המחדל: כבוי.
        </p>

        <h2>מה אנחנו לא עושים</h2>
        <ul>
          <li>אין עוגיות פרסום</li>
          <li>אין מכירה או העברה של נתונים לצדדים שלישיים</li>
          <li>אין מעקב חוצה-אתרים</li>
          <li>פרופיל משק הבית שאתה מזין נשמר בדפדפן שלך בלבד ואינו נשלח לשרתים שלנו</li>
        </ul>

        <h2>שינוי הבחירה</h2>
        <p>בכל עת, דרך הקישור "הגדרות עוגיות" בתחתית כל עמוד.</p>
      </Prose>
    </>
  );
}
