"use client";

import { useTransition } from "react";
import type { Note, Profile } from "@/lib/database.types";
import { completeNote, deleteNote, reopenNote, toggleNotePinned } from "@/lib/actions";
import { formatWhen } from "@/lib/date";

export function NoteItem({
  note,
  author,
  doneBy,
  readOnly = false,
}: {
  note: Note;
  author: Pick<Profile, "display_name" | "color"> | undefined;
  doneBy?: Pick<Profile, "display_name"> | undefined;
  /** Auf dem Wand-Dashboard wird nur angezeigt, nicht bedient. */
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const erledigt = note.done_at !== null;

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
    });
  }

  return (
    <li
      className={`rounded-2xl border border-border bg-surface p-3.5 ${pending ? "opacity-60" : ""} ${
        erledigt ? "opacity-70" : ""
      }`}
      style={author ? { boxShadow: `inset 3px 0 0 0 ${author.color}` } : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink">{author?.display_name ?? "Unbekannt"}</span>
        <span className="shrink-0 text-[11px] text-muted">
          {note.is_pinned && !erledigt && <span className="mr-1.5">angeheftet</span>}
          {formatWhen(note.created_at)}
        </span>
      </div>

      <p
        className={`mt-1 text-[15px] leading-snug whitespace-pre-wrap ${
          erledigt ? "text-muted line-through" : "text-ink"
        }`}
      >
        {note.body}
      </p>

      {erledigt && doneBy && (
        <p className="mt-1 text-[11px] text-muted">abgehakt von {doneBy.display_name}</p>
      )}

      {!readOnly && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {erledigt ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => reopenNote(note.id))}
              className="text-xs font-medium text-accent disabled:opacity-50"
            >
              Wieder aktiv
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => completeNote(note.id))}
                className="text-xs font-semibold text-accent disabled:opacity-50"
              >
                Erledigt
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => toggleNotePinned(note.id, !note.is_pinned))}
                className="text-xs font-medium text-muted disabled:opacity-50"
              >
                {note.is_pinned ? "Lösen" : "Anheften"}
              </button>
            </>
          )}

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Notiz endgültig löschen?")) run(() => deleteNote(note.id));
            }}
            className="text-xs font-medium text-muted disabled:opacity-50"
          >
            Löschen
          </button>
        </div>
      )}
    </li>
  );
}
