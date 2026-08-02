import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'לוג תיקונים' };
export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--navy-700)]">לוג תיקונים</h1>
      <p className="mt-2 text-[var(--grey-700)]">כל תיקון נתון, מוצג גם בעמוד הציבורי /quality.</p>
      <div className="mt-6 rounded-xl border border-dashed border-[var(--grey-200)] bg-[var(--grey-50)] p-8 text-center text-[var(--grey-500)]">
        המודול ייבנה בגל הרלוונטי. המבנה מוכן.
      </div>
    </div>
  );
}
