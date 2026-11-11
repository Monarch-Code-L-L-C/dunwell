// Paddle Billing: server-side helpers. Paddle is the merchant of record; it
// takes the payment and tells us about it by webhook. We never see card data.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const PADDLE_ENV = process.env.PADDLE_ENV === 'live' ? 'live' : 'sandbox';
export const PADDLE_CLIENT_TOKEN = process.env.PADDLE_CLIENT_TOKEN ?? '';
const API_KEY = process.env.PADDLE_API_KEY ?? '';
const API_BASE = process.env.PADDLE_API_BASE ?? (PADDLE_ENV === 'live' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com');

export const checkoutReady = API_KEY !== '' && PADDLE_CLIENT_TOKEN !== '';

export async function paddle(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json?.error?.detail ?? json?.error?.code ?? `HTTP ${res.status}`;
    throw new Error(`Paddle ${method} ${path}: ${detail}`);
  }
  return json?.data;
}

// Paddle signs each webhook: header "ts=<unix>;h1=<hex hmac-sha256 of 'ts:body'>".
// The body must be the raw text exactly as received.
export function verifySignature(rawBody: string, header: string | null, secret: string, nowMs: number = Date.now(), toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = new Map<string, string>();
  for (const piece of header.split(';')) {
    const i = piece.indexOf('=');
    if (i > 0) parts.set(piece.slice(0, i).trim(), piece.slice(i + 1).trim());
  }
  const ts = parts.get('ts');
  const h1 = parts.get('h1');
  if (!ts || !h1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(h1)) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest();
  const given = Buffer.from(h1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
