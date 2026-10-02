import { AutoRefresh } from "@/components/auto-refresh";
import { BottomNav } from "@/components/bottom-nav";
import { FairnessBar } from "@/components/fairness-bar";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { NoteItem } from "@/components/note-item";
import { WeekBoard, type WeekDay, type WeekItem } from "@/components/week-board";
import { createClient } from "@/lib/supabase/server";
import { ensureAssignments } from "@/lib/scheduler";
import { getCompletedSince, getNotes, getOpenAssignments, getProfiles } from "@/lib/queries";
import {
  addDays,
  dayAndMonth,
  daysBetween,
  formatMinutes,
  isWeekend,
  startOfWeek,
  today,
  weekdayShort,
} from "@/lib/date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wochenplan – Haushalt" };

/**
 * Wochenübersicht fürs Tablet oder Wand-Display.
 *
 * Zeigt Montag bis Sonntag nebeneinander; jede Aufgabe lässt sich per
 * Antippen auf einen anderen Tag legen. Abgehakt wird weiterhin am Handy –
 * hier geht es ums Einteilen, nicht ums Erledigen.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  await ensureAssignments(supabase);

  const heute = today();
  const wochenstart = startOfWeek(heute);
  const wochenende = addDays(wochenstart, 6);

  const [profiles, assignments, weekDone, notes] = await Promise.all([
    getProfiles(),
    getOpenAssignments(),
    getCompletedSince(wochenstart),
    getNotes({ limit: 4 }),
  ]);

  const byId = new Map(profiles.map((p) => [p.id, p]));

  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(wochenstart, i);
    return {
      date,
      weekday: weekdayShort(date),
      dayLabel: dayAndMonth(date),
      isToday: date === heute,
      isPast: daysBetween(date, heute) < 0,
      isWeekend: isWeekend(date),
    };
  });

  const toItem = (a: (typeof assignments)[number]): WeekItem => {
    const person = byId.get(a.assignee_id);
    return {
      id: a.id,
      name: a.task.name,
      dueDate: a.due_date,
      minutes: a.effort_minutes,
      assigneeName: person?.display_name ?? "?",
      color: person?.color ?? "#6f6c66",
    };
  };

  // Überfälliges kommt in einen eigenen Streifen, Späteres unter das Raster –
  // so ist alles Offene sichtbar und nichts fällt zwischen die Wochen.
  const overdue: WeekItem[] = [];
  const inWeek: WeekItem[] = [];
  const later: WeekItem[] = [];

  for (const a of assignments) {
    const item = toItem(a);
    if (daysBetween(a.due_date, wochenstart) < 0) overdue.push(item);
    else if (daysBetween(a.due_date, wochenende) > 0) later.push(item);
    else inWeek.push(item);
  }

  const weekMinutes: Record<string, number> = {};
  for (const a of weekDone) {
    const doer = a.completed_by ?? a.assignee_id;
    weekMinutes[doer] = (weekMinutes[doer] ?? 0) + a.effort_minutes;
  }

  const offeneMinuten = inWeek.reduce((sum, item) => sum + item.minutes, 0);

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-5 p-4 pb-28 lg:p-8 lg:pb-28">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm tracking-wide text-muted uppercase">
            {dayAndMonth(wochenstart)} – {dayAndMonth(wochenende)}
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-ink lg:text-4xl">Diese Woche</h1>
          <p className="mt-1 text-sm text-muted">
            {inWeek.length === 0
              ? "Nichts eingeplant."
              : `${inWeek.length} offen · ${formatMinutes(offeneMinuten)} · Aufgabe antippen, um sie auf einen anderen Tag zu legen.`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <ul className="flex items-center gap-3">
            {profiles.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 text-sm text-ink">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                />
                {p.display_name}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <WeekBoard days={days} items={inWeek} overdue={overdue} />

      {later.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Nächste Woche
          </h2>
          <ul className="flex flex-wrap gap-2">
            {later.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-ink"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                {item.name}
                <span className="text-muted">{weekdayShort(item.dueDate)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Notizen</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} author={byId.get(note.author_id)} readOnly />
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-auto rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Diese Woche erledigt</h2>
        <FairnessBar profiles={profiles} minutes={weekMinutes} />
      </footer>

      <BottomNav />
      <RealtimeRefresh />
      <AutoRefresh everySeconds={300} />
    </div>
  );
}
