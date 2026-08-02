import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-shell';

export const metadata: Metadata = { title: 'לרשויות מקומיות' };

export default function ForMunicipalitiesPage() {
  return (
    <>
      <PageHeader
        eyebrow="B2G"
        title="מנוע ההכנסות של הרשות שלך"
        lead="זיהוי קולות קוראים רלוונטיים, השוואה מול קבוצת השווים, וזכות תגובה מובנית על כל דגל — נתונים בפורמט אחיד ל-260 רשויות."
      />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-6">
          <h2 className="text-xl font-semibold text-[var(--navy-700)]">המדיניות שלנו כלפי רשות מנויה</h2>
          <p className="mt-3 text-base leading-7 text-[var(--grey-700)]">
            רשות מנויה יכולה להגיב על דגל — לא להסתיר אותו. נתוני רשות מנויה מוצגים בדיוק כמו של
            רשות שאינה מנויה. מדיניות זו מתפרסמת בעמוד המתודולוגיה, ואינה נתונה למשא ומתן.
          </p>
        </div>
      </div>
    </>
  );
}
