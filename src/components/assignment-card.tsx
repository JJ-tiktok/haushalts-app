"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { Profile } from "@/lib/database.types";
import type { AssignmentView } from "@/lib/queries";
import {
  acceptSwap,
  cancelSwap,
  completeAssignment,
  declineSwap,
  offerSwap,
  postponeAssignment,
  skipAssignment,
  toggleChecklistItem,
} from "@/lib/actions";
import { daysBetween, formatCarryOver, formatDueDate, formatMinutes, today } from "@/lib/date";
import { readableInk, tint } from "@/lib/color";
import { Avatar } from "@/components/avatar";
import { AssignmentExtras } from "@/components/assignment-extras";

export function AssignmentCard({
  assignment,
  assignee,
  isMine,
  overdue,
  meId,
  partnerName,
  profiles = {},
}: {
  assignment: AssignmentView;
  assignee: Profile | undefined;
  isMine: boolean;
  overdue: boolean;
  /** Profil-ID der angemeldeten Person – für die Tausch-Logik. */
  meId?: string;
  /** Name der anderen Person, für die Beschriftung der Tausch-Buttons. */
  partnerName?: string;
  /** Alle Profile, für Kommentar-Autoren. */
  profiles?: Record<string, Pick<Profile, "display_name" | "color">>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [checked, setChecked] = useOptimistic(
    assignment.checkedItemIds,
    (state: string[], change: { id: string; value: boolean }) =>
      change.value ? [...state, change.id] : state.filter((id) => id !== change.id),
  );

  const hasChecklist = assignment.checklist.length > 0;
  const done = assignment.checklist.filter((item) => checked.includes(item.id)).length;

  function toggle(itemId: string, value: boolean) {
    startTransition(async () => {
      setChecked({ id: itemId, value });
      await toggleChecklistItem(assignment.id, itemId, value);
    });
  }

  function complete() {
    startTransition(async () => {
      await completeAssignment(assignment.id);
    });
  }

  /** Führt eine Aktion (Tausch, Verschieben, Auslassen) aus und zeigt deren Fehlermeldung an. */
  function run(action: () => Promise<{ error: string | null }>) {
    startTransition(async () => {
      setActionError(null);
      const result = await action();
      if (result.error) setActionError(result.error);
    });
  }

  const carryOver = formatCarryOver(assignment.original_due_date);
  // Was heute (oder früher) dran ist, geht "auf morgen"; Späteres einen Tag weiter.
  const postponeLabel =
    daysBetween(assignment.due_date, today()) <= 0 ? "Auf morgen" : "Einen Tag später";

  const swap = assignment.pendingSwap;
  const swapAnMich = swap?.requested_to === meId;
  const swapVonMir = swap?.requested_by === meId;

  return (
    <article
      className={`rounded-2xl border bg-surface transition-opacity ${
        overdue ? "border-danger/40" : "border-border"
      } ${pending ? "opacity-60" : ""}`}
      style={assignee ? { boxShadow: `inset 3px 0 0 0 ${assignee.color}` } : undefined}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] leading-snug font-semibold text-ink">
            {assignment.task.name}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className={overdue ? "font-semibold text-danger" : ""}>
              {formatDueDate(assignment.due_date)}
            </span>
            {carryOver && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-danger">{carryOver}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{formatMinutes(assignment.effort_minutes)}</span>
            {assignee && (
              <>
                <span aria-hidden>·</span>
                <span>{isMine ? "Du bist dran" : assignee.display_name}</span>
              </>
            )}
          </div>

          {hasChecklist && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent"
            >
              Checkliste {done}/{assignment.checklist.length}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={expanded ? "rotate-180" : ""}
                aria-hidden
              >
                <path d="m5 9 7 7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {assignee && <Avatar profile={assignee} />}
      </div>

      {expanded && hasChecklist && (
        <ul className="border-t border-border px-4 py-2">
          {assignment.checklist.map((item) => {
            const isChecked = checked.includes(item.id);
            return (
              <li key={item.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => toggle(item.id, e.target.checked)}
                    className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className={isChecked ? "text-muted line-through" : "text-ink"}>
                    {item.label}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={complete}
          disabled={pending}
          className="w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          style={
            assignee
              ? isMine
                ? { backgroundColor: assignee.color, color: readableInk(assignee.color) }
                : { backgroundColor: tint(assignee.color, 0.16), color: "var(--ink)" }
              : { backgroundColor: "var(--surface-2)", color: "var(--ink)" }
          }
        >
          {isMine ? "Erledigt" : `Für ${assignee?.display_name ?? "die andere Person"} erledigt`}
        </button>

        {confirmSkip ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 text-xs text-muted">
              Diesmal auslassen? Die nächste Runde kommt regulär.
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => skipAssignment(assignment.id))}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
            >
              Ja
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmSkip(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted disabled:opacity-50"
            >
              Nein
            </button>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => postponeAssignment(assignment.id))}
              className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted disabled:opacity-50"
            >
              {postponeLabel}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmSkip(true)}
              className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted disabled:opacity-50"
            >
              Diesmal auslassen
            </button>
          </div>
        )}

        {swap ? (
          swapAnMich ? (
            <div className="mt-2">
              <p className="mb-2 text-xs text-muted">
                {assignee?.display_name ?? "Die andere Person"} bietet diese Aufgabe zum Tausch an
                {swap.message ? `: „${swap.message}“` : "."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => acceptSwap(swap.id))}
                  className="flex-1 rounded-lg border border-accent bg-accent-soft py-2 text-xs font-semibold text-ink disabled:opacity-50"
                >
                  Übernehmen
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => declineSwap(swap.id))}
                  className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted disabled:opacity-50"
                >
                  Ablehnen
                </button>
              </div>
            </div>
          ) : swapVonMir ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">Zum Tausch angeboten</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => cancelSwap(swap.id))}
                className="text-xs font-medium text-muted disabled:opacity-50"
              >
                Zurückziehen
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">Für diese Aufgabe läuft eine Tauschanfrage.</p>
          )
        ) : (
          isMine &&
          meId && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => offerSwap(assignment.id))}
              className="mt-2 w-full py-1 text-xs font-medium text-muted disabled:opacity-50"
            >
              {partnerName ? `${partnerName} um Tausch bitten` : "Zum Tausch anbieten"}
            </button>
          )
        )}

        {actionError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {actionError}
          </p>
        )}

        <AssignmentExtras
          assignmentId={assignment.id}
          comments={assignment.comments}
          photos={assignment.photos}
          profiles={profiles}
          meId={meId}
        />
      </div>
    </article>
  );
}
