import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Landepunkt für Links aus Supabase-Mails (Bestätigung, Einladung,
 * Passwort zurücksetzen).
 *
 * Zwei Varianten werden abgedeckt, weil Supabase je nach E-Mail-Vorlage
 * unterschiedlich zurückkommt:
 *
 *   ?code=…                  – PKCE. Funktioniert nur in dem Browser, in dem
 *                              die Registrierung gestartet wurde (der
 *                              Verifier liegt dort in einem Cookie).
 *   ?token_hash=…&type=…     – robuster: klappt auch, wenn die Mail auf einem
 *                              anderen Gerät geöffnet wird.
 *
 * Ohne diese Route würde der Link zwar die Adresse bestätigen, die Person
 * aber nicht anmelden – der Proxy schickt sie dann auf /login zurück.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Nur app-interne Ziele zulassen, damit der Parameter keine offene
  // Weiterleitung wird.
  const requested = searchParams.get("next") ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
    return NextResponse.redirect(
      new URL(`/login?fehler=${encodeURIComponent(error.message)}`, origin),
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    return NextResponse.redirect(
      new URL(`/login?fehler=${encodeURIComponent(error.message)}`, origin),
    );
  }

  return NextResponse.redirect(
    new URL("/login?fehler=Der+Link+ist+unvollst%C3%A4ndig+oder+abgelaufen.", origin),
  );
}
