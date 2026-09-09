import Link from "next/link";
import { TaskListItem } from "@/components/task-list-item";
import { getProfiles, getTasks } from "@/lib/queries";
import { formatMinutes } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function AufgabenPage() {
  const [tasks, profiles] = await Promise.all([getTasks(true), getProfiles()]);

  const profileMap = Object.fromEntries(
    profiles.map((p) => [p.id, { display_name: p.display_name, color: p.color }]),
  );

  const aktiv = tasks.filter((t) => t.is_active);
  const pausiert = tasks.filter((t) => !t.is_active);

  // Grober Wochenaufwand aller Turnus-Aufgaben – hilft beim Einschätzen,
  // ob die Liste realistisch ist.
  const wochenaufwand = Math.round(
    aktiv
      .filter((t) => t.recurrence === "interval" && t.interval_days)
      .reduce((sum, t) => sum + (t.effort_minutes * 7) / (t.interval_days as number), 0),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Aufgaben</h1>
          <p className="mt-1 text-sm text-muted">
            {aktiv.length} aktiv · ca. {formatMinutes(wochenaufwand)} pro Woche
          </p>
        </div>
        <Link
          href="/aufgaben/neu"
          className="shrink-0 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent"
        >
          Neu
        </Link>
      </header>

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          Noch keine Aufgaben. Lege die erste an – oder spiele die Beispielliste aus
          <code className="mx-1 rounded bg-surface-2 px-1 py-0.5 text-xs">supabase/seed.sql</code>
          ein.
        </p>
      ) : (
        <ul className="space-y-3">
          {aktiv.map((task) => (
            <TaskListItem key={task.id} task={task} profiles={profileMap} />
          ))}
        </ul>
      )}

      {pausiert.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Pausiert</h2>
          <ul className="space-y-3">
            {pausiert.map((task) => (
              <TaskListItem key={task.id} task={task} profiles={profileMap} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
