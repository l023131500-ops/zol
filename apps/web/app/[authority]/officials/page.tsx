import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';

export const metadata: Metadata = { title: 'בעלי תפקידים', robots: { index: false } };

/**
 * Officials directory (task 40). Only officially published contact details,
 * each with a source document. Personal phones/emails are never stored — the
 * DB CHECK constraint (migration 0007) enforces it.
 */
export default function OfficialsPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        שם, תפקיד, ועדות ופרטי קשר <strong>רשמיים שפורסמו בלבד</strong> — לכל שדה מוצג המקור שממנו
        נלקח. איננו מציגים טלפון אישי, מייל פרטי או כתובת.
      </p>
      <NoData
        what="בעלי תפקידים"
        reason="ייטענו מפרסומי הרשות, כל פרט קשר עם contact_source_document_id. פרט ללא מקור רשמי — לא נשמר ולא מוצג."
      />
    </div>
  );
}
