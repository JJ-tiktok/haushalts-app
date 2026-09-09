import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = {
  title: string;
  body: string;
  /** Wohin der Klick auf die Benachrichtigung führt. */
  url?: string;
  /** Gleiche Tags ersetzen einander, statt sich zu stapeln. */
  tag?: string;
};

/** Endpunkte, die der Push-Dienst endgültig abgelehnt hat. */
const GONE = [404, 410];

let configured = false;

/** Prüft die VAPID-Konfiguration und richtet web-push einmalig ein. */
function ensureConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:haushalt@example.com",
      publicKey,
      privateKey,
    );
    configured = true;
  }
  return true;
}

/** Ist Push serverseitig überhaupt einsatzbereit? */
export function pushIsConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Schickt eine Benachrichtigung an alle Geräte einer Person.
 *
 * Fehler werden bewusst geschluckt: eine fehlgeschlagene Push darf nie den
 * eigentlichen Vorgang (Tausch anbieten, Aufgabe abhaken) kaputt machen.
 * Rückgabe ist die Zahl der tatsächlich zugestellten Nachrichten.
 */
export async function sendPushToProfile(profileId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const admin = createAdminClient();
  if (!admin) return 0;

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("profile_id", profileId);
  if (error || !subscriptions || subscriptions.length === 0) return 0;

  const body = JSON.stringify(payload);
  const veraltet: string[] = [];
  let zugestellt = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        zugestellt += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // Gerät abgemeldet oder App deinstalliert -> Eintrag aufräumen.
        if (statusCode && GONE.includes(statusCode)) veraltet.push(sub.endpoint);
      }
    }),
  );

  if (veraltet.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", veraltet);
  }

  return zugestellt;
}
