import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignment, Database, Profile, Task } from "@/lib/database.types";
import { addDays, daysBetween, startOfDayIso, toDay, today } from "@/lib/date";
import {
  LOAD_WINDOW_DAYS,
  computeLoad,
  nextRoundDate,
  pickAssignee,
  type LastRound,
  type LoadMap,
} from "@/lib/rotation";

export type Client = SupabaseClient<Database>;

/** Wie weit im Voraus Zuweisungen erzeugt werden (für "diese Woche"). */
export const LOOKAHEAD_DAYS = 7;

/** Postgres: unique_violation – erwartbar, wenn beide Handys gleichzeitig syncen. */
const UNIQUE_VIOLATION = "23505";

/** Postgres: undefined_column – Migration aus schema.sql fehlt noch. */
const UNDEFINED_COLUMN = "42703";

type SchedulingContext = {
  profiles: Profile[];
  load: LoadMap;
  /** task_id -> Profil-ID, die diese Aufgabe zuletzt erledigt hat */
  lastDoneBy: Map<string, string>;
  /** task_id -> wie die letzte Runde geendet hat (erledigt oder ausgelassen) */
  lastRound: Map<string, LastRound>;
  /** task_ids mit bereits offener Zuweisung */
  hasOpen: Set<string>;
};

async function loadContext(supabase: Client, reference: string): Promise<SchedulingContext> {
  const since = startOfDayIso(addDays(reference, -365));

  const history = (withSkipped: boolean) =>
    supabase
      .from("assignments")
      .select("*")
      .or(
        withSkipped
          ? `status.eq.open,completed_at.gte.${since},skipped_at.gte.${since}`
          : `status.eq.open,completed_at.gte.${since}`,
      )
      .order("completed_at", { ascending: false });

  const [profilesRes, firstTry] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    history(true),
  ]);

  // Spalte skipped_at fehlt noch (schema.sql nicht erneut ausgeführt):
  // ohne Auslassen weiterplanen statt die Startseite zu sprengen.
  const assignmentsRes =
    firstTry.error?.code === UNDEFINED_COLUMN ? await history(false) : firstTry;

  if (profilesRes.error) throw profilesRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;

  const profiles = profilesRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];

  const lastDoneBy = new Map<string, string>();
  const lastRound = new Map<string, LastRound>();
  /** task_id -> Zeitstempel des jüngsten Rundenendes */
  const lastEndedAt = new Map<string, string>();
  const hasOpen = new Set<string>();

  for (const a of assignments) {
    if (a.status === "open") {
      hasOpen.add(a.task_id);
      continue;
    }
    // Absteigend nach completed_at sortiert -> der erste Treffer ist die
    // jüngste Erledigung. Für den Tie-Break zählt nur tatsächlich Erledigtes.
    if (a.status === "done" && a.completed_at && !lastDoneBy.has(a.task_id)) {
      lastDoneBy.set(a.task_id, a.completed_by ?? a.assignee_id);
    }

    // Ausgelassenes hat kein completed_at und steht deshalb nicht sortiert
    // dazwischen – das jüngste Rundenende per Zeitstempel bestimmen.
    const endedAt = a.status === "done" ? a.completed_at : a.skipped_at;
    if (!endedAt) continue;
    const bisher = lastEndedAt.get(a.task_id);
    if (bisher && Date.parse(bisher) >= Date.parse(endedAt)) continue;

    lastEndedAt.set(a.task_id, endedAt);
    lastRound.set(
      a.task_id,
      a.status === "done"
        ? { kind: "done", day: toDay(endedAt) }
        : {
            kind: "skipped",
            plannedDay: a.original_due_date ?? a.due_date,
            day: toDay(endedAt),
          },
    );
  }

  return {
    profiles,
    load: computeLoad(profiles, assignments, reference),
    lastDoneBy,
    lastRound,
    hasOpen,
  };
}

type NewAssignment = Database["public"]["Tables"]["assignments"]["Insert"];

async function insertAssignments(supabase: Client, rows: NewAssignment[]): Promise<number> {
  if (rows.length === 0) return 0;

  const { error } = await supabase.from("assignments").insert(rows);
  if (!error) return rows.length;
  if (error.code !== UNIQUE_VIOLATION) throw error;

  // Jemand war schneller: einzeln nachziehen und Kollisionen überspringen.
  let created = 0;
  for (const row of rows) {
    const single = await supabase.from("assignments").insert(row);
    if (!single.error) created += 1;
    else if (single.error.code !== UNIQUE_VIOLATION) throw single.error;
  }
  return created;
}

/**
 * Zieht offene Zuweisungen mit Fälligkeit in der Vergangenheit auf heute.
 * Der ursprüngliche Tag bleibt in `original_due_date` erhalten.
 *
 * Bewusst fehlertolerant: ist die Datenbank-Funktion noch nicht angelegt
 * (schema.sql nicht erneut ausgeführt), bleibt Überfälliges einfach
 * überfällig, statt die ganze Startseite zu sprengen.
 */
export async function rollOverOverdue(supabase: Client, reference = today()): Promise<number> {
  const { data, error } = await supabase.rpc("roll_over_overdue", { p_today: reference });
  if (error) {
    console.warn("roll_over_overdue fehlgeschlagen:", error.message);
    return 0;
  }
  return data ?? 0;
}

/**
 * Erzeugt fehlende Zuweisungen für alle fälligen Turnus-Aufgaben.
 *
 * Idempotent: dank des partiellen Unique-Index kann pro Aufgabe immer nur
 * eine offene Zuweisung existieren. Wird bei jedem Laden der Startseite
 * aufgerufen – ein Cron-Job ist damit nicht nötig.
 */
export async function ensureAssignments(supabase: Client, reference = today()): Promise<number> {
  await rollOverOverdue(supabase, reference);

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("is_active", true)
    .eq("recurrence", "interval")
    .order("created_at");
  if (error) throw error;
  if (!tasks || tasks.length === 0) return 0;

  const ctx = await loadContext(supabase, reference);
  if (ctx.profiles.length === 0) return 0;

  const horizon = addDays(reference, LOOKAHEAD_DAYS);
  const rows: NewAssignment[] = [];

  // Zuerst die am längsten überfälligen Aufgaben verteilen – die sollen die
  // Person mit der aktuell kleinsten Last bekommen.
  const pending = tasks
    .filter((t) => !ctx.hasOpen.has(t.id))
    .map((t) => ({
      task: t,
      due: nextRoundDate(t.interval_days ?? 1, ctx.lastRound.get(t.id), reference),
    }))
    .filter(({ due }) => daysBetween(due, horizon) <= 0)
    .sort((a, b) => a.due.localeCompare(b.due));

  for (const { task, due } of pending) {
    const assignee = pickAssignee({
      profiles: ctx.profiles,
      load: ctx.load,
      lastDoneBy: ctx.lastDoneBy.get(task.id) ?? null,
      // Überfälliges wird "für heute" verteilt – sonst greift die
      // Urlaubsregel mit einem Datum aus der Vergangenheit.
      onDate: daysBetween(due, reference) < 0 ? reference : due,
    });
    if (!assignee) break;

    rows.push({
      task_id: task.id,
      assignee_id: assignee,
      due_date: due,
      effort_minutes: task.effort_minutes,
    });

    // Last direkt mitziehen, damit der nächste Durchlaufschritt ausgleicht.
    ctx.load[assignee] = (ctx.load[assignee] ?? 0) + task.effort_minutes;
  }

  return insertAssignments(supabase, rows);
}

/**
 * Legt eine Zuweisung für eine bedarfsbasierte Aufgabe an
 * ("Wäschekorb ist voll" -> jetzt fällig).
 */
export async function requestOnDemand(
  supabase: Client,
  taskId: string,
  reference = today(),
): Promise<{ created: boolean }> {
  const { data: task, error } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (error) throw error;

  const ctx = await loadContext(supabase, reference);
  if (ctx.hasOpen.has(taskId)) return { created: false };

  const assignee = pickAssignee({
    profiles: ctx.profiles,
    load: ctx.load,
    lastDoneBy: ctx.lastDoneBy.get(taskId) ?? null,
    onDate: reference,
  });
  if (!assignee) return { created: false };

  const created = await insertAssignments(supabase, [
    {
      task_id: task.id,
      assignee_id: assignee,
      due_date: reference,
      effort_minutes: task.effort_minutes,
    },
  ]);

  return { created: created > 0 };
}

export { LOAD_WINDOW_DAYS };
export type { Assignment };
