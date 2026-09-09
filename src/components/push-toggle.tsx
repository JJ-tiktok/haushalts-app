"use client";

import { useEffect, useState, useTransition } from "react";
import { sendTestPush } from "@/lib/actions";
import {
  getExistingSubscription,
  isIos,
  isStandalone,
  pushIsSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

type Status = "prüfe" | "aus" | "an" | "nicht-möglich";

export function PushToggle({
  deviceCount,
  serverReady,
}: {
  deviceCount: number;
  /** Sind VAPID-Schlüssel *und* Service-Role-Key auf dem Server hinterlegt? */
  serverReady: boolean;
}) {
  const [status, setStatus] = useState<Status>("prüfe");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let abgebrochen = false;

    (async () => {
      if (!pushIsSupported()) {
        if (!abgebrochen) setStatus("nicht-möglich");
        return;
      }
      const subscription = await getExistingSubscription();
      if (!abgebrochen) setStatus(subscription ? "an" : "aus");
    })();

    return () => {
      abgebrochen = true;
    };
  }, []);

  const vapidFehlt = !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const iosOhneInstallation = isIos() && !isStandalone();

  function einschalten() {
    startTransition(async () => {
      setMeldung(null);
      const result = await subscribeToPush();
      if (result.ok) {
        setStatus("an");
        setMeldung("Dieses Gerät bekommt jetzt Benachrichtigungen.");
      } else {
        setMeldung(result.error ?? "Hat nicht geklappt.");
      }
    });
  }

  function ausschalten() {
    startTransition(async () => {
      setMeldung(null);
      await unsubscribeFromPush();
      setStatus("aus");
      setMeldung("Dieses Gerät bekommt keine Benachrichtigungen mehr.");
    });
  }

  function testen() {
    startTransition(async () => {
      setMeldung(null);
      const { delivered } = await sendTestPush();
      setMeldung(
        delivered > 0
          ? `Testbenachrichtigung an ${delivered} ${delivered === 1 ? "Gerät" : "Geräte"} geschickt.`
          : "Es konnte nichts zugestellt werden. Steht der Service-Role-Schlüssel in der .env.local?",
      );
    });
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink">Benachrichtigungen</h2>

      <div className="rounded-2xl border border-border bg-surface p-4">
        {vapidFehlt ? (
          <p className="text-sm text-muted">
            Auf dem Server ist kein VAPID-Schlüssel hinterlegt – Benachrichtigungen sind
            deaktiviert.
          </p>
        ) : status === "nicht-möglich" ? (
          <p className="text-sm text-muted">
            {iosOhneInstallation
              ? "Auf dem iPhone gehen Benachrichtigungen nur in der installierten App: über „Teilen → Zum Homebildschirm“ hinzufügen und von dort öffnen."
              : "Dieser Browser unterstützt keine Push-Benachrichtigungen."}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  {status === "an" ? "Auf diesem Gerät aktiv" : "Auf diesem Gerät aus"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Am Fälligkeitstag und bei neuen Tauschanfragen.
                </p>
              </div>

              <button
                type="button"
                disabled={pending || status === "prüfe"}
                onClick={status === "an" ? ausschalten : einschalten}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-50 ${
                  status === "an" ? "border border-border text-muted" : "bg-accent text-on-accent"
                }`}
              >
                {status === "prüfe" ? "…" : status === "an" ? "Ausschalten" : "Einschalten"}
              </button>
            </div>

            {deviceCount > 0 && (
              <p className="mt-3 text-xs text-muted">
                {deviceCount} {deviceCount === 1 ? "Gerät ist" : "Geräte sind"} für dein Konto
                angemeldet.
              </p>
            )}

            {status === "an" && !serverReady && (
              <p className="mt-3 text-xs text-warn">
                Auf dem Server fehlt der Service-Role-Schlüssel – dieses Gerät ist zwar angemeldet,
                es kann aber nichts verschickt werden.
              </p>
            )}

            {status === "an" && (
              <button
                type="button"
                disabled={pending}
                onClick={testen}
                className="mt-3 text-xs font-medium text-accent disabled:opacity-50"
              >
                Testbenachrichtigung schicken
              </button>
            )}
          </>
        )}

        {meldung && (
          <p role="status" className="mt-3 text-xs text-ink">
            {meldung}
          </p>
        )}
      </div>
    </section>
  );
}
