// The project URL and publishable key are public by design: row level security
// in the database is what protects data, not secrecy of these two values.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const supabaseReady = SUPABASE_URL !== '' && SUPABASE_KEY !== '';
export const googleSignIn = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === '1';

// Only ever redirect to a path on this site.
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/app';
}
