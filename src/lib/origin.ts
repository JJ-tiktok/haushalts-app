import "server-only";

import { headers } from "next/headers";

/**
 * Absolute Basis-Adresse des laufenden Deployments, aus dem Request
 * abgeleitet – lokal `http://localhost:3000`, auf Vercel die echte Domain.
 *
 * Wird für Dinge gebraucht, die außerhalb des Browsers landen: die
 * Kalender-Abo-Adresse und der Rücksprung aus Supabase-Mails.
 */
export async function getOrigin(): Promise<string> {
  const headerList = await headers();

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protokoll =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protokoll}://${host}`;
}
