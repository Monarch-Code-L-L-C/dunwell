// Turns one Paddle webhook event into the database changes it implies.
// Pure: no network, no database. The webhook route applies the result.

import { PLANS, JOBS } from './catalog.ts';

export type Op =
  | { t: 'customer'; accountId: string; customerId: string }
  | { t: 'entitlement'; row: { account_id: string; plan: string; status: 'active' | 'trialing' | 'past_due' | 'canceled'; period_end: string; paddle_subscription_id: string; updated_at: string } }
  | { t: 'credit'; row: { account_id: string; delta: number; job: string; source: 'purchase'; reason: string; paddle_transaction_id: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS: Record<string, 'active' | 'trialing' | 'past_due' | 'canceled'> = {
  active: 'active', trialing: 'trialing', past_due: 'past_due', paused: 'canceled', canceled: 'canceled',
};

export function toOps(event: any): Op[] {
  const type: string = event?.event_type ?? '';
  const data = event?.data;
  const custom = data?.custom_data;
  const accountId: unknown = custom?.account_id;
  // Only purchases started from a signed-in Dunwell account carry an account id.
  if (!data || typeof accountId !== 'string' || !UUID.test(accountId)) return [];
  const at: string = event.occurred_at ?? new Date().toISOString();
  const ops: Op[] = [];

  if (typeof data.customer_id === 'string' && data.customer_id.startsWith('ctm_')) {
    ops.push({ t: 'customer', accountId, customerId: data.customer_id });
  }

  if (type.startsWith('subscription.')) {
    const plan = PLANS.find((p) => p.id === custom.plan);
    const status = STATUS[data.status];
    if (!plan || !status || typeof data.id !== 'string') return ops;
    // Access runs to the end of the paid period. A subscription that has ended
    // has no current period, so its end is the moment it was canceled.
    const periodEnd: string = (status === 'canceled' ? (data.canceled_at ?? data.paused_at) : data.current_billing_period?.ends_at) ?? data.current_billing_period?.ends_at ?? at;
    ops.push({ t: 'entitlement', row: { account_id: accountId, plan: plan.id, status, period_end: periodEnd, paddle_subscription_id: data.id, updated_at: at } });
    return ops;
  }

  if (type === 'transaction.completed' && custom.kind === 'job') {
    const job = JOBS.find((j) => j.id === custom.job);
    if (!job || typeof data.id !== 'string') return ops;
    ops.push({ t: 'credit', row: { account_id: accountId, delta: 1, job: job.id, source: 'purchase', reason: 'purchase', paddle_transaction_id: data.id } });
  }
  return ops;
}
