import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        navy: { 900: 'var(--navy-900)', 700: 'var(--navy-700)' },
        blue: { 600: 'var(--blue-600)', 400: 'var(--blue-400)', 100: 'var(--blue-100)' },
        grey: {
          700: 'var(--grey-700)',
          500: 'var(--grey-500)',
          200: 'var(--grey-200)',
          50: 'var(--grey-50)',
        },
      },
      fontSize: {
        display: ['2.75rem', { lineHeight: '3.25rem', fontWeight: '700' }],
        metric: ['2.25rem', { lineHeight: '2.75rem', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};

export default config;
