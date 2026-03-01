import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── Cliente para uso em componentes (Realtime, queries diretas) ──────────────
// Exporta null-safe via getSupabase() para não crashar quando as env vars
// não estiverem configuradas (ex: dev local sem Supabase)
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

/**
 * Retorna o cliente Supabase se as variáveis de ambiente estiverem configuradas,
 * ou null caso contrário. Sempre use este helper antes de usar o cliente:
 *
 * const sb = getSupabase();
 * if (!sb) return; // Realtime não disponível
 */
export function getSupabase(): SupabaseClient | null {
  return _supabase;
}

/** @deprecated Use getSupabase() para evitar crashes quando env vars não estão definidas */
export const supabase = _supabase!;
