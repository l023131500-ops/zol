import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';
import { PageHeader } from '@/components/page-shell';
import { createServerSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'איכות הנתונים' };

interface SourceRow {
  display_name: string;
  sync_frequency: string | null;
  last_ok_at: string | null;
}

export default async function QualityPage() {
  const supabase = await createServerSupabase();
  let sources: SourceRow[] = [];
  let connected = false;

  if (supabase) {
    const { data, error } = await supabase
      .from('data_source')
      .select('display_name, sync_frequency, last_ok_at')
      .order('display_name');
    if (!error && data) {
      sources = data as SourceRow[];
      connected = true;
    }
  }

  return (
    <>
      <PageHeader
        title="איכות הנתונים"
        lead="שקיפות על עצמנו: מתי כל מקור סונכרן לאחרונה, אחוז האימות הידני, והשגיאות הידועות לנו."
      />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h2 className="text-xl font-semibold text-[var(--navy-700)]">מקורות נתונים</h2>
        {connected && sources.length > 0 ? (
          <table className="mt-4 w-full border-collapse text-sm">
            <caption className="sr-only">מצב סנכרון לכל מקור נתונים</caption>
            <thead>
              <tr className="border-b border-[var(--grey-200)] text-start">
                <th scope="col" className="py-2 text-start">מקור</th>
                <th scope="col" className="py-2 text-start">תדירות</th>
                <th scope="col" className="py-2 text-start">סנכרון אחרון</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.display_name} className="border-b border-[var(--grey-200)]">
                  <td className="py-2">{s.display_name}</td>
                  <td className="py-2">{s.sync_frequency ?? '—'}</td>
                  <td className="py-2 tabular-nums">
                    {s.last_ok_at ? new Date(s.last_ok_at).toLocaleDateString('he-IL') : 'טרם סונכרן'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mt-4">
            <NoData
              what="מצב סנכרון המקורות"
              reason="מקורות הנתונים מתחברים בגל 2 של הבנייה. עד אז, הטבלה תישאר ריקה במכוון — איננו מציגים נתוני דמה."
            />
          </div>
        )}

        <h2 className="mt-10 text-xl font-semibold text-[var(--navy-700)]">לוג תיקונים</h2>
        <div className="mt-4">
          <NoData
            what="תיקונים פומביים"
            reason="כל תיקון של נתון יירשם כאן עם הערך הישן, החדש, והסיבה. הלוג מתמלא כשמתחילים לטעון נתוני אמת."
          />
        </div>
      </div>
    </>
  );
}
