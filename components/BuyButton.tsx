'use client';

import { useState } from 'react';

type Item = { kind: 'plan' | 'job'; id: string; cycle?: 'month' | 'year' };
type PaddleConfig = { token: string; env: 'sandbox' | 'live' };

declare global {
  interface Window { Paddle?: any; __paddleReady?: Promise<void> }
}

function loadPaddle(cfg: PaddleConfig): Promise<void> {
  if (!window.__paddleReady) {
    window.__paddleReady = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.onload = () => {
        if (cfg.env === 'sandbox') window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({
          token: cfg.token,
          eventCallback: (e: any) => {
            if (e?.name === 'checkout.completed') window.location.assign('/app?purchased=1');
          },
        });
        resolve();
      };
      s.onerror = () => { window.__paddleReady = undefined; reject(new Error('Paddle failed to load')); };
      document.head.appendChild(s);
    });
  }
  return window.__paddleReady;
}

export default function BuyButton({ item, paddle, label, className }: { item: Item; paddle: PaddleConfig; label: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function buy() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
      if (res.status === 401) { window.location.assign('/login?next=/pricing'); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Something went wrong. Try again.'); return; }
      await loadPaddle(paddle);
      window.Paddle.Checkout.open({ transactionId: json.transactionId });
    } catch {
      setError('We could not open the checkout. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={buy} disabled={busy} className={className}>{busy ? 'Opening…' : label}</button>
      {error && <span role="alert" className="mt-2 block text-sm text-red">{error}</span>}
    </>
  );
}

export function PortalButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/portal', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) { setError(json.error ?? 'Could not open billing.'); return; }
      window.location.assign(json.url);
    } catch {
      setError('Could not open billing. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={open} disabled={busy} className={className}>{busy ? 'Opening…' : 'Manage billing'}</button>
      {error && <span role="alert" className="mt-2 block text-sm text-red">{error}</span>}
    </>
  );
}
