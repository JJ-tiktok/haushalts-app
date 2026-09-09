"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Hält beide Handys synchron: sobald sich Zuweisungen, Aufgaben oder
 * Checklisten-Haken ändern, wird die Server-Ansicht neu geladen.
 */
export function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("haushalt-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () =>
        router.refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () =>
        router.refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_checks" }, () =>
        router.refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () =>
        router.refresh(),
      )
      .subscribe();

    // Nach dem Zurückholen aus dem Hintergrund (PWA) einmal frisch laden.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
