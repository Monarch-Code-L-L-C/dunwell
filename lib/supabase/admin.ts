import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

// Server-only client that bypasses row level security. Used by the Paddle
// webhook to grant plans and credits, which users must never do themselves.
const SECRET = process.env.SUPABASE_SECRET_KEY ?? '';
export const adminReady = SUPABASE_URL !== '' && SECRET !== '';

export function admin() {
  return createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
}
