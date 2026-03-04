import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let _supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
  } catch (e) {
    console.warn('[supabaseClient] Falha ao inicializar cliente Supabase:', e);
  }
} else {
  console.info(
    '[supabaseClient] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados. ' +
    'Realtime desativado — o sistema funciona normalmente via API REST.'
  );
}

// Exporta como named export "supabase" (pode ser null se env vars não configuradas)
export const supabase = _supabase;

// Helper null-safe — use antes de qualquer operação Realtime:
// const sb = getSupabase(); if (!sb) return;
export function getSupabase(): SupabaseClient | null {
  return _supabase;
}

export default _supabase;
