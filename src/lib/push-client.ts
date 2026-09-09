"use client";

import { deletePushSubscription, savePushSubscription } from "@/lib/actions";

/** VAPID-Schlüssel liegt Base64URL-kodiert vor, die Push-API will Bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Der Browser des Geräts kann grundsätzlich Push. */
export function pushIsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Auf iOS funktioniert Push nur in der installierten PWA – im Safari-Tab
 * fehlt die API komplett. Das ist der häufigste Grund für "geht nicht".
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function keyAsBase64(subscription: PushSubscription, name: "p256dh" | "auth"): string {
  const key = subscription.getKey(name);
  if (!key) throw new Error(`Push-Schlüssel ${name} fehlt.`);
  return window.btoa(String.fromCharCode(...new Uint8Array(key)));
}

/** Bereits auf diesem Gerät registriert? */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushIsSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export type SubscribeResult = { ok: boolean; error?: string };

/** Erlaubnis einholen, Gerät registrieren und serverseitig speichern. */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!pushIsSupported()) {
    return { ok: false, error: "Dieser Browser unterstützt keine Benachrichtigungen." };
  }
  if (isIos() && !isStandalone()) {
    return {
      ok: false,
      error:
        "Auf dem iPhone gehen Benachrichtigungen nur, wenn die App über „Zum Homebildschirm“ installiert und von dort geöffnet wird.",
    };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { ok: false, error: "Es ist kein VAPID-Schlüssel konfiguriert." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      error:
        permission === "denied"
          ? "Benachrichtigungen sind für diese Seite blockiert. Das lässt sich nur in den Browser-Einstellungen wieder freigeben."
          : "Ohne Erlaubnis keine Benachrichtigungen.",
    };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await savePushSubscription({
    endpoint: subscription.endpoint,
    p256dh: keyAsBase64(subscription, "p256dh"),
    auth: keyAsBase64(subscription, "auth"),
    userAgent: navigator.userAgent.slice(0, 200),
  });

  return { ok: true };
}

/** Gerät abmelden – lokal und auf dem Server. */
export async function unsubscribeFromPush(): Promise<SubscribeResult> {
  const subscription = await getExistingSubscription();
  if (!subscription) return { ok: true };

  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await deletePushSubscription(endpoint);

  return { ok: true };
}
