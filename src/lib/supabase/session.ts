import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/supabase/config";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

// Cron und Kalender-Feed haben keine Session – sie schützen sich über
// ein Geheimnis in Header bzw. URL.
const PUBLIC_PATHS = ["/login", "/auth", "/api/cron", "/api/kalender"];

/**
 * Hält die Supabase-Session frisch und schützt alle Seiten außer /login.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url: supabaseUrl, anonKey } = supabaseConfig();

  const supabase = createServerClient<Database>(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Wichtig: getUser() direkt nach dem Erzeugen des Clients aufrufen –
  // sonst können Sessions zufällig ausgeloggt werden.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
