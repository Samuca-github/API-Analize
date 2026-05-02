import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cfg } from "../config.js";

let _admin: SupabaseClient | null = null;

/**
 * Cliente "service role": ignora RLS. Use APENAS no servidor.
 * Lazy para não quebrar o boot quando rodando comandos sem env (ex: build).
 */
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  if (!cfg.supabase.url || !cfg.supabase.serviceRoleKey) {
    throw new Error("Supabase nao configurado (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)");
  }
  _admin = createClient(cfg.supabase.url, cfg.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
