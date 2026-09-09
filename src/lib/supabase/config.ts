/**
 * Liest die Supabase-Zugangsdaten und meldet sich verständlich, wenn sie
 * fehlen – statt irgendwo tief in der Bibliothek mit "Invalid URL" zu
 * scheitern.
 */
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase ist nicht konfiguriert. Lege eine .env.local nach dem Vorbild von " +
        ".env.local.example an (NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }

  return { url, anonKey };
}
