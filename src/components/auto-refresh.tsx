"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Lädt die Ansicht in festem Takt neu. Für das Wand-Tablet gedacht, das
 * tagelang offen steht: Realtime deckt Änderungen ab, aber nicht den
 * Tageswechsel um Mitternacht.
 */
export function AutoRefresh({ everySeconds = 300 }: { everySeconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), everySeconds * 1000);
    return () => clearInterval(id);
  }, [router, everySeconds]);

  return null;
}
