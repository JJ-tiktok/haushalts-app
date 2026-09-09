"use client";

import { useTransition } from "react";
import type { Profile } from "@/lib/database.types";
import type { HistoryEntry } from "@/lib/queries";
import { reopenAssignment } from "@/lib/actions";
import { formatMinutes, toDay } from "@/lib/date";

export function HistoryItem({
  entry,
  person,
}: {
  entry: HistoryEntry;
  person: Pick<Profile, "display_name" | "color"> | undefined;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${pending ? "opacity-60" : ""}`}>
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: person?.color ?? "var(--muted)" }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{entry.task?.name ?? "Gelöschte Aufgabe"}</p>
        <p className="text-xs text-muted">
          {person?.display_name ?? "Unbekannt"} ·{" "}
          {entry.completed_at ? toDay(entry.completed_at).split("-").reverse().join(".") : "–"} ·{" "}
          {formatMinutes(entry.effort_minutes)}
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => void (await reopenAssignment(entry.id)))}
        className="shrink-0 text-xs font-medium text-muted disabled:opacity-50"
      >
        Rückgängig
      </button>
    </li>
  );
}
