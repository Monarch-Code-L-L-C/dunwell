import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseReady } from '@/lib/supabase/env';
import { PLANS, JOBS } from '@/lib/catalog';
import { can } from '@/lib/entitlements';
import type { Grant } from '@/lib/entitlements';
import { paddle, checkoutReady } from '@/lib/paddle';

const TAX_CATEGORY = process.env.PADDLE_TAX_CATEGORY ?? 'standard';

// Creates a Paddle transaction for one plan or one quick job, priced from our
// own catalog and tagged with the signed-in account. The browser then opens
// Paddle's checkout for that transaction.
export async function POST(request: Request) {
  if (!supabaseReady || !checkoutReady) return NextResponse.json({ error: 'Checkout is not switched on yet.' }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const kind = body?.kind;
  let price: Record<string, unknown>;
  let custom: Record<string, string>;

  if (kind === 'plan') {
    const plan = PLANS.find((p) => p.id === body.id);
    const yearly = body.cycle === 'year';
    if (!plan || (yearly && plan.yearly === null)) return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 });

    const { data: rows, error } = await supabase.from('entitlements').select('plan, status, period_end');
    if (error) return NextResponse.json({ error: 'Could not check your current plan. Try again.' }, { status: 500 });
    const grants: Grant[] = (rows ?? []).map((r) => ({ plan: r.plan, status: r.status, periodEnd: r.period_end }));
    const now = new Date();
    const live = grants.filter((g) => g.status !== 'canceled' && new Date(g.periodEnd) > now);
    if (live.some((g) => g.plan === plan.id) || plan.features.every((f) => can(live, f, now))) {
      return NextResponse.json({ error: 'You already have everything in this plan.' }, { status: 409 });
    }

    price = {
      name: yearly ? 'Yearly' : 'Monthly',
      description: `${plan.name}, billed ${yearly ? 'yearly' : 'monthly'}`,
      billing_cycle: { interval: yearly ? 'year' : 'month', frequency: 1 },
      unit_price: { amount: String(yearly ? plan.yearly : plan.monthly), currency_code: 'EUR' },
      tax_mode: 'external',
      product: { name: `Dunwell ${plan.name}`, tax_category: TAX_CATEGORY, description: plan.points.join('. ') + '.' },
    };
    custom = { account_id: user.id, kind: 'plan', plan: plan.id };
  } else if (kind === 'job') {
    const job = JOBS.find((j) => j.id === body.id);
    if (!job) return NextResponse.json({ error: 'Unknown job.' }, { status: 400 });
    price = {
      name: 'One-off',
      description: `${job.name}, one use`,
      billing_cycle: null,
      unit_price: { amount: String(job.price), currency_code: 'EUR' },
      tax_mode: 'external',
      product: { name: `Dunwell: ${job.name}`, tax_category: TAX_CATEGORY, description: `One use of the "${job.name}" quick job.` },
    };
    custom = { account_id: user.id, kind: 'job', job: job.id };
  } else {
    return NextResponse.json({ error: 'Unknown item.' }, { status: 400 });
  }

  try {
    const txn = await paddle('POST', '/transactions', {
      items: [{ quantity: 1, price }],
      currency_code: 'EUR',
      collection_mode: 'automatic',
      custom_data: custom,
    });
    return NextResponse.json({ transactionId: txn.id });
  } catch (e) {
    console.error('checkout', e);
    return NextResponse.json({ error: 'We could not start the checkout. Try again in a moment.' }, { status: 502 });
  }
}
