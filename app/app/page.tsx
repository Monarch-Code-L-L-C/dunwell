import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseReady } from '@/lib/supabase/env';
import { PLANS } from '@/lib/catalog';
import { features, monthlyJobCredits } from '@/lib/entitlements';
import type { Grant } from '@/lib/entitlements';
import { signOut } from './actions';

export const metadata: Metadata = { title: 'Workspace', robots: { index: false } };

export default async function Workspace() {
  if (!supabaseReady) redirect('/login');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows, error } = await supabase.from('entitlements').select('plan, status, period_end');
  const grants: Grant[] = (rows ?? []).map((r) => ({ plan: r.plan, status: r.status, periodEnd: r.period_end }));
  const now = new Date();
  const held = PLANS.filter((p) => grants.some((g) => g.plan === p.id && new Date(g.periodEnd) > now));
  const unlocked = features(grants, now).size;
  const credits = monthlyJobCredits(grants, now);

  return (
    <div className="mx-auto max-w-[1160px] px-6 pb-20 pt-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] uppercase tracking-[0.1em] text-muted">Workspace</p>
          <h1 className="mt-2 font-serif text-[40px] font-semibold leading-[1.08]">You are signed in</h1>
          <p className="mt-2 text-[17px] text-body">{user.email}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="rounded-lg border border-line bg-card px-4 py-2.5 text-[15px] font-semibold">Sign out</button>
        </form>
      </div>

      <section className="mt-8 rounded-[14px] border border-line bg-card p-6">
        <h2 className="font-serif text-2xl font-semibold">Your plan</h2>
        {error ? (
          <p role="alert" className="mt-2 text-[15px] text-red">We could not load your plan. Refresh the page to try again.</p>
        ) : held.length === 0 ? (
          <p className="mt-2 text-[15px] leading-normal text-body">
            Free tools only. No plan is active on this account. <Link href="/pricing" className="font-semibold text-green underline underline-offset-4">See pricing</Link>
          </p>
        ) : (
          <p className="mt-2 text-[15px] leading-normal text-body">
            {held.map((p) => p.name).join(', ')}: {unlocked} features unlocked{credits > 0 ? `, ${credits} quick jobs a month` : ''}.
          </p>
        )}
      </section>

      <p className="mt-6 text-[15px] text-muted">Contracts, invoices and chasing arrive here as each one is built.</p>
    </div>
  );
}
