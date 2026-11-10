/*
 * Billing: Paddle Billing (overlay checkout) + a signed cookie. No database, no webhooks.
 *
 * Flow: the browser opens Paddle Checkout with Paddle.js. When Paddle reports
 * checkout.completed, the browser posts the transaction id to /api/unlock. The server
 * confirms that transaction with the Paddle API and sets a signed cookie holding the
 * subscription id. Once a day the server asks Paddle whether the subscription is still active.
 *
 * To swap payment provider, replace this file.
 */
'use strict';
const crypto = require('crypto');

const env = process.env;
const SANDBOX = (env.PADDLE_ENV || 'sandbox') !== 'production';
const API_BASE = env.PADDLE_API_BASE || (SANDBOX ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');
const SECRET = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const RECHECK_MS = 24 * 3600 * 1000;
const COOKIE = 'dw_pro';

const configured = () => !!(env.PADDLE_API_KEY && env.PADDLE_CLIENT_TOKEN && env.PADDLE_PRICE_MONTHLY);
const hasYearly = () => !!env.PADDLE_PRICE_YEARLY;
const devUnlock = () => env.DEV_UNLOCK === '1' && env.NODE_ENV !== 'production';

/** What the browser needs to open a checkout. The client-side token is public by design. */
function clientConfig() {
  if (!configured()) return null;
  return { env: SANDBOX ? 'sandbox' : 'production', token: env.PADDLE_CLIENT_TOKEN,
    prices: { monthly: env.PADDLE_PRICE_MONTHLY, yearly: env.PADDLE_PRICE_YEARLY || null } };
}

async function paddle(method, path, query, body) {
  let url = API_BASE + path;
  if (query) url += '?' + new URLSearchParams(query).toString();
  const opts = { method, headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}` }, signal: AbortSignal.timeout(15000) };
  if (method !== 'GET') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body || {}); }
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((json.error && json.error.detail) || `Paddle returned ${res.status}`);
    err.status = res.status; err.upstream = true;
    throw err;
  }
  return json.data;
}

// ---- signed token ----
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac || ''), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}
function cookieHeader(value, secure) {
  const base = `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return value ? `${base}; Max-Age=34560000` : `${base}; Max-Age=0`;
}
function readCookie(req) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? m[1] : null;
}
// past_due stays unlocked: Paddle is still retrying the card, and locking a customer out mid-retry loses them.
const isActive = (sub) => !!sub && ['active', 'trialing', 'past_due'].includes(sub.status);
const grant = (sub, cus) => sign({ sub, cus, chk: Date.now() + RECHECK_MS });

/** Returns { pro, cus, setCookie? }. setCookie is a cookie value to send ('' clears it). */
async function entitlement(req) {
  if (devUnlock()) return { pro: true, dev: true };
  const tok = verify(readCookie(req));
  if (!tok || !tok.sub) return { pro: false };
  if (Date.now() < tok.chk) return { pro: true, cus: tok.cus };
  if (!configured()) return { pro: false, setCookie: '' };
  try {
    const sub = await paddle('GET', `/subscriptions/${encodeURIComponent(tok.sub)}`);
    if (isActive(sub)) return { pro: true, cus: tok.cus, setCookie: grant(tok.sub, tok.cus) };
    return { pro: false, setCookie: '' };
  } catch (e) {
    if (e.status === 404) return { pro: false, setCookie: '' };
    return { pro: true, cus: tok.cus }; // Paddle unreachable: do not lock out a paying customer
  }
}

/**
 * After checkout: confirm the transaction with Paddle.
 * Returns { token } on success, { pending: true } while Paddle is still creating the
 * subscription (normally under a second), or null if the transaction does not unlock anything.
 */
async function unlockFromTransaction(txnId) {
  if (!/^txn_[a-z0-9]{20,40}$/.test(txnId || '')) return null;
  let t;
  try { t = await paddle('GET', `/transactions/${txnId}`); }
  catch (e) { if (e.status === 404) return null; throw e; }
  if (t.status === 'paid' || (t.status === 'completed' && !t.subscription_id)) return { pending: true };
  if (t.status !== 'completed') return null;
  return { token: grant(t.subscription_id, t.customer_id) };
}

/** Restore on a new device by billing email. See README: no email verification in this version. */
async function restoreByEmail(email) {
  const customers = await paddle('GET', '/customers', { email });
  for (const c of customers || []) {
    const subs = await paddle('GET', '/subscriptions', { customer_id: c.id, status: 'active,trialing,past_due' });
    if (subs && subs[0]) return grant(subs[0].id, c.id);
  }
  return null;
}

async function portalUrl(customerId) {
  const s = await paddle('POST', `/customers/${encodeURIComponent(customerId)}/portal-sessions`);
  return s.urls.general.overview;
}

module.exports = { configured, hasYearly, devUnlock, clientConfig, entitlement, unlockFromTransaction,
  restoreByEmail, portalUrl, cookieHeader, sandbox: () => SANDBOX, sessionSecretSet: () => !!env.SESSION_SECRET };
