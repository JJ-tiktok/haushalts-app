import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/supabase/config";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

/**
 * Supabase-Client für Server Components, Server Actions und Route Handler.
 * Muss pro Request neu erzeugt werden (Cookies sind request-gebunden).
 */
export async function createClient() {
  const cookieStore = await cookies();

  const { url, anonKey } = supabaseConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // In Server Components ist Schreiben nicht erlaubt – das Refreshen
          // der Session übernimmt dann die Middleware.
        }
      },
    },
  });
}
