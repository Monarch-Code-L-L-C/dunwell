// End-to-end over HTTP. Paddle and the AI provider are replaced by a local stub that
// mimics their documented response shapes, so this proves our side of the wire, not theirs.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const calls = [];
const TXN = 'txn_01k9ppwf885xk7azx0xgnp6kp1', TXN_PAID = 'txn_01k9ppwf885xk7azx0xgnp6kp2', TXN_DRAFT = 'txn_01k9ppwf885xk7azx0xgnp6kp3';
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    calls.push({ method: req.method, url: req.url, body, auth: req.headers.authorization, key: req.headers['x-api-key'] });
    const json = (o, s) => { res.writeHead(s || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const data = (d, s) => json({ data: d, meta: { request_id: 'r' } }, s);
    if (req.url === '/transactions/' + TXN) return data({ id: TXN, status: 'completed', subscription_id: 'sub_1', customer_id: 'ctm_1' });
    if (req.url === '/transactions/' + TXN_PAID) return data({ id: TXN_PAID, status: 'paid', subscription_id: null, customer_id: 'ctm_1' });
    if (req.url === '/transactions/' + TXN_DRAFT) return data({ id: TXN_DRAFT, status: 'ready', subscription_id: null });
    if (req.url.startsWith('/customers?')) return data(req.url.includes('paid%40example.com') ? [{ id: 'ctm_1' }] : []);
    if (req.url.startsWith('/subscriptions?')) return data([{ id: 'sub_1', status: 'active' }]);
    if (req.url === '/customers/ctm_1/portal-sessions' && req.method === 'POST') return data({ urls: { general: { overview: 'https://customer-portal.paddle.test/cpl_1' } } }, 201);
    if (req.url === '/v1/messages') return json({ content: [{ type: 'text', text: 'Rewritten email body.' }] });
    json({ error: { type: 'request_error', code: 'not_found', detail: 'Entity not found' } }, 404);
  });
});

let base, server;
const invoice = { regime: 'uk', amount: '2400', dueDate: '2026-01-05', invoiceNumber: 'INV-0142', clientCompany: 'Northgate Studio', yourName: 'Jo Smith' };
const post = (path, body, cookie) => fetch(base + path, { method: 'POST', redirect: 'manual',
  headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}), body: JSON.stringify(body) });

test.before(async () => {
  await new Promise((r) => stub.listen(0, r));
  const up = `http://127.0.0.1:${stub.address().port}`;
  Object.assign(process.env, { PADDLE_API_BASE: up, ANTHROPIC_API_BASE: up, PADDLE_API_KEY: 'pdl_sdbx_x', PADDLE_CLIENT_TOKEN: 'test_tok', PADDLE_PRICE_MONTHLY: 'pri_m',
    ANTHROPIC_API_KEY: 'sk-ant-test', SESSION_SECRET: 'test-secret', DEV_UNLOCK: '', BASE_URL: 'http://localhost:3999' });
  server = require('../server');
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); stub.close(); });

test('landing page and assets are served with security headers', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Chase the invoice/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(base + '/styles.css')).status, 200);
  assert.equal((await fetch(base + '/privacy')).status, 200);
  assert.equal((await fetch(base + '/nope')).status, 404);
  assert.equal((await fetch(base + '/..%2fserver.js')).status, 403);
});

test('anonymous visitor: calculator works, paid steps are withheld', async () => {
  const r = await post('/api/chase', invoice);
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.pro, false);
  assert.ok(d.summary.interest > 0);
  assert.ok(d.steps[0].body.includes('INV-0142'));
  assert.equal(d.steps[3].body, undefined);
  assert.equal((await post('/api/tailor', { body: 'x', context: 'long enough' })).status, 402);
});

test('bad input returns field errors; malformed JSON returns 400', async () => {
  const r = await post('/api/chase', { regime: 'uk' });
  assert.equal(r.status, 422);
  assert.ok((await r.json()).errors.amount);
  const bad = await fetch(base + '/api/chase', { method: 'POST', body: '{nope' });
  assert.equal(bad.status, 400);
});

test('config exposes only the public Paddle values', async () => {
  const cfg = await (await fetch(base + '/api/config')).json();
  assert.deepEqual(cfg.paddle, { env: 'sandbox', token: 'test_tok', prices: { monthly: 'pri_m', yearly: null } });
  assert.ok(!JSON.stringify(cfg).includes('pdl_sdbx_x'));
});

test('completed transaction -> Pro cookie -> full chase, tailoring and billing portal', async () => {
  const un = await post('/api/unlock', { transactionId: TXN });
  assert.equal(un.status, 200);
  assert.equal(calls.find((c) => c.url === '/transactions/' + TXN).auth, 'Bearer pdl_sdbx_x');
  const cookie = un.headers.get('set-cookie').split(';')[0];
  assert.match(un.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);

  const cfg = await (await fetch(base + '/api/config', { headers: { cookie } })).json();
  assert.equal(cfg.pro, true); assert.equal(cfg.canManage, true); assert.equal(cfg.ai, true);

  const d = await (await post('/api/chase', invoice, cookie)).json();
  assert.equal(d.pro, true);
  assert.ok(d.steps.every((s) => typeof s.body === 'string'));
  assert.match(d.ics, /BEGIN:VCALENDAR/);

  const t = await post('/api/tailor', { body: d.steps[2].body, context: 'They are waiting on their own client.' }, cookie);
  assert.deepEqual(await t.json(), { body: 'Rewritten email body.' });
  const ai = calls.find((c) => c.url === '/v1/messages');
  assert.equal(ai.key, 'sk-ant-test');
  assert.ok(JSON.parse(ai.body).messages[0].content.includes('waiting on their own client'));

  const portal = await (await post('/api/portal', {}, cookie)).json();
  assert.equal(portal.url, 'https://customer-portal.paddle.test/cpl_1');
});

test('paid-but-not-yet-completed transaction asks the browser to retry', async () => {
  const r = await post('/api/unlock', { transactionId: TXN_PAID });
  assert.equal(r.status, 202);
  assert.equal(r.headers.get('set-cookie'), null);
});

test('unpaid, unknown or malformed transactions and tampered cookies do not unlock Pro', async () => {
  for (const id of [TXN_DRAFT, 'txn_01k9ppwf885xk7azx0xgnp6kp9', '../../etc', '']) {
    const r = await post('/api/unlock', { transactionId: id });
    assert.equal(r.status, 402, id);
    assert.equal(r.headers.get('set-cookie'), null);
  }
  const forged = 'dw_pro=' + Buffer.from(JSON.stringify({ sub: 'sub_1', chk: Date.now() + 1e9 })).toString('base64url') + '.AAAA';
  assert.equal((await (await post('/api/chase', invoice, forged)).json()).pro, false);
});

test('restore by billing email', async () => {
  const ok = await post('/api/restore', { email: 'paid@example.com' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /^dw_pro=/);
  assert.equal((await post('/api/restore', { email: 'nobody@example.com' })).status, 404);
  assert.equal((await post('/api/restore', { email: 'not-an-email' })).status, 400);
});
