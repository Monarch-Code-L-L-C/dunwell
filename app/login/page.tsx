import type { Metadata } from 'next';
import { supabaseReady, googleSignIn } from '@/lib/supabase/env';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-[440px] px-6 pb-24 pt-16">
      <h1 className="font-serif text-[40px] font-semibold leading-[1.08]">Sign in to your workspace</h1>
      <p className="mt-3 text-[17px] leading-[1.55] text-body">
        No password. We email you a link, and the same link creates your account the first time.
      </p>
      {error === 'link' && (
        <p role="alert" className="mt-5 rounded-lg border border-red bg-card px-4 py-3 text-[15px] text-red">
          That link has expired or was already used. Enter your email for a new one.
        </p>
      )}
      {supabaseReady ? (
        <LoginForm google={googleSignIn} />
      ) : (
        <p className="mt-6 rounded-lg border border-line bg-card px-4 py-3 text-[15px] text-body">Sign-in is not switched on for this site yet.</p>
      )}
    </div>
  );
}
