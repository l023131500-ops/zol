'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClientSupabase } from '@/lib/supabase/client';

type Mode = 'login' | 'signup' | 'reset';

const COPY: Record<Mode, { title: string; submit: string; toggle?: { href: string; label: string } }> =
  {
    login: { title: 'כניסה', submit: 'התחבר', toggle: { href: '/auth/signup', label: 'אין לך חשבון? הרשמה' } },
    signup: { title: 'הרשמה', submit: 'צור חשבון', toggle: { href: '/auth/login', label: 'כבר יש חשבון? כניסה' } },
    reset: { title: 'איפוס סיסמה', submit: 'שלח קישור איפוס' },
  };

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'error' | 'ok'; msg?: string }>({
    kind: 'idle',
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'busy' });
    try {
      const supabase = createClientSupabase();
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setStatus({ kind: 'ok', msg: 'שלחנו קישור לאיפוס הסיסמה לדוא״ל שלך.' });
        return;
      }
      const action =
        mode === 'signup'
          ? supabase.auth.signUp({ email, password })
          : supabase.auth.signInWithPassword({ email, password });
      const { error } = await action;
      if (error) throw error;
      window.location.assign('/');
    } catch (err) {
      setStatus({ kind: 'error', msg: err instanceof Error ? err.message : 'אירעה שגיאה. נסה שוב.' });
    }
  }

  async function magicLink() {
    setStatus({ kind: 'busy' });
    try {
      const supabase = createClientSupabase();
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setStatus({ kind: 'ok', msg: 'שלחנו לך קישור כניסה חד-פעמי לדוא״ל.' });
    } catch (err) {
      setStatus({ kind: 'error', msg: err instanceof Error ? err.message : 'אירעה שגיאה.' });
    }
  }

  async function google() {
    try {
      const supabase = createClientSupabase();
      await supabase.auth.signInWithOAuth({ provider: 'google' });
    } catch (err) {
      setStatus({ kind: 'error', msg: err instanceof Error ? err.message : 'אירעה שגיאה.' });
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-xl border border-[var(--grey-200)] bg-[var(--white)] p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--navy-700)]">{copy.title}</h1>

        <form onSubmit={onSubmit} className="mt-5 space-y-4" aria-label={copy.title}>
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-[var(--grey-700)]">
              דוא״ל
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
            />
          </div>

          {mode !== 'reset' ? (
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-[var(--grey-700)]">
                סיסמה
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--grey-200)] px-3 py-2"
              />
            </div>
          ) : null}

          {status.kind === 'error' ? (
            <p role="alert" className="rounded-md bg-[#FBEDE0] px-3 py-2 text-sm text-[var(--exec-under)]">
              {status.msg}
            </p>
          ) : null}
          {status.kind === 'ok' ? (
            <p role="status" className="rounded-md bg-[#EDF5EE] px-3 py-2 text-sm text-[var(--exec-over)]">
              {status.msg}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status.kind === 'busy'}
            className="w-full rounded-lg bg-[var(--navy-700)] px-5 py-2.5 font-semibold text-[var(--white)] hover:bg-[var(--navy-900)] disabled:opacity-50"
          >
            {status.kind === 'busy' ? 'רגע…' : copy.submit}
          </button>
        </form>

        {mode !== 'reset' ? (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={magicLink}
              className="w-full rounded-lg border border-[var(--grey-200)] px-4 py-2 text-sm font-semibold text-[var(--grey-700)] hover:bg-[var(--grey-50)]"
            >
              שליחת קישור כניסה לדוא״ל (Magic Link)
            </button>
            <button
              type="button"
              onClick={google}
              className="w-full rounded-lg border border-[var(--grey-200)] px-4 py-2 text-sm font-semibold text-[var(--grey-700)] hover:bg-[var(--grey-50)]"
            >
              המשך עם Google
            </button>
          </div>
        ) : null}

        <div className="mt-5 flex justify-between text-sm">
          {copy.toggle ? (
            <Link href={copy.toggle.href} className="text-[var(--blue-600)] underline">
              {copy.toggle.label}
            </Link>
          ) : (
            <span />
          )}
          {mode === 'login' ? (
            <Link href="/auth/reset" className="text-[var(--blue-600)] underline">
              שכחת סיסמה?
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
