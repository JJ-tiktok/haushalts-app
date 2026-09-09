/*
 * Service Worker der Haushalts-App.
 *
 * Bewusst schlank: die App lebt von aktuellen Daten, deshalb wird nichts
 * aggressiv gecacht. Der Worker sorgt vor allem dafür, dass die App
 * installierbar ist und offline nicht mit einer Browserfehlerseite endet.
 */

const VERSION = "v1";
const SHELL_CACHE = `haushalt-shell-${VERSION}`;
const ASSET_CACHE = `haushalt-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const SHELL = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Fremde Hosts (u. a. Supabase) laufen ungefiltert durch.
  if (url.origin !== self.location.origin) return;

  // Seiten: immer frisch laden, offline die Hinweisseite zeigen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  // Im Dev-Modus nichts cachen – sonst klebt man an alten Build-Chunks.
  const isDev = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

  // Statische Build-Assets: aus dem Cache, im Hintergrund erneuern.
  if (!isDev && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
  }
});

/*
 * Vorbereitet für v3 (Push-Notifications). Der Versand steht noch aus –
 * Empfang und Klickverhalten sind hier schon definiert.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Haushalt", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Haushalt", {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
      tag: payload.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
