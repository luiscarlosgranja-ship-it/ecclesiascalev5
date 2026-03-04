import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Verificar se as variáveis de ambiente estão configuradas
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL não está configurada no .env');
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_SERVICE_KEY não está configurada no .env');
}

// Criar cliente Supabase com Service Role Key (para backend)
// Importante: Use SERVICE_KEY no backend, não a chave anônima!
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

export default supabase;
