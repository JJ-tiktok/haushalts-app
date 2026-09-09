"use client";

import { useState, useTransition } from "react";
import { regenerateCalendarToken } from "@/lib/actions";

/**
 * Abo-Adresse für Google Kalender & Co. Die URL enthält ein Geheimnis,
 * deshalb steht sie standardmäßig verdeckt da.
 */
export function CalendarSubscription({ origin, token }: { origin: string; token: string }) {
  const [aktuellesToken, setToken] = useState(token);
  const [sichtbar, setSichtbar] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [pending, startTransition] = useTransition();

  const url = `${origin}/api/kalender/${aktuellesToken}.ics`;

  function kopieren() {
    navigator.clipboard.writeText(url).then(
      () => {
        setKopiert(true);
        setTimeout(() => setKopiert(false), 2500);
      },
      () => setSichtbar(true),
    );
  }

  function neuErzeugen() {
    if (!window.confirm("Neue Adresse erzeugen? Bestehende Abos hören dann auf zu aktualisieren."))
      return;
    startTransition(async () => {
      const result = await regenerateCalendarToken();
      if (result.token) {
        setToken(result.token);
        setSichtbar(true);
        setKopiert(false);
      }
    });
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink">Kalender-Abo</h2>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">
          Diese Adresse einmal in Google Kalender unter „Weitere Kalender → Per URL" eintragen, dann
          stehen alle Haushaltsaufgaben dort – auch auf dem Handy. Funktioniert genauso mit Apple
          Kalender und Outlook.
        </p>

        <p
          className={`mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[11px] break-all ${
            sichtbar ? "text-ink" : "text-transparent select-none"
          }`}
          style={sichtbar ? undefined : { textShadow: "0 0 7px var(--muted)" }}
        >
          {url}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={kopieren}
            className="rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent"
          >
            {kopiert ? "Kopiert" : "Adresse kopieren"}
          </button>
          <button
            type="button"
            onClick={() => setSichtbar((v) => !v)}
            className="text-xs font-medium text-muted"
          >
            {sichtbar ? "Verbergen" : "Anzeigen"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={neuErzeugen}
            className="text-xs font-medium text-muted disabled:opacity-50"
          >
            Neue Adresse erzeugen
          </button>
        </div>

        <p className="mt-3 text-xs text-muted">
          Wer die Adresse kennt, kann eure Aufgabenliste lesen – sie ist wie ein Passwort zu
          behandeln. Google fragt den Kalender übrigens nur alle paar Stunden ab, Änderungen
          erscheinen dort also mit Verzögerung.
        </p>
      </div>
    </section>
  );
}
