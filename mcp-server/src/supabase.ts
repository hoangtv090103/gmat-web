import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabase) return supabase;

  // Read lazily so dotenv.config() in index.ts runs first
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey);
  return supabase;
}
