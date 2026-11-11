import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, features, jobCharge, monthlyJobCredits } from '../lib/entitlements.ts';
import type { Grant } from '../lib/entitlements.ts';
import { PLANS, JOBS, euro } from '../lib/catalog.ts';

const now = new Date('2026-11-11T12:00:00Z');
const g = (plan: Grant['plan'], status: Grant['status'] = 'active', periodEnd = '2026-12-01T00:00:00Z'): Grant => ({ plan, status, periodEnd });

test('no grants means no paid features', () => {
  assert.equal(features([], now).size, 0);
  assert.equal(can([], 'chase.autopilot', now), false);
});

test('a plan unlocks its own features only', () => {
  assert.equal(can([g('chase')], 'chase.autopilot', now), true);
  assert.equal(can([g('chase')], 'contracts.build', now), false);
});

test('all access unlocks every feature of the three products', () => {
  const all = features([g('all')], now);
  for (const p of PLANS) for (const f of p.features) assert.ok(all.has(f), f);
});

test('canceled keeps access until the paid period ends, then loses it', () => {
  assert.equal(can([g('billing', 'canceled')], 'billing.recurring', now), true);
  assert.equal(can([g('billing', 'canceled', '2026-11-01T00:00:00Z')], 'billing.recurring', now), false);
});

test('an expired active grant gives nothing', () => {
  assert.equal(can([g('all', 'active', '2026-11-11T11:59:59Z')], 'chase.autopilot', now), false);
});

test('only all access carries monthly quick-job credits', () => {
  assert.equal(monthlyJobCredits([g('chase'), g('billing')], now), 0);
  assert.equal(monthlyJobCredits([g('all')], now), 5);
});

test('quick job: plan covers it, then credit, then pay the listed price', () => {
  assert.deepEqual(jobCharge('full-chase', [g('chase')], 0, now), { how: 'plan', price: 0 });
  assert.deepEqual(jobCharge('contract-brief', [g('chase')], 2, now), { how: 'credit', price: 0 });
  assert.deepEqual(jobCharge('contract-brief', [g('chase')], 0, now), { how: 'pay', price: 900 });
  assert.deepEqual(jobCharge('statement', [], 0, now), { how: 'pay', price: 300 });
});

test('catalog is consistent', () => {
  const single = PLANS.filter((p) => p.id !== 'all').reduce((s, p) => s + p.monthly, 0);
  assert.equal(single, 3300); // the pricing page says the three apart cost 33
  const every = new Set(PLANS.flatMap((p) => p.features));
  for (const j of JOBS) assert.ok(every.has(j.includedWith), j.id);
  assert.equal(euro(2500), '€25');
  assert.equal(euro(1050), '€10.50');
});
