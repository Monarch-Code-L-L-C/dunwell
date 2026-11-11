import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature } from '../lib/paddle.ts';
import { toOps } from '../lib/billing-events.ts';
import { purchasedLeft, allowanceLeft } from '../lib/credits.ts';
import type { LedgerRow } from '../lib/credits.ts';

const secret = 'test-secret';
const sign = (body: string, ts: number, key = secret) => `ts=${ts};h1=${createHmac('sha256', key).update(`${ts}:${body}`).digest('hex')}`;
const ACC = '3f0c1c1e-8a54-4a6e-9a0b-2f6d6f1f7a11';

test('signature: accepts a correctly signed body', () => {
  const body = '{"a":1}';
  assert.equal(verifySignature(body, sign(body, 1000), secret, 1000_000), true);
});

test('signature: rejects a changed body, wrong secret, old timestamp and junk', () => {
  const body = '{"a":1}';
  assert.equal(verifySignature('{"a":2}', sign(body, 1000), secret, 1000_000), false);
  assert.equal(verifySignature(body, sign(body, 1000, 'other'), secret, 1000_000), false);
  assert.equal(verifySignature(body, sign(body, 1000), secret, 2000_000), false);
  assert.equal(verifySignature(body, null, secret), false);
  assert.equal(verifySignature(body, 'ts=abc;h1=zz', secret), false);
  assert.equal(verifySignature(body, sign(body, 1000), '', 1000_000), false);
});

const sub = (over: object = {}, custom: object = { account_id: ACC, kind: 'plan', plan: 'chase' }) => ({
  event_type: 'subscription.created', occurred_at: '2026-11-11T20:00:00Z',
  data: { id: 'sub_1', status: 'active', customer_id: 'ctm_1', custom_data: custom, current_billing_period: { starts_at: '2026-11-11T20:00:00Z', ends_at: '2026-12-11T20:00:00Z' }, ...over },
});

test('subscription event grants the plan to the end of the paid period', () => {
  const ops = toOps(sub());
  assert.deepEqual(ops[0], { t: 'customer', accountId: ACC, customerId: 'ctm_1' });
  assert.deepEqual(ops[1], { t: 'entitlement', row: { account_id: ACC, plan: 'chase', status: 'active', period_end: '2026-12-11T20:00:00Z', cancel_at: null, paddle_subscription_id: 'sub_1', updated_at: '2026-11-11T20:00:00Z' } });
});

test('canceled subscription ends when it was canceled; paused counts as canceled', () => {
  const c = toOps({ ...sub({ status: 'canceled', current_billing_period: null, canceled_at: '2026-12-11T20:00:00Z' }), event_type: 'subscription.canceled' });
  const row = (c[1] as any).row;
  assert.equal(row.status, 'canceled');
  assert.equal(row.period_end, '2026-12-11T20:00:00Z');
  const p = toOps(sub({ status: 'paused', current_billing_period: null, paused_at: '2026-11-20T00:00:00Z' }));
  assert.equal((p[1] as any).row.status, 'canceled');
  assert.equal((p[1] as any).row.period_end, '2026-11-20T00:00:00Z');
});

test('a scheduled cancellation keeps the plan active and records when it ends', () => {
  const row = (toOps({ ...sub({ scheduled_change: { action: 'cancel', effective_at: '2026-12-11T20:00:00Z', resume_at: null } }), event_type: 'subscription.updated' })[1] as any).row;
  assert.equal(row.status, 'active');
  assert.equal(row.cancel_at, '2026-12-11T20:00:00Z');
  assert.equal((toOps(sub({ scheduled_change: { action: 'pause', effective_at: '2026-12-11T20:00:00Z' } }))[1] as any).row.cancel_at, null);
});

test('events without a valid account id, or for unknown plans, change nothing', () => {
  assert.deepEqual(toOps(sub({}, { kind: 'plan', plan: 'chase' })), []);
  assert.deepEqual(toOps(sub({}, { account_id: 'not-a-uuid', plan: 'chase' })), []);
  assert.deepEqual(toOps(sub({ custom_data: null })), []);
  assert.equal(toOps(sub({}, { account_id: ACC, plan: 'gold' })).some((o) => o.t === 'entitlement'), false);
  assert.deepEqual(toOps({}), []);
});

test('a completed quick-job purchase adds one credit for that job only', () => {
  const ev = { event_type: 'transaction.completed', occurred_at: '2026-11-11T20:00:00Z', data: { id: 'txn_1', customer_id: 'ctm_1', custom_data: { account_id: ACC, kind: 'job', job: 'contract-check' } } };
  const credit = toOps(ev).find((o) => o.t === 'credit');
  assert.deepEqual(credit, { t: 'credit', row: { account_id: ACC, delta: 1, job: 'contract-check', source: 'purchase', reason: 'purchase', paddle_transaction_id: 'txn_1' } });
  // A plan's own payment is not a job credit, and other transaction events are ignored.
  assert.equal(toOps({ ...ev, data: { ...ev.data, custom_data: { account_id: ACC, kind: 'plan', plan: 'all' } } }).some((o) => o.t === 'credit'), false);
  assert.equal(toOps({ ...ev, event_type: 'transaction.paid' }).some((o) => o.t === 'credit'), false);
  assert.equal(toOps({ ...ev, data: { ...ev.data, custom_data: { account_id: ACC, kind: 'job', job: 'nope' } } }).some((o) => o.t === 'credit'), false);
});

test('credits: purchased credits are per job; allowance resets each month', () => {
  const rows: LedgerRow[] = [
    { delta: 1, job: 'statement', source: 'purchase', createdAt: '2026-10-01T00:00:00Z' },
    { delta: 1, job: 'statement', source: 'purchase', createdAt: '2026-10-02T00:00:00Z' },
    { delta: -1, job: 'statement', source: 'purchase', createdAt: '2026-10-03T00:00:00Z' },
    { delta: -1, job: 'change-order', source: 'allowance', createdAt: '2026-10-20T00:00:00Z' },
    { delta: -1, job: 'change-order', source: 'allowance', createdAt: '2026-11-02T00:00:00Z' },
  ];
  const now = new Date('2026-11-11T12:00:00Z');
  assert.equal(purchasedLeft(rows, 'statement'), 1);
  assert.equal(purchasedLeft(rows, 'change-order'), 0);
  assert.equal(allowanceLeft(rows, 5, now), 4);
  assert.equal(allowanceLeft(rows, 0, now), 0);
  assert.equal(allowanceLeft(rows, 5, new Date('2026-12-01T00:00:00Z')), 5);
});
