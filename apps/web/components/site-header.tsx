import Link from 'next/link';

const NAV = [
  { href: '/product', label: 'המוצר' },
  { href: '/for-municipalities', label: 'לרשויות' },
  { href: '/pricing', label: 'מחירים' },
  { href: '/methodology', label: 'מתודולוגיה' },
  { href: '/quality', label: 'איכות הנתונים' },
  { href: '/about', label: 'אודות' },
];

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--grey-200)] bg-[var(--white)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold text-[var(--navy-700)]"
          aria-label="כסף — לדף הבית"
        >
          <span aria-hidden="true">₪</span>
          <span>כסף</span>
        </Link>

        <nav aria-label="ניווט ראשי" className="hidden md:block">
          <ul className="flex items-center gap-5 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-[var(--grey-700)] hover:text-[var(--navy-700)]">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--blue-600)] hover:bg-[var(--blue-100)]"
          >
            כניסה
          </Link>
          <Link
            href="/hatzor-haglilit"
            className="rounded-lg bg-[var(--navy-700)] px-3 py-1.5 text-sm font-semibold text-[var(--white)] hover:bg-[var(--navy-900)]"
          >
            בדוק את היישוב שלי
          </Link>
        </div>
      </div>
    </header>
  );
}
