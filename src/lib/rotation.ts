import type { Assignment, Profile } from "@/lib/database.types";
import { addDays, daysBetween, toDay, today } from "@/lib/date";

/**
 * Rotationsalgorithmus
 * ====================
 *
 * Ziel ist keine stumpfe "mal du, mal ich"-Abwechslung, sondern eine faire
 * Verteilung nach *Aufwand*: ein 10-Minuten-Job wiegt nicht so viel wie ein
 * 60-Minuten-Job.
 *
 * Die "Last" einer Person ist die Summe der Aufwandsminuten aus
 *   a) allen in den letzten `LOAD_WINDOW_DAYS` Tagen erledigten Aufgaben und
 *   b) allen aktuell offenen Zuweisungen.
 *
 * (b) ist wichtig: ohne die offenen Zuweisungen würde ein Durchlauf, der
 * mehrere Aufgaben auf einmal erzeugt, alles derselben Person geben.
 *
 * Wer die kleinere Last hat, bekommt die nächste Aufgabe. Bei Gleichstand
 * bekommt sie die Person, die diese Aufgabe *nicht* zuletzt gemacht hat –
 * so entsteht bei gleich schweren Aufgaben die erwartete Abwechslung.
 */

/** Zeitfenster, über das die Fairness gemessen wird. */
export const LOAD_WINDOW_DAYS = 28;

export type LoadMap = Record<string, number>;

/**
 * Last pro Person in Minuten. `assignments` sollte alle offenen sowie die
 * erledigten Zuweisungen des Zeitfensters enthalten.
 */
export function computeLoad(
  profiles: Profile[],
  assignments: Assignment[],
  reference = today(),
): LoadMap {
  const windowStart = addDays(reference, -LOAD_WINDOW_DAYS);
  const load: LoadMap = Object.fromEntries(profiles.map((p) => [p.id, 0]));

  for (const a of assignments) {
    if (a.status === "open") {
      load[a.assignee_id] = (load[a.assignee_id] ?? 0) + a.effort_minutes;
      continue;
    }
    if (!a.completed_at) continue;
    if (daysBetween(toDay(a.completed_at), windowStart) < 0) continue;
    // Gutgeschrieben wird, wer die Aufgabe tatsächlich erledigt hat.
    const doer = a.completed_by ?? a.assignee_id;
    load[doer] = (load[doer] ?? 0) + a.effort_minutes;
  }

  return load;
}

/** Ist die Person am Stichtag abwesend (Urlaub o. Ä.)? */
export function isAway(profile: Profile, onDate: string): boolean {
  return profile.away_until !== null && daysBetween(profile.away_until, onDate) >= 0;
}

export type PickAssigneeArgs = {
  profiles: Profile[];
  load: LoadMap;
  /** Wer hat genau diese Aufgabe zuletzt erledigt? */
  lastDoneBy?: string | null;
  /** Stichtag der Zuweisung (für die Abwesenheitsprüfung). */
  onDate: string;
};

/**
 * Wählt die Person aus, die als Nächstes dran ist.
 * Gibt `null` zurück, wenn es keine Profile gibt.
 */
export function pickAssignee({
  profiles,
  load,
  lastDoneBy = null,
  onDate,
}: PickAssigneeArgs): string | null {
  if (profiles.length === 0) return null;

  // Abwesende überspringen – sind alle abwesend, wird trotzdem verteilt,
  // damit die Aufgabe nicht lautlos verschwindet.
  const available = profiles.filter((p) => !isAway(p, onDate));
  const candidates = available.length > 0 ? available : profiles;
  if (candidates.length === 1) return candidates[0].id;

  const sorted = [...candidates].sort((a, b) => {
    const diff = (load[a.id] ?? 0) - (load[b.id] ?? 0);
    if (diff !== 0) return diff;

    // Gleichstand: wer die Aufgabe zuletzt gemacht hat, ist hinten dran.
    const aWasLast = a.id === lastDoneBy ? 1 : 0;
    const bWasLast = b.id === lastDoneBy ? 1 : 0;
    if (aWasLast !== bWasLast) return aWasLast - bWasLast;

    // Immer noch gleich: stabile, nachvollziehbare Reihenfolge.
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });

  return sorted[0].id;
}
