import Link from 'next/link';

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'המוצר',
    links: [
      { href: '/product', label: 'סקירה' },
      { href: '/for-municipalities', label: 'לרשויות מקומיות' },
      { href: '/pricing', label: 'מחירים' },
    ],
  },
  {
    title: 'שקיפות',
    links: [
      { href: '/methodology', label: 'מתודולוגיה' },
      { href: '/quality', label: 'איכות הנתונים' },
      { href: '/about', label: 'אודות' },
      { href: '/contact', label: 'צור קשר' },
    ],
  },
  {
    title: 'משפטי',
    links: [
      { href: '/legal/privacy', label: 'מדיניות פרטיות' },
      { href: '/legal/terms', label: 'תנאי שימוש' },
      { href: '/legal/cookies', label: 'מדיניות עוגיות' },
      { href: '/legal/accessibility', label: 'הצהרת נגישות' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--grey-200)] bg-[var(--white)]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold text-[var(--navy-700)]">
            <span aria-hidden="true">₪</span>
            <span>כסף</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--grey-500)]">
            שקיפות תקציבית לרשויות מקומיות בישראל. המערכת מציגה מה פורסם, לא מה קרה.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold text-[var(--grey-700)]">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[var(--grey-500)] hover:text-[var(--blue-600)]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-[var(--grey-200)]">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-[var(--grey-500)]">
          כל מספר במערכת מקושר למסמך מקור רשמי. היעדר פרסום מוצג כממצא, לא מוסתר.
        </p>
      </div>
    </footer>
  );
}
