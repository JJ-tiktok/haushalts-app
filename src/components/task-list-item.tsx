"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { Profile } from "@/lib/database.types";
import type { TaskView } from "@/lib/queries";
import { setTaskActive, triggerOnDemandTask } from "@/lib/actions";
import { formatMinutes, formatRecurrence, toDay } from "@/lib/date";

export function TaskListItem({
  task,
  profiles,
}: {
  task: TaskView;
  profiles: Record<string, Pick<Profile, "display_name" | "color">>;
}) {
  const [pending, startTransition] = useTransition();

  const assignee = task.openAssignment ? profiles[task.openAssignment.assignee_id] : undefined;
  const lastPerson = task.lastDoneBy ? profiles[task.lastDoneBy] : undefined;

  return (
    <li
      className={`rounded-2xl border border-border bg-surface ${
        task.is_active ? "" : "opacity-55"
      } ${pending ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Link href={`/aufgaben/${task.id}`} className="block">
            <h3 className="text-[15px] font-semibold text-ink">{task.name}</h3>
            <p className="mt-1 text-xs text-muted">
              {formatRecurrence(task.recurrence === "interval" ? task.interval_days : null)} ·{" "}
              {formatMinutes(task.effort_minutes)}
              {task.checklist.length > 0 && ` · ${task.checklist.length} Schritte`}
            </p>
          </Link>

          <p className="mt-1.5 text-xs text-muted">
            {assignee ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: assignee.color }}
                  aria-hidden
                />
                Offen bei {assignee.display_name}
              </span>
            ) : lastPerson && task.lastDoneAt ? (
              <>
                Zuletzt: {lastPerson.display_name},{" "}
                {toDay(task.lastDoneAt).split("-").reverse().join(".")}
              </>
            ) : (
              "Noch nie erledigt"
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {task.recurrence === "on_demand" && task.is_active && !task.openAssignment && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => void (await triggerOnDemandTask(task.id)))}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-50"
            >
              Jetzt fällig
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => void (await setTaskActive(task.id, !task.is_active)))
            }
            className="text-xs font-medium text-muted disabled:opacity-50"
          >
            {task.is_active ? "Pausieren" : "Aktivieren"}
          </button>
        </div>
      </div>
    </li>
  );
}
