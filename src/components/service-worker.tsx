"use client";

import { useEffect } from "react";

/**
 * Registriert den Service Worker – macht die App installierbar und ist die
 * Voraussetzung für Push. Läuft bewusst auch im Dev-Modus, sonst ließen sich
 * Benachrichtigungen lokal nicht testen.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ohne Service Worker funktioniert die App weiterhin – nur nicht offline.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
