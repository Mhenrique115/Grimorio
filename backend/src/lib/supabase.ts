import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const baseAuthConfig = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

export const supabasePublic = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  baseAuthConfig
);

export const supabaseVerifier = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  baseAuthConfig
);

export function getSupabaseAdmin() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY nao configurada no backend.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 500;
    throw err;
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, baseAuthConfig);
}

