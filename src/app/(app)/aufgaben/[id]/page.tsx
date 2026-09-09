import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskForm } from "@/components/task-form";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { updateTask } from "@/lib/actions";
import { getProfiles, getTask, getTaskHistory } from "@/lib/queries";
import { formatMinutes, toDay } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function AufgabeBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [task, history, profiles] = await Promise.all([
    getTask(id),
    getTaskHistory(id),
    getProfiles(),
  ]);
  if (!task) notFound();

  const byId = new Map(profiles.map((p) => [p.id, p]));

  return (
    <div className="space-y-8">
      <header>
        <Link href="/aufgaben" className="text-sm font-medium text-accent">
          ← Aufgaben
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{task.name}</h1>
      </header>

      <TaskForm action={updateTask} task={task} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Verlauf</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Diese Aufgabe wurde noch nie abgehakt.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {history.map((entry) => {
              const person = byId.get(entry.completed_by ?? entry.assignee_id);
              return (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: person?.color ?? "var(--muted)" }}
                    aria-hidden
                  />
                  <span className="flex-1 text-sm text-ink">
                    {person?.display_name ?? "Unbekannt"}
                  </span>
                  <span className="text-xs text-muted">
                    {entry.completed_at
                      ? toDay(entry.completed_at).split("-").reverse().join(".")
                      : "–"}{" "}
                    · {formatMinutes(entry.effort_minutes)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DeleteTaskButton taskId={task.id} taskName={task.name} />
    </div>
  );
}
