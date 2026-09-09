"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { Profile, ShoppingItem } from "@/lib/database.types";
import {
  addShoppingItem,
  clearDoneShoppingItems,
  deleteShoppingItem,
  setShoppingItemDone,
} from "@/lib/actions";
import { formatWhen } from "@/lib/date";

/**
 * Einkaufsliste. Ein Feld, ein Knopf – man soll etwas eintragen können,
 * während man noch vor dem offenen Kühlschrank steht.
 */
export function ShoppingList({
  open,
  done,
  profiles,
}: {
  open: ShoppingItem[];
  done: ShoppingItem[];
  profiles: Record<string, Pick<Profile, "display_name" | "color">>;
}) {
  return (
    <div className="space-y-7">
      <QuickAdd />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">
          Auf der Liste
          {open.length > 0 && <span className="ml-2 font-normal text-muted">{open.length}</span>}
        </h2>

        {open.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Nichts drauf. Fällt dir etwas ein, trag es oben ein.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {open.map((item) => (
              <Zeile key={item.id} item={item} profiles={profiles} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">
              Im Wagen
              <span className="ml-2 font-normal text-muted">{done.length}</span>
            </h2>
            <ClearButton />
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {done.map((item) => (
              <Zeile key={item.id} item={item} profiles={profiles} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QuickAdd() {
  const [state, formAction] = useActionState(addShoppingItem, { error: null, saved: false });
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Nach dem Absenden leeren und den Fokus behalten – so lassen sich
  // mehrere Sachen hintereinander eintragen.
  useEffect(() => {
    if (state.saved) {
      form.current?.reset();
      input.current?.focus();
    }
  }, [state.saved]);

  return (
    <form ref={form} action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <label htmlFor="shopping-name" className="sr-only">
          Artikel
        </label>
        <input
          ref={input}
          id="shopping-name"
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="z. B. Milch oder 2 Liter Milch"
          className="flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent"
        />
        <AddButton />
      </div>

      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-60"
    >
      {pending ? "…" : "Drauf"}
    </button>
  );
}

function ClearButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await clearDoneShoppingItems()))}
      className="text-xs font-medium text-muted disabled:opacity-50"
    >
      Liste aufräumen
    </button>
  );
}

function Zeile({
  item,
  profiles,
}: {
  item: ShoppingItem;
  profiles: Record<string, Pick<Profile, "display_name" | "color">>;
}) {
  const [pending, startTransition] = useTransition();
  const erledigt = item.done_at !== null;
  const person = profiles[item.added_by];

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${pending ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        checked={erledigt}
        disabled={pending}
        aria-label={`${item.name} abhaken`}
        onChange={(e) =>
          startTransition(async () => void (await setShoppingItemDone(item.id, e.target.checked)))
        }
        className="h-5 w-5 shrink-0 accent-[var(--accent)]"
      />

      <div className="min-w-0 flex-1">
        <p className={`text-[15px] ${erledigt ? "text-muted line-through" : "text-ink"}`}>
          {item.quantity && <span className="text-muted">{item.quantity} </span>}
          {item.name}
        </p>
        <p className="text-[11px] text-muted">
          {person?.display_name ?? "Unbekannt"} · {formatWhen(item.created_at)}
        </p>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => void (await deleteShoppingItem(item.id)))}
        aria-label={`${item.name} entfernen`}
        className="shrink-0 px-1 text-muted disabled:opacity-50"
      >
        ✕
      </button>
    </li>
  );
}
