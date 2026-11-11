import { verifySignature } from '@/lib/paddle';
import { toOps } from '@/lib/billing-events';
import { admin, adminReady } from '@/lib/supabase/admin';

// Paddle calls this after every payment and subscription change. It is the
// only place plans and purchased credits are written.
export async function POST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? '';
  if (!secret || !adminReady) return new Response('Webhook not configured', { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('paddle-signature'), secret)) {
    return new Response('Bad signature', { status: 401 });
  }

  let event: unknown;
  try { event = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }

  const db = admin();
  let applied = 0;
  for (const op of toOps(event)) {
    if (op.t === 'customer') {
      const { error } = await db.from('accounts').update({ paddle_customer_id: op.customerId }).eq('id', op.accountId);
      if (error) return fail('customer', error);
    } else if (op.t === 'entitlement') {
      // Events can arrive out of order. Never let an older one overwrite a newer one.
      const { data: existing, error: readError } = await db.from('entitlements').select('updated_at').eq('paddle_subscription_id', op.row.paddle_subscription_id).maybeSingle();
      if (readError) return fail('entitlement read', readError);
      if (existing && new Date(existing.updated_at) > new Date(op.row.updated_at)) continue;
      const { error } = await db.from('entitlements').upsert(op.row, { onConflict: 'paddle_subscription_id' });
      if (error) return fail('entitlement', error);
    } else {
      const { error } = await db.from('credit_ledger').insert(op.row);
      // 23505: this transaction was already recorded (Paddle retried). That is fine.
      if (error && error.code !== '23505') return fail('credit', error);
    }
    applied++;
  }
  return Response.json({ ok: true, applied });
}

// A 500 makes Paddle retry later, so a database hiccup never loses a purchase.
function fail(what: string, error: { message: string }) {
  console.error('paddle webhook', what, error.message);
  return new Response('Could not apply event', { status: 500 });
}
