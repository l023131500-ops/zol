import type { Metadata } from 'next';
import { AlertBadge, NoData, type AlertSeverity } from '@kesef/ui';
import { getPublicAlerts, slugToSymbol } from '@/lib/data/authority';

export const metadata: Metadata = { title: 'תמרורי אזהרה', robots: { index: false } };

const SEVERITIES: AlertSeverity[] = ['info', 'notice', 'high'];
function toSeverity(s: string): AlertSeverity {
  return (SEVERITIES as string[]).includes(s) ? (s as AlertSeverity) : 'notice';
}

/**
 * Alerts screen (task 32). Each flag is a measurement, not a judgement.
 * Only public alerts are shown; high alerts within the 14-day notice window
 * are excluded at the database level (is_public + trigger).
 */
export default async function AlertsPage({ params }: { params: Promise<{ authority: string }> }) {
  const { authority } = await params;
  const symbol = slugToSymbol(authority);
  const alerts = symbol != null ? await getPublicAlerts(symbol) : [];

  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-[var(--grey-700)]">
        כל דגל הוא מדידה, לא שיפוט. לכל דגל הגדרה מתודולוגית פומבית, ולרשות זכות תגובה מובנית.
      </p>

      {alerts.length === 0 ? (
        <NoData
          what="תמרורי אזהרה"
          reason="דגלים מחושבים לאחר טעינת נתוני האמת והרצת מנוע הדגלים. עד אז אין דגלים להצגה — וזה אינו ממצא."
          action={{ label: 'איך מחושבים הדגלים', href: '/methodology#alerts' }}
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((a, i) => (
            <AlertBadge
              key={`${a.rule_key}-${i}`}
              severity={toSeverity(a.severity)}
              statement={a.statement_he}
              methodologyHref={a.methodology_url}
              response={a.response_text ? { text: a.response_text, publishedAt: '' } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
