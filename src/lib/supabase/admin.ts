import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseConfig } from "@/lib/supabase/config";

/**
 * Client mit Service-Role-Schlüssel – umgeht RLS.
 *
 * Nur für zwei Dinge gedacht, die ohne Session auskommen müssen:
 *   1. Push an die *andere* Person schicken (deren Endpunkte sind privat)
 *   2. Der nächtliche Erinnerungs-Cron
 *
 * Der Schlüssel steht ausschließlich in serverseitigen Umgebungsvariablen
 * (kein NEXT_PUBLIC_-Präfix) und erreicht den Browser damit nie.
 * Fehlt er, gibt die Funktion `null` zurück – die App läuft dann normal
 * weiter, nur ohne Push.
 */
export function createAdminClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  const { url } = supabaseConfig();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
