/*
 * Dunwell server. Zero dependencies: Node 20+ only.
 *   node server.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---- .env (optional) ----
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env file */ }

const engine = require('./lib/engine');
const billing = require('./lib/billing');

const env = process.env;
const PORT = Number(env.PORT) || 3000;
const BASE_URL = (env.BASE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${PORT}`)).replace(/\/+$/, '');
const SECURE = BASE_URL.startsWith('https://');
const PUBLIC = path.join(__dirname, 'public');
const AI_BASE = env.ANTHROPIC_API_BASE || 'https://api.anthropic.com';
const AI_MODEL = env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const aiEnabled = () => !!env.ANTHROPIC_API_KEY;

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Paddle.js loads from (sandbox-)cdn.paddle.com, injects its own stylesheet and inline styles for the overlay,
  // and opens the checkout in a frame on (sandbox-)buy.paddle.com.
  // Keep this in step with the same header in vercel.json.
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://*.paddle.com; style-src 'self' 'unsafe-inline' https://*.paddle.com; script-src 'self' https://*.paddle.com; frame-src https://*.paddle.com; connect-src 'self' https://*.paddle.com; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
};

function send(res, status, body, headers) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  const out = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, Object.assign({ 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store' }, SECURITY, headers));
  res.end(out);
}
function readJson(req) {
  if (process.env.VERCEL) { // Vercel has already read the stream; req.body parses lazily and throws on bad JSON
    try { const b = req.body; return Promise.resolve(b && typeof b === 'object' && !Buffer.isBuffer(b) ? b : {}); }
    catch { return Promise.reject(Object.assign(new Error('Invalid JSON.'), { status: 400 })); }
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 50000) { reject(Object.assign(new Error('Request too large.'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

// ---- tiny in-memory rate limiter (per IP, per bucket) ----
const hits = new Map();
function limited(req, bucket, max, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const key = bucket + ':' + ip, now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some((t) => now - t < 3600000)) hits.delete(k); }, 600000).unref();

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  else if (!path.extname(rel)) rel += '.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC, '404.html'), (e2, page) =>
        send(res, 404, e2 ? 'Not found' : page, e2 ? {} : { 'Content-Type': TYPES['.html'] }));
    }
    const ext = path.extname(file);
    send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
  });
}

async function tailor(body) {
  const text = String(body.body || '').slice(0, 6000);
  const context = String(body.context || '').trim().slice(0, 600);
  if (!text || context.length < 5) throw Object.assign(new Error('Describe the situation in a sentence or two.'), { status: 400 });
  const res = await fetch(AI_BASE + '/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: AI_MODEL, max_tokens: 1200,
      system: 'You adapt payment-reminder emails for freelancers and small businesses. Rewrite the email so it fits the situation the sender describes. Rules: keep every amount, date, deadline, invoice number, name and legal reference exactly as given; do not invent facts, threats or legal claims; keep roughly the same length and the same level of firmness unless the situation clearly calls for a change; plain text only. Reply with the rewritten email body and nothing else.',
      messages: [{ role: 'user', content: `<email>\n${text}\n</email>\n\n<situation>\n${context}\n</situation>` }]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('AI error', res.status, data.error && data.error.message);
    throw Object.assign(new Error('The writing service is unavailable right now. Your original email is unchanged.'), { status: 502 });
  }
  const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!out) throw Object.assign(new Error('The writing service returned nothing. Your original email is unchanged.'), { status: 502 });
  return out;
}

async function route(req, res) {
  const url = new URL(req.url, BASE_URL);
  const p = url.pathname;
  const cookieOut = (ent) => (ent.setCookie !== undefined ? { 'Set-Cookie': billing.cookieHeader(ent.setCookie, SECURE) } : {});

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (p === '/healthz') return send(res, 200, { ok: true });
    if (p === '/api/config') {
      const ent = await billing.entitlement(req);
      return send(res, 200, { pro: ent.pro, dev: !!ent.dev, billing: billing.configured(), yearly: billing.hasYearly(),
        paddle: billing.clientConfig(), canManage: !!ent.cus, ai: aiEnabled(), rates: engine.currentRates() }, cookieOut(ent));
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Not found.' });
    return serveStatic(req, res, p);
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const body = await readJson(req);

  if (p === '/api/chase') {
    if (limited(req, 'chase', 120, 3600000)) return send(res, 429, { error: 'Too many requests. Try again in a little while.' });
    const ent = await billing.entitlement(req);
    const out = engine.chase(body, { pro: ent.pro });
    return send(res, out.ok ? 200 : 422, out, cookieOut(ent));
  }
  if (p === '/api/tailor') {
    const ent = await billing.entitlement(req);
    if (!ent.pro) return send(res, 402, { error: 'Tailoring is part of Pro.' });
    if (!aiEnabled()) return send(res, 503, { error: 'Tailoring is not enabled on this site.' });
    if (limited(req, 'tailor', 30, 3600000)) return send(res, 429, { error: 'Hourly tailoring limit reached. Try again later.' });
    return send(res, 200, { body: await tailor(body) });
  }
  if (p === '/api/unlock') {
    if (!billing.configured()) return send(res, 503, { error: 'Payments are not set up on this site yet.' });
    if (limited(req, 'pay', 60, 3600000)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
    const out = await billing.unlockFromTransaction(String(body.transactionId || ''));
    if (!out) return send(res, 402, { error: 'We could not confirm that payment.' });
    if (out.pending) return send(res, 202, { pending: true });
    return send(res, 200, { ok: true }, { 'Set-Cookie': billing.cookieHeader(out.token, SECURE) });
  }
  if (p === '/api/restore') {
    if (!billing.configured()) return send(res, 503, { error: 'Payments are not set up on this site yet.' });
    if (limited(req, 'restore', 5, 3600000)) return send(res, 429, { error: 'Too many attempts. Try again in an hour.' });
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return send(res, 400, { error: 'Enter the email address you paid with.' });
    const token = await billing.restoreByEmail(email);
    if (!token) return send(res, 404, { error: 'No active subscription was found for that email.' });
    return send(res, 200, { ok: true }, { 'Set-Cookie': billing.cookieHeader(token, SECURE) });
  }
  if (p === '/api/portal') {
    const ent = await billing.entitlement(req);
    if (!billing.configured() || !ent.cus) return send(res, 400, { error: 'No subscription found on this device.' });
    return send(res, 200, { url: await billing.portalUrl(ent.cus) });
  }
  return send(res, 404, { error: 'Not found.' });
}

function handler(req, res) {
  return route(req, res).catch((err) => {
    if (err.upstream) { // the payment provider refused or failed: log the detail, tell the visitor little
      console.error('Paddle error:', err.status, err.message);
      if (!res.headersSent) send(res, 502, { error: 'The payment service is not responding as expected. Please try again shortly.' });
      return;
    }
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : err.status === 502 ? 502 : 500;
    if (status >= 500 && err.status !== 502) console.error(err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong on our side. Please try again.' : err.message });
  });
}
const server = http.createServer(handler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Dunwell running at ${BASE_URL}`);
    console.log(`  payments: ${billing.configured() ? 'Paddle ' + (billing.sandbox() ? 'SANDBOX (test cards only, no real money)' : 'LIVE') : 'OFF (set PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_PRICE_MONTHLY)'}`);
    console.log(`  tailoring: ${aiEnabled() ? 'on, model ' + AI_MODEL : 'OFF (set ANTHROPIC_API_KEY)'}`);
    if (billing.devUnlock()) console.log('  DEV_UNLOCK=1: every visitor is treated as Pro. Never use this in production.');
    if (billing.configured() && !billing.sessionSecretSet())
      console.warn('  WARNING: SESSION_SECRET is not set. Customers will lose Pro access on every restart.');
  });
}
module.exports = server;
module.exports.handler = handler;
