const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

const base = { regime: 'uk', amount: '5000', dueDate: '2026-09-11', invoiceNumber: 'INV-1', clientCompany: 'Acme Ltd', yourName: 'Jo Smith' };
const run = (over, opts) => E.chase(Object.assign({}, base, over), Object.assign({ today: '2026-11-10', pro: true }, opts));
// normalize() only trusts a client "today" within a day of the real date, so pin the clock.
test.before(() => test.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-10T12:00:00Z') }));

test('UK: 60 days at 8% + 3.75% base, £70 compensation', () => {
  const r = run();
  assert.equal(r.summary.days, 60);
  assert.equal(r.summary.rate, 11.75);
  assert.equal(r.summary.interest, 96.58);           // 5000 * 0.1175 * 60 / 365
  assert.equal(r.summary.compensation, 70);
  assert.equal(r.summary.total, 5166.58);
});
test('UK compensation tiers', () => {
  assert.equal(run({ amount: '999.99' }).summary.compensation, 40);
  assert.equal(run({ amount: '1000' }).summary.compensation, 70);
  assert.equal(run({ amount: '10000' }).summary.compensation, 100);
});
test('UK: interest is split when the reference rate changes between half-years', () => {
  const inp = E.normalize(Object.assign({}, base, { amount: '1000', dueDate: '2025-12-01' })).input;
  const c = E.calcInterest(inp, E.parseDate('2026-01-30'));
  assert.equal(c.segments.length, 2);
  assert.deepEqual(c.segments.map((s) => [s.days, s.rate]), [[30, 12.25], [30, 11.75]]);
  assert.equal(c.interest, 19.73);                    // 1000 * (0.1225*30 + 0.1175*30) / 365
});
test('EU: ECB 2.15% + 8 points, €40', () => {
  const r = run({ regime: 'eu', amount: '800', dueDate: '2026-10-01' });
  assert.equal(r.summary.currency, 'EUR');
  assert.equal(r.summary.interest, 8.9);              // 800 * 0.1015 * 40 / 365
  assert.equal(r.summary.total, 848.9);
});
test('Contract: 1.5% a month is 18% a year, plus late fee', () => {
  const r = run({ regime: 'contract', currency: 'USD', contractRate: '1.5', ratePer: 'month', lateFee: '25', amount: '2000' });
  assert.equal(r.summary.interest, 59.18);            // 2000 * 0.18 * 60 / 365
  assert.equal(r.summary.total, 2084.18);
});
test('No interest: letters never mention interest', () => {
  const r = run({ regime: 'none', currency: 'EUR' });
  assert.equal(r.summary.total, 5000);
  for (const s of r.steps) assert.doesNotMatch(s.body, /interest/i);
});
test('Schedule: 60 days overdue opens at the final notice, formal letter follows', () => {
  const s = run().steps;
  assert.deepEqual(s.map((x) => x.status), ['earlier', 'earlier', 'earlier', 'now', 'upcoming']);
  assert.equal(s[4].sendOn, '2026-11-17');
  assert.match(s[4].body, /LETTER BEFORE CLAIM/);
  assert.match(s[4].body, /County Court/);
});
test('Schedule: not yet due means everything is upcoming and nothing is owed', () => {
  const r = run({ dueDate: '2026-11-20' });
  assert.equal(r.summary.interest, 0); assert.equal(r.summary.compensation, 0);
  assert.ok(r.steps.every((x) => x.status === 'upcoming'));
  assert.equal(r.steps[0].sendOn, '2026-11-23');
});
test('Letter figures match the calculation on the send date', () => {
  const r = run({ dueDate: '2026-10-20' });           // 21 days overdue: interest notice today
  const s = r.steps[2];
  assert.equal(s.status, 'now');
  assert.match(s.body, /£5,103\.80/);                 // 5000 + 33.80 interest (5000*0.1175*21/365) + 70
  assert.match(s.body, /£1\.61 a day/);
});
test('Free plan: steps 3 to 5 are withheld, no calendar', () => {
  const r = run({}, { pro: false });
  assert.deepEqual(r.steps.map((s) => s.locked), [false, false, true, true, true]);
  for (const s of r.steps.slice(2)) { assert.equal(s.body, undefined); assert.ok(s.preview.length > 20); }
  assert.equal(r.ics, null);
});
test('Pro: calendar file lists the remaining steps', () => {
  const ics = run({ dueDate: '2026-11-01' }).ics;
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 5);
});
test('Validation: clear messages, nothing generated', () => {
  const r = E.chase({ regime: 'uk', amount: '-5', dueDate: 'nope' }, {});
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['amount', 'clientCompany', 'dueDate', 'invoiceNumber', 'yourName']);
  assert.equal(run({ dueDate: '2021-06-01' }).ok, false);
});
test('Input is length-capped and control characters stripped', () => {
  const v = E.normalize(Object.assign({}, base, { clientCompany: 'A\u0000B' + 'x'.repeat(500) }));
  assert.equal(v.input.clientCompany.length, 120);
  assert.ok(!v.input.clientCompany.includes('\u0000'));
});
