"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Profile } from "@/lib/database.types";
import { updateProfile } from "@/lib/actions";
import { PROFILE_COLORS, readableInk } from "@/lib/color";

const feldKlasse =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useActionState(updateProfile, { error: null, saved: false });
  const [color, setColor] = useState(profile.color);

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label htmlFor="display_name" className="mb-2 block text-sm font-semibold text-ink">
          Name
        </label>
        <input
          id="display_name"
          name="display_name"
          defaultValue={profile.display_name}
          required
          className={feldKlasse}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Farbe</p>
        <div className="flex flex-wrap gap-2">
          {PROFILE_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setColor(option)}
              aria-label={`Farbe ${option}`}
              aria-pressed={color === option}
              className="h-10 w-10 rounded-full text-sm font-bold"
              style={{
                backgroundColor: option,
                color: readableInk(option),
                outline: color === option ? "2px solid var(--ink)" : "none",
                outlineOffset: 2,
              }}
            >
              {color === option ? "✓" : ""}
            </button>
          ))}
        </div>
        <input type="hidden" name="color" value={color} />
        <p className="mt-2 text-xs text-muted">
          Daran erkennt ihr in der Liste sofort, wer dran ist.
        </p>
      </div>

      <div>
        <label htmlFor="away_until" className="mb-2 block text-sm font-semibold text-ink">
          Abwesend bis (optional)
        </label>
        <input
          id="away_until"
          name="away_until"
          type="date"
          defaultValue={profile.away_until ?? ""}
          className={feldKlasse}
        />
        <p className="mt-2 text-xs text-muted">
          Während der Abwesenheit gehen neu fällige Aufgaben an die andere Person. Im Verlauf bleibt
          sichtbar, wie sich das auf die Verteilung ausgewirkt hat.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-ink">
          Gespeichert.
        </p>
      )}

      <Speichern />
    </form>
  );
}

function Speichern() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent disabled:opacity-60"
    >
      {pending ? "Speichern …" : "Speichern"}
    </button>
  );
}
