'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm({ google, next }: { google: boolean; next: string }) {
  const back = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setState('sending');
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: back() },
    });
    if (error) {
      setState('idle');
      setError(error.status === 429 ? 'Too many links requested. Wait a minute and try again.' : 'We could not send the link. Check the address and try again.');
      return;
    }
    setState('sent');
  }

  async function withGoogle() {
    setError('');
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: back() },
    });
    if (error) setError('Google sign-in did not start. Try the email link instead.');
  }

  if (state === 'sent') {
    return (
      <div className="mt-6 rounded-xl border border-line bg-card p-5" role="status">
        <h2 className="text-[17px] font-semibold">Check your inbox</h2>
        <p className="mt-1.5 text-[15px] leading-normal text-body">
          We sent a sign-in link to <strong>{email.trim()}</strong>. Open it in this browser. It works once and expires after an hour.
        </p>
        <button type="button" onClick={() => setState('idle')} className="mt-3 text-[15px] font-semibold text-green underline underline-offset-4">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-[15px] font-semibold">Work email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email" inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-line bg-card px-3.5 py-3 text-[16px] outline-none focus:border-green"
        />
        <button type="submit" disabled={state === 'sending'} className="rounded-lg bg-ink px-5 py-3 text-[16px] font-semibold text-paper disabled:opacity-60">
          {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
      {google && (
        <button type="button" onClick={withGoogle} className="mt-3 w-full rounded-lg border border-line bg-card px-5 py-3 text-[16px] font-semibold">
          Continue with Google
        </button>
      )}
      {error && <p role="alert" className="mt-3 text-[15px] text-red">{error}</p>}
    </div>
  );
}
