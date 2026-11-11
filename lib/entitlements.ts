// Access checks. A grant is one row of the entitlement table: which plan an
// account holds and until when. Nothing here knows about Paddle; the webhook
// writes grants, and the rest of the app only asks these functions.

import { PLANS, JOBS } from './catalog.ts';
import type { Feature, JobId, PlanId } from './catalog.ts';

export type Grant = {
  plan: PlanId;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  periodEnd: string; // ISO date-time; access runs to the end of the paid period
};

function live(g: Grant, now: Date): boolean {
  // A canceled plan keeps access until the period it paid for ends.
  // past_due keeps access too: Paddle retries the card before it cancels.
  return new Date(g.periodEnd).getTime() > now.getTime();
}

export function features(grants: Grant[], now: Date = new Date()): Set<Feature> {
  const out = new Set<Feature>();
  for (const g of grants) {
    if (!live(g, now)) continue;
    const plan = PLANS.find((p) => p.id === g.plan);
    if (plan) plan.features.forEach((f) => out.add(f));
  }
  return out;
}

export function can(grants: Grant[], feature: Feature, now: Date = new Date()): boolean {
  return features(grants, now).has(feature);
}

export function monthlyJobCredits(grants: Grant[], now: Date = new Date()): number {
  let n = 0;
  for (const g of grants) {
    if (!live(g, now)) continue;
    const plan = PLANS.find((p) => p.id === g.plan);
    if (plan && plan.jobCredits > n) n = plan.jobCredits;
  }
  return n;
}

export type JobCharge =
  | { how: 'plan'; price: 0 }
  | { how: 'credit'; price: 0 }
  | { how: 'pay'; price: number };

// How a quick job is paid for: covered by a plan, by a credit, or by checkout.
export function jobCharge(job: JobId, grants: Grant[], creditsLeft: number, now: Date = new Date()): JobCharge {
  const j = JOBS.find((x) => x.id === job);
  if (!j) throw new Error('Unknown job: ' + job);
  if (can(grants, j.includedWith, now)) return { how: 'plan', price: 0 };
  if (creditsLeft > 0) return { how: 'credit', price: 0 };
  return { how: 'pay', price: j.price };
}
