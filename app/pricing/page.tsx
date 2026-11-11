import Link from 'next/link';
import type { Metadata } from 'next';
import { JOBS, PLANS, euro } from '@/lib/catalog';
import { checkoutReady, PADDLE_ENV, PADDLE_CLIENT_TOKEN } from '@/lib/paddle';
import BuyButton from '@/components/BuyButton';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Pay for one job, one product, or the whole Dunwell workspace. Free tools stay free.',
};

const NOTES = [
  { h: 'Cancel in two clicks', p: 'You keep access until the end of the period you paid for.' },
  { h: 'Your client pays you, not us', p: 'Dunwell never holds or moves your money and takes no cut of what you recover.' },
  { h: 'Prices exclude VAT', p: 'Added at checkout where it applies.' },
];

export default function Pricing() {
  const products = PLANS.filter((p) => p.id !== 'all');
  const all = PLANS.find((p) => p.id === 'all')!;
  const apart = products.reduce((s, p) => s + p.monthly, 0);
  // Buying is open in test mode only, until the tools behind each plan are built.
  const selling = checkoutReady && PADDLE_ENV === 'sandbox';
  const paddle = { token: PADDLE_CLIENT_TOKEN, env: PADDLE_ENV } as const;

  return (
    <div className="mx-auto max-w-[1160px] px-6 pb-16 pt-14">
      <p className="text-[13px] uppercase tracking-[0.1em] text-muted">Pricing</p>
      <h1 className="mt-3 max-w-[16em] font-serif text-[40px] font-semibold leading-[1.06] tracking-[-0.015em] md:text-[52px]">
        Pay for one job, one product, or the whole workspace.
      </h1>
      <p className="mt-5 max-w-[38em] text-lg leading-[1.55] text-body">
        The free tools stay free. {selling ? '' : 'Checkout opens when the workspace launches.'}
      </p>
      {selling && (
        <p className="mt-4 inline-block rounded-lg border border-red bg-card px-4 py-2.5 text-[15px] text-red">
          Test mode. Checkout takes Paddle test cards only and no real money moves.
        </p>
      )}

      <div className="mt-10 flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[1_1_300px] rounded-[14px] border border-line bg-card p-6">
          <h2 className="font-serif text-[26px] font-semibold">Quick jobs</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Pay once. No subscription.</p>
          <ul>
            {JOBS.map((j) => (
              <li key={j.id} className="flex justify-between gap-4 border-t border-dashed border-line py-2.5 text-[15px]">
                <span>
                  {j.name}
                  {selling && (
                    <span className="block">
                      <BuyButton item={{ kind: 'job', id: j.id }} paddle={paddle} label="Buy one" className="text-sm font-semibold text-green underline underline-offset-4 disabled:opacity-60" />
                    </span>
                  )}
                </span>
                <span className="font-mono font-semibold">{euro(j.price)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0 flex-[3_1_620px]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {products.map((p) => (
              <div key={p.id} className="rounded-[14px] border border-line bg-card p-6">
                <p className="text-xs uppercase tracking-[0.08em] text-muted">{p.stage}</p>
                <h2 className="mt-1 font-serif text-[26px] font-semibold">{p.name}</h2>
                <p className="mb-4 mt-2">
                  <span className="font-mono text-[32px] font-semibold">{euro(p.monthly)}</span>
                  <span className="text-sm text-muted"> a month</span>
                </p>
                <ul className="flex flex-col gap-2 text-[15px] leading-snug text-body">
                  {p.points.map((x) => <li key={x}>{x}</li>)}
                </ul>
                {selling && (
                  <div className="mt-5">
                    <BuyButton item={{ kind: 'plan', id: p.id, cycle: 'month' }} paddle={paddle} label={`Start ${p.name}`} className="w-full rounded-lg bg-ink px-4 py-2.5 text-[15px] font-semibold text-paper disabled:opacity-60" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-8 rounded-[14px] bg-ink p-7 text-paper">
            <div className="min-w-0 flex-[2_1_320px]">
              <p className="text-xs uppercase tracking-[0.08em] text-[#B9C4BC]">Best value</p>
              <h2 className="mt-1 font-serif text-[30px] font-semibold">{all.name}</h2>
              <p className="mt-2 text-[15px] leading-normal text-[#DDE3DD]">
                Chase, Contracts and Billing together, plus {all.jobCredits} quick jobs every month. Your contract terms flow into your invoices, and your invoices into your chases.
              </p>
            </div>
            <div className="min-w-0 flex-[1_1_200px]">
              <p>
                <span className="font-mono text-[40px] font-semibold">{euro(all.monthly)}</span>
                <span className="text-sm text-[#B9C4BC]"> a month</span>
              </p>
              <p className="mt-1 text-sm text-[#DDE3DD]">
                {all.yearly !== null && <>or {euro(all.yearly)} a year. </>}The three products apart cost {euro(apart)}.
              </p>
              {selling && (
                <div className="mt-4 flex flex-col gap-2">
                  <BuyButton item={{ kind: 'plan', id: 'all', cycle: 'month' }} paddle={paddle} label="Start monthly" className="w-full rounded-lg bg-paper px-4 py-2.5 text-[15px] font-semibold text-ink disabled:opacity-60" />
                  {all.yearly !== null && (
                    <BuyButton item={{ kind: 'plan', id: 'all', cycle: 'year' }} paddle={paddle} label="Start yearly" className="w-full rounded-lg border border-[#5A655E] px-4 py-2.5 text-[15px] font-semibold text-paper disabled:opacity-60" />
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-line bg-card p-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Free, with no account</h2>
          <p className="mt-1 text-[15px] text-body">Interest calculator, invoice maker, late-fee clause, first two reminder emails, guides.</p>
        </div>
        <Link href="/#tools" className="rounded-lg bg-ink px-5 py-3 text-[15px] font-semibold text-paper">See the tools</Link>
      </div>

      <div className="mt-10 flex flex-wrap gap-10">
        {NOTES.map((n) => (
          <div key={n.h} className="min-w-0 flex-[1_1_240px]">
            <h3 className="mb-1.5 text-[17px] font-semibold">{n.h}</h3>
            <p className="text-[15px] leading-normal text-body">{n.p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
