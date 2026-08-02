import type { ReactNode } from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasRole, ADMIN_ROLES } from '@/lib/roles';

const NAV = [
  { href: '/admin', label: 'סקירה' },
  { href: '/admin/review', label: 'תור אימות' },
  { href: '/admin/sync', label: 'מקורות וסנכרונים' },
  { href: '/admin/users', label: 'משתמשים ולקוחות' },
  { href: '/admin/alerts', label: 'דגלים ותגובות' },
  { href: '/admin/corrections', label: 'לוג תיקונים' },
  { href: '/admin/quality', label: 'מדדי איכות' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!hasRole(session.role, ADMIN_ROLES)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-sm font-semibold text-[var(--alert-high)]">403</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--navy-700)]">אין לך הרשאה לפורטל הניהול</h1>
        <p className="mt-3 text-[var(--grey-700)]">
          פורטל הניהול פתוח לצוות בלבד. אם לדעתך זו טעות, פנה למנהל המערכת.
        </p>
        <Link href="/" className="mt-6 inline-block font-semibold text-[var(--blue-600)] underline">
          חזרה לדף הבית ←
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-8">
      <aside className="w-56 shrink-0">
        <h2 className="text-sm font-semibold text-[var(--grey-500)]">פורטל ניהול</h2>
        <nav aria-label="ניווט פורטל ניהול" className="mt-3">
          <ul className="space-y-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-[var(--grey-700)] hover:bg-[var(--blue-100)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
