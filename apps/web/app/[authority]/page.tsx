import type { Metadata } from 'next';
import { NoData } from '@kesef/ui';
import { PageHeader } from '@/components/page-shell';

export const metadata: Metadata = { title: 'הרשות שלי', robots: { index: false } };

const KNOWN_NAMES: Record<string, string> = {
  'hatzor-haglilit': 'חצור הגלילית',
};

/**
 * Placeholder for the "הכסף שלי" screen. The full personalized screen and its
 * real data are built in Wave 3 (task 28). Until then we show an honest
 * under-construction state — never invented numbers.
 */
export default async function AuthorityPage({
  params,
}: {
  params: Promise<{ authority: string }>;
}) {
  const { authority } = await params;
  const name = KNOWN_NAMES[authority] ?? authority;

  return (
    <>
      <PageHeader eyebrow="הכסף שלי" title={name} lead="הכרטיס האישי של הרשות — בבנייה." />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <NoData
          what="נתוני הרשות"
          reason="מסך זה נבנה בגל 3, לאחר טעינת נתוני האמת של 260 הרשויות בגל 2. איננו מציגים נתוני דמה בינתיים."
        />
      </div>
    </>
  );
}
