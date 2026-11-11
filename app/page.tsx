import Link from 'next/link';
import { TOOLS } from '@/lib/catalog';
import type { Tool } from '@/lib/catalog';

const STAGES = [
  { n: '01', name: 'Agree', line: 'A contract with deposits, due dates and late terms built in.' },
  { n: '02', name: 'Bill', line: 'Invoices that carry those terms and work out their own due date.' },
  { n: '03', name: 'Collect', line: 'Reminders that send themselves and stop when you are paid.' },
  { n: '04', name: 'See', line: 'What is owed, what is coming, and which clients pay late.' },
];

const CHASE_STEPS = [
  { name: 'Friendly nudge', note: 'Sent', state: 'done' },
  { name: 'Firm follow-up', note: 'Sent', state: 'done' },
  { name: 'Interest notice', note: 'Goes out Friday', state: 'next' },
  { name: 'Final notice', note: 'Scheduled', state: 'later' },
];

const PROMISES = [
  { h: 'Sent in your name', p: 'Every message comes from your business. Your client always knows who is asking.' },
  { h: 'We never touch your money', p: 'Clients pay you directly, into your own account or payment link.' },
  { h: 'Documents, not legal advice', p: 'Built from reviewed clauses and published rates. You stay in control of what is sent.' },
];

function ToolCard({ t }: { t: Tool }) {
  const live = t.status === 'live' && t.href;
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-[0.08em] text-muted">{t.stage}</span>
        <span className="rounded-full bg-chip px-2.5 py-[3px] font-mono text-xs font-semibold">{t.price}</span>
      </span>
      <span className="font-serif text-[22px] font-semibold leading-[1.15]">{t.name}</span>
      <span className="text-sm leading-[1.45] text-body">{t.line}</span>
      {!live && <span className="mt-auto text-xs font-semibold uppercase tracking-[0.08em] text-muted">In build</span>}
    </>
  );
  const cls = 'flex min-h-[148px] flex-col gap-2.5 rounded-xl border border-line bg-card px-[18px] pb-4 pt-[18px]';
  return live ? (
    <a href={t.href} className={`${cls} transition-colors hover:border-green`}>{body}</a>
  ) : (
    <div className={`${cls} opacity-80`}>{body}</div>
  );
}

export default function Home() {
  return (
    <>
      <section className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-14 px-6 pb-10 pt-12 md:pt-[72px]">
        <div className="min-w-0 flex-[1_1_520px]">
          <p className="mb-[18px] text-[13px] uppercase tracking-[0.1em] text-muted">Everything between the handshake and the money</p>
          <h1 className="font-serif text-[44px] font-semibold leading-[1.04] tracking-[-0.015em] md:text-[64px]">
            Get paid. On time, in full, <em className="text-green">without the awkward part.</em>
          </h1>
          <p className="mt-6 max-w-[34em] text-[19px] leading-[1.55] text-body">
            Contracts that protect your payment, invoices that carry the terms, and chasing that runs itself. One workspace, or one tool at a time.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <Link href="/#tools" className="rounded-lg bg-ink px-6 py-[15px] text-[17px] font-semibold text-paper">Pick a tool</Link>
            <Link href="/pricing" className="text-base font-semibold text-green underline underline-offset-4">See pricing</Link>
          </div>
        </div>
        <div className="min-w-0 flex-[1_1_380px] rounded-[14px] border border-line bg-card p-[26px] shadow-[0_18px_40px_-28px_rgba(23,33,28,0.5)]">
          <p className="text-[13px] uppercase tracking-[0.06em] text-muted">Example: Northgate Studio owes you</p>
          <p className="mb-0.5 mt-1.5 font-mono text-[44px] font-semibold tracking-[-0.02em] text-red">£2,488.54</p>
          <p className="mb-[18px] text-sm text-muted">24 days overdue. Growing by £0.77 a day.</p>
          <ul className="flex flex-col gap-2.5">
            {CHASE_STEPS.map((s) => (
              <li key={s.name} className={`flex items-center gap-2.5 text-sm ${s.state === 'later' ? 'text-muted' : ''}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${s.state === 'done' ? 'bg-green' : s.state === 'next' ? 'bg-red' : 'border-2 border-[#B5AD99]'}`} />
                <span className={`flex-1 ${s.state === 'next' ? 'font-semibold' : ''}`}>{s.name}</span>
                <span className={s.state === 'done' ? 'font-semibold text-green' : s.state === 'next' ? 'font-semibold text-red' : ''}>{s.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-[18px] border-t border-dashed border-line pt-3.5 text-[13px] text-muted">You enter the invoice once. Dunwell does the rest.</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1160px] px-6 pb-12 pt-2">
        <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-line bg-card sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((s) => (
            <div key={s.n} className="border-b border-line px-[22px] py-5 lg:border-b-0 lg:border-r lg:last:border-r-0">
              <p className="font-mono text-xs text-muted">{s.n}</p>
              <h2 className="mb-1.5 mt-1 font-serif text-2xl font-semibold">{s.name}</h2>
              <p className="text-sm leading-normal text-body">{s.line}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-[1160px] scroll-mt-6 px-6 pb-14 pt-6">
        <div className="mb-[22px] flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-serif text-4xl font-semibold">Pick the job in front of you</h2>
          <p className="text-[15px] text-muted">Free tools need no account. Quick jobs are pay-as-you-go.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((t) => <ToolCard key={t.name} t={t} />)}
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto flex max-w-[1160px] flex-wrap gap-10 px-6 py-9">
          {PROMISES.map((x) => (
            <div key={x.h} className="min-w-0 flex-[1_1_260px]">
              <h3 className="mb-1.5 text-[17px] font-semibold">{x.h}</h3>
              <p className="text-[15px] leading-normal text-body">{x.p}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
