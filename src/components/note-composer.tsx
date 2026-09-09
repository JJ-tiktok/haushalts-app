"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createNote } from "@/lib/actions";

const MAX = 500;

/** Eingabefeld für eine neue Notiz. */
export function NoteComposer({ compact = false }: { compact?: boolean }) {
  const [state, formAction] = useActionState(createNote, { error: null, saved: false });
  const form = useRef<HTMLFormElement>(null);

  // Nach dem Speichern das Feld leeren, damit man direkt weiterschreiben kann.
  useEffect(() => {
    if (state.saved) form.current?.reset();
  }, [state.saved]);

  return (
    <form ref={form} action={formAction} className="space-y-2">
      <label htmlFor="note-body" className="sr-only">
        Notiz
      </label>
      <textarea
        id="note-body"
        name="body"
        required
        maxLength={MAX}
        rows={compact ? 2 : 3}
        placeholder="z. B. Milch ist alle · Handwerker kommt Donnerstag"
        className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent"
      />

      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-on-accent disabled:opacity-60"
    >
      {pending ? "Wird gespeichert …" : "Notiz hinterlassen"}
    </button>
  );
}
