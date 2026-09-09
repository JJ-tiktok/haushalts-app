"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signUp } from "@/lib/actions";
import { PROFILE_COLORS, readableInk } from "@/lib/color";

const feldKlasse =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";

export function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [state, formAction] = useActionState(mode === "signin" ? signIn : signUp, {
    error: null,
  });

  return (
    <div className="space-y-6">
      <div className="flex gap-2" role="tablist">
        <Tab active={mode === "signin"} onClick={() => setMode("signin")} label="Anmelden" />
        <Tab active={mode === "signup"} onClick={() => setMode("signup")} label="Registrieren" />
      </div>

      <form action={formAction} className="space-y-4">
        {mode === "signup" && (
          <>
            <div>
              <label htmlFor="display_name" className="mb-1.5 block text-sm font-medium text-ink">
                Name
              </label>
              <input
                id="display_name"
                name="display_name"
                autoComplete="name"
                required
                placeholder="Wie sollst du in der App heißen?"
                className={feldKlasse}
              />
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Farbe</p>
              <div className="flex flex-wrap gap-2">
                {PROFILE_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setColor(option)}
                    aria-label={`Farbe ${option}`}
                    aria-pressed={color === option}
                    className="h-9 w-9 rounded-full text-sm font-bold"
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
            </div>
          </>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
            E-Mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={feldKlasse}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
            Passwort
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            className={feldKlasse}
          />
        </div>

        {state.error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}

        <Absenden label={mode === "signin" ? "Anmelden" : "Konto anlegen"} />
      </form>
    </div>
  );
}

function Absenden({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent disabled:opacity-60"
    >
      {pending ? "Moment …" : label}
    </button>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
        active ? "border-accent bg-accent-soft text-ink" : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}
