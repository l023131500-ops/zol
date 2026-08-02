import '@fontsource-variable/assistant';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { CookieConsent } from '@/components/cookie-consent';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'כסף — שקיפות תקציבית לרשויות מקומיות',
    template: '%s · כסף',
  },
  description:
    'פלטפורמה שמתרגמת את כל הכסף הציבורי שזורם אל רשות מקומית ומתוכה לשפה של תושב יחיד: כמה מגיע, כמה הגיע בפועל, ומה נתקע בדרך.',
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'כסף',
  },
};

export const viewport: Viewport = {
  themeColor: '#12233f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-[var(--grey-50)] text-[var(--grey-700)] antialiased">
        <a href="#main" className="skip-link">
          דלג לתוכן הראשי
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        <CookieConsent />
      </body>
    </html>
  );
}
