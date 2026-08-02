import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
export const metadata: Metadata = { title: 'איפוס סיסמה' };
export default function ResetPage() {
  return <AuthForm mode="reset" />;
}
