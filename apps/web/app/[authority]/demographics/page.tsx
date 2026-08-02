import type { Metadata } from 'next';
import { NoData, GeoDisclaimer } from '@kesef/ui';

export const metadata: Metadata = { title: 'אוכלוסייה מול תקציב', robots: { index: false } };

/**
 * Demographics vs budget (task 33). Crosses the demographic profile (National
 * Insurance + CBS) against spending. The GeoDisclaimer is mandatory on every
 * geographic screen: authorities don't budget by neighbourhood.
 */
export default function DemographicsPage() {
  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        הצלבת הפרופיל הדמוגרפי — גיל, גודל משפחות, נכות, אבטלה, שכר — מול ההוצאה לחינוך, רווחה,
        נוער וקשישים. זה מה שנותן לתמרורי האזהרה משמעות: הוצאה נמוכה לילד ביישוב עם 32.8% ילדים
        היא ממצא אחר לגמרי מאשר ביישוב עם 15%.
      </p>

      <GeoDisclaimer />

      <div className="grid gap-4 md:grid-cols-2">
        <NoData
          what="פרופיל דמוגרפי"
          reason="גיל, שכר, נכות ואבטלה מביטוח לאומי והלמ״ס — ייטענו בגל 2 עם source_document לכל ערך."
        />
        <NoData
          what="הצלבה מול ההוצאה"
          reason="ההשוואה בין הפרופיל להוצאה בפועל תחושב לאחר טעינת המדדים הדמוגרפיים והתקציביים."
        />
      </div>
    </div>
  );
}
