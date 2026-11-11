import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseReady } from '@/lib/supabase/env';
import { paddle, checkoutReady } from '@/lib/paddle';

// Opens Paddle's customer portal: invoices, payment method, cancel.
export async function POST() {
  if (!supabaseReady || !checkoutReady) return NextResponse.json({ error: 'Billing is not switched on yet.' }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const { data: account } = await supabase.from('accounts').select('paddle_customer_id').eq('id', user.id).maybeSingle();
  if (!account?.paddle_customer_id) return NextResponse.json({ error: 'No purchases on this account yet.' }, { status: 404 });

  try {
    const session = await paddle('POST', `/customers/${account.paddle_customer_id}/portal-sessions`, {});
    const url = session?.urls?.general?.overview;
    if (!url) throw new Error('no portal url');
    return NextResponse.json({ url });
  } catch (e) {
    console.error('portal', e);
    return NextResponse.json({ error: 'We could not open billing. Try again in a moment.' }, { status: 502 });
  }
}
