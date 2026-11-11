import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseReady } from '@/lib/supabase/env';
import { PLANS, JOBS } from '@/lib/catalog';
import { purchasedLeft, allowanceLeft } from '@/lib/credits';
import type { LedgerRow } from '@/lib/credits';
import { PortalButton } from '@/components/BuyButton';
import { features, monthlyJobCredits } from '@/lib/entitlements';
import type { Grant } from '@/lib/entitlements';
import { signOut } from './actions';

export const metadata: Metadata = { title: 'Workspace', robots: { index: false } };

export default async function Workspace({ searchParams }: { searchParams: Promise<{ purchased?: string }> }) {
  const { purchased } = await searchParams;
  if (!supabaseReady) redirect('/login');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows, error } = await supabase.from('entitlements').select('plan, status, period_end');
  const grants: Grant[] = (rows ?? []).map((r) => ({ plan: r.plan, status: r.status, periodEnd: r.period_end }));
  const now = new Date();
  const held = PLANS.filter((p) => grants.some((g) => g.plan === p.id && new Date(g.periodEnd) > now));
  const unlocked = features(grants, now).size;
  const monthly = monthlyJobCredits(grants, now);

  const { data: ledgerRows, error: ledgerError } = await supabase.from('credit_ledger').select('delta, job, source, created_at');
  const ledger: LedgerRow[] = (ledgerRows ?? []).map((r) => ({ delta: r.delta, job: r.job, source: r.source, createdAt: r.created_at }));
  const bought = JOBS.map((j) => ({ name: j.name, left: purchasedLeft(ledger, j.id) })).filter((x) => x.left > 0);
  const allowance = allowanceLeft(ledger, monthly, now);

  const { data: account } = await supabase.from('accounts').select('paddle_customer_id').eq('id', user.id).maybeSingle();

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

      {purchased === '1' && (
        <p role="status" className="mt-6 rounded-lg border border-green bg-card px-4 py-3 text-[15px] text-green">
          Payment received. If your purchase is not shown below yet, refresh this page in a few seconds.
        </p>
      )}

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
            {held.map((p) => p.name).join(', ')}: {unlocked} features unlocked.
          </p>
        )}
        {account?.paddle_customer_id && (
          <div className="mt-4">
            <PortalButton className="rounded-lg border border-line bg-paper px-4 py-2.5 text-[15px] font-semibold disabled:opacity-60" />
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[14px] border border-line bg-card p-6">
        <h2 className="font-serif text-2xl font-semibold">Quick-job credits</h2>
        {ledgerError ? (
          <p role="alert" className="mt-2 text-[15px] text-red">We could not load your credits. Refresh the page to try again.</p>
        ) : bought.length === 0 && monthly === 0 ? (
          <p className="mt-2 text-[15px] leading-normal text-body">None yet. A credit is added here each time you buy a quick job.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5 text-[15px] text-body">
            {monthly > 0 && <li>{allowance} of {monthly} left this month on your plan, for any quick job</li>}
            {bought.map((b) => <li key={b.name}>{b.name}: {b.left}</li>)}
          </ul>
        )}
      </section>

      <p className="mt-6 text-[15px] text-muted">Contracts, invoices and chasing arrive here as each one is built.</p>
    </div>
  );
}
