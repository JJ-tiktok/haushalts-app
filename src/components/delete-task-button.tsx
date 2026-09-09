"use client";

import { useTransition } from "react";
import { deleteTask } from "@/lib/actions";

export function DeleteTaskButton({ taskId, taskName }: { taskId: string; taskName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const sicher = window.confirm(
          `"${taskName}" wirklich löschen? Der Verlauf dieser Aufgabe geht mit verloren. ` +
            `Wenn ihr sie nur vorübergehend nicht braucht, pausiert sie stattdessen.`,
        );
        if (sicher) startTransition(async () => void (await deleteTask(taskId)));
      }}
      className="w-full rounded-xl border border-danger/40 py-2.5 text-sm font-medium text-danger disabled:opacity-50"
    >
      {pending ? "Löschen …" : "Aufgabe löschen"}
    </button>
  );
}
