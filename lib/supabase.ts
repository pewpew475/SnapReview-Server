import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (supabase) return supabase;

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE configuration in environment');
  }

  supabase = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  return supabase;
}

export default getSupabaseServiceClient;
