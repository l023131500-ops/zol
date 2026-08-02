import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'משתמשים' };
export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--navy-700)]">משתמשים ולקוחות B2G</h1>
      <p className="mt-2 text-[var(--grey-700)]">ניהול משתמשים, תפקידים ומנויי רשויות.</p>
      <div className="mt-6 rounded-xl border border-dashed border-[var(--grey-200)] bg-[var(--grey-50)] p-8 text-center text-[var(--grey-500)]">
        המודול ייבנה בגל הרלוונטי. המבנה מוכן.
      </div>
    </div>
  );
}
