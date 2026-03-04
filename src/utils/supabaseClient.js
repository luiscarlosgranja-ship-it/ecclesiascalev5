import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar configurados no .env');
}

const _supabase = createClient(supabaseUrl, supabaseKey);

export const supabase = _supabase;

export function getSupabase() {
  return _supabase;
}

export default _supabase;
