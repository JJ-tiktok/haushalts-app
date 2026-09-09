import Link from "next/link";
import { AssignmentCard } from "@/components/assignment-card";
import { FairnessBar } from "@/components/fairness-bar";
import { NotesPreview } from "@/components/notes-preview";
import { createClient } from "@/lib/supabase/server";
import { ensureAssignments } from "@/lib/scheduler";
import {
  getCompletedSince,
  getCurrentProfile,
  getOpenAssignments,
  getProfiles,
  type AssignmentView,
} from "@/lib/queries";
import { daysBetween, startOfWeek, today } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function HeutePage() {
  const supabase = await createClient();

  // Fällige Turnus-Aufgaben nachziehen. Idempotent – ein Cron-Job ist dafür
  // nicht nötig, es reicht, dass jemand die App öffnet.
  await ensureAssignments(supabase);

  const [profiles, me, assignments, weekDone] = await Promise.all([
    getProfiles(),
    getCurrentProfile(),
    getOpenAssignments(),
    getCompletedSince(startOfWeek(today())),
  ]);

  const byId = new Map(profiles.map((p) => [p.id, p]));
  const partner = profiles.find((p) => p.id !== me?.id);
  const profileMap = Object.fromEntries(
    profiles.map((p) => [p.id, { display_name: p.display_name, color: p.color }]),
  );
  const heute = today();

  const overdue: AssignmentView[] = [];
  const dueToday: AssignmentView[] = [];
  const thisWeek: AssignmentView[] = [];
  // Offene Tauschanfragen an mich kommen nach oben, statt in der Liste
  // unterzugehen.
  const swapInbox: AssignmentView[] = [];

  for (const a of assignments) {
    if (a.pendingSwap && a.pendingSwap.requested_to === me?.id) {
      swapInbox.push(a);
      continue;
    }
    const diff = daysBetween(a.due_date, heute);
    if (diff < 0) overdue.push(a);
    else if (diff === 0) dueToday.push(a);
    else thisWeek.push(a);
  }

  const weekMinutes: Record<string, number> = {};
  for (const a of weekDone) {
    const doer = a.completed_by ?? a.assignee_id;
    weekMinutes[doer] = (weekMinutes[doer] ?? 0) + a.effort_minutes;
  }

  const mineOpen = assignments.filter((a) => a.assignee_id === me?.id);
  const mineTodayMinutes = [...overdue, ...dueToday]
    .filter((a) => a.assignee_id === me?.id)
    .reduce((sum, a) => sum + a.effort_minutes, 0);

  return (
    <div className="space-y-7">
      <header>
        <p className="text-xs tracking-wide text-muted uppercase">
          {new Intl.DateTimeFormat("de-DE", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          }).format(new Date())}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold text-ink">
          {me ? `Hallo ${me.display_name}` : "Haushalt"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mineTodayMinutes > 0
            ? `Heute stehen ${mineTodayMinutes} Minuten für dich an.`
            : mineOpen.length > 0
              ? "Heute nichts für dich – diese Woche schon."
              : "Für dich steht gerade nichts an."}
        </p>
      </header>

      {swapInbox.length > 0 && (
        <Abschnitt
          titel={swapInbox.length === 1 ? "Tauschanfrage" : "Tauschanfragen"}
          items={swapInbox}
          profiles={byId}
          meId={me?.id}
          partnerName={partner?.display_name}
          profiles2={profileMap}
        />
      )}

      <NotesPreview />

      {profiles.length < 2 && (
        <Hinweis>
          Es ist erst {profiles.length === 1 ? "ein Konto" : "kein Konto"} angelegt. Die faire
          Verteilung greift, sobald sich beide Personen registriert haben.
        </Hinweis>
      )}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink">Diese Woche erledigt</h2>
          <Link href="/verlauf" className="text-xs font-medium text-accent">
            Verlauf
          </Link>
        </div>
        <FairnessBar
          profiles={profiles}
          minutes={weekMinutes}
          caption="Nach Aufwand gewichtet, nicht nach Anzahl der Aufgaben."
        />
      </section>

      {assignments.length === 0 ? (
        <Leerzustand />
      ) : (
        <>
          <Abschnitt
            titel="Überfällig"
            items={overdue}
            profiles={byId}
            meId={me?.id}
            partnerName={partner?.display_name}
            profiles2={profileMap}
            overdue
          />
          <Abschnitt
            titel="Heute"
            items={dueToday}
            profiles={byId}
            meId={me?.id}
            partnerName={partner?.display_name}
            profiles2={profileMap}
          />
          <Abschnitt
            titel="Diese Woche"
            items={thisWeek}
            profiles={byId}
            meId={me?.id}
            partnerName={partner?.display_name}
            profiles2={profileMap}
          />
        </>
      )}
    </div>
  );
}

function Abschnitt({
  titel,
  items,
  profiles,
  meId,
  partnerName,
  profiles2,
  overdue = false,
}: {
  titel: string;
  items: AssignmentView[];
  profiles: Map<string, import("@/lib/database.types").Profile>;
  meId: string | undefined;
  partnerName: string | undefined;
  profiles2: Record<string, { display_name: string; color: string }>;
  overdue?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-ink">
        {titel}
        <span className="ml-2 font-normal text-muted">{items.length}</span>
      </h2>
      {items.map((a) => (
        <AssignmentCard
          key={a.id}
          assignment={a}
          assignee={profiles.get(a.assignee_id)}
          isMine={a.assignee_id === meId}
          overdue={overdue}
          meId={meId}
          partnerName={partnerName}
          profiles={profiles2}
        />
      ))}
    </section>
  );
}

function Hinweis({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-border bg-accent-soft px-4 py-3 text-sm text-ink">
      {children}
    </p>
  );
}

function Leerzustand() {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
      <p className="text-sm font-medium text-ink">Nichts offen</p>
      <p className="mt-1 text-sm text-muted">
        Entweder ist gerade alles erledigt – oder es sind noch keine Aufgaben angelegt.
      </p>
      <Link
        href="/aufgaben/neu"
        className="mt-4 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
      >
        Aufgabe anlegen
      </Link>
    </div>
  );
}
