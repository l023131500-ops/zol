import type { ReactNode } from 'react';
import Link from 'next/link';
import { Bdi, FreshnessBadge } from '@kesef/ui';
import { getAuthority, slugToSymbol, LATEST_PUBLISHED_YEAR } from '@/lib/data/authority';

const TABS = [
  { seg: '', label: 'הכסף שלי' },
  { seg: 'sources', label: 'מאין מגיע' },
  { seg: 'spending', label: 'לאן הולך' },
  { seg: 'compare', label: 'השוואה' },
  { seg: 'alerts', label: 'תמרורי אזהרה' },
  { seg: 'gap', label: 'מה נתקע' },
];

export default async function AuthorityLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ authority: string }>;
}) {
  const { authority } = await params;
  const summary = await getAuthority(authority);
  const symbol = slugToSymbol(authority);
  const displayName = summary?.name_he ?? (authority === 'hatzor-haglilit' ? 'חצור הגלילית' : authority);

  return (
    <div>
      <header className="border-b border-[var(--grey-200)] bg-[var(--white)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--blue-600)]">הכסף שלי</p>
            <FreshnessBadge latestYear={LATEST_PUBLISHED_YEAR} />
          </div>
          <h1 className="mt-1 text-3xl font-bold text-[var(--navy-700)]">{displayName}</h1>
          {summary ? (
            <p className="mt-2 text-sm text-[var(--grey-500)]">
              {summary.population != null ? (
                <>
                  אוכלוסייה: <Bdi>{summary.population.toLocaleString('he-IL')}</Bdi> ·{' '}
                </>
              ) : null}
              אשכול חברתי-כלכלי: <Bdi>{summary.socio_economic_cluster ?? '—'}</Bdi> · פריפריאליות:{' '}
              <Bdi>{summary.peripherality_cluster ?? '—'}</Bdi>
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--grey-500)]">
              סמל רשות: <Bdi>{symbol ?? '—'}</Bdi>
            </p>
          )}

          <nav aria-label="ניווט מסכי הרשות" className="mt-4">
            <ul className="flex flex-wrap gap-2 text-sm">
              {TABS.map((tab) => (
                <li key={tab.seg}>
                  <Link
                    href={`/${authority}${tab.seg ? `/${tab.seg}` : ''}`}
                    className="inline-block rounded-md border border-[var(--grey-200)] px-3 py-1.5 text-[var(--grey-700)] hover:bg-[var(--blue-100)]"
                  >
                    {tab.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
