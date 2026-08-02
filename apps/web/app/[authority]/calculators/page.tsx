import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';
import { ArnonaCalculator } from '@/components/arnona-calculator';

export const metadata: Metadata = { title: 'מחשבונים', robots: { index: false } };

/** Calculators (task 34): arnona, tax-split, multi-year forecast, budget simulator. */
export default function CalculatorsPage() {
  return (
    <div className="space-y-6">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        כלים אישיים לתרגום המספרים למונחים שלך. כל תוצאה מסומנת כמוערכת עד לטעינת הנתונים הרשמיים.
      </p>

      <ArnonaCalculator />

      <div className="grid gap-4 md:grid-cols-2">
        <NoData
          what="המס שלי לאן הלך"
          reason="פיצול סכום הארנונה ששילמת לשקלים לפי סעיף — יחושב לאחר טעינת פילוח ההוצאה של הרשות."
        />
        <NoData
          what="תחזית רב-שנתית"
          reason="5 שנים אחורה + הקרנה 3 קדימה. ההקרנה תסומן תמיד כמוערכת, עם הצגת ההנחות."
        />
        <NoData
          what="סימולטור תקציב משתתף"
          reason="סרגלים תחת אילוץ איזון + תוצאה ציבורית מצרפית — ייבנה מעל נתוני התקציב."
        />
      </div>
    </div>
  );
}
