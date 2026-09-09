import type { Assignment, Profile } from "@/lib/database.types";
import { addDays, daysBetween, toDay, today } from "@/lib/date";

/**
 * Punkte und Serien.
 *
 * Punkte sind schlicht die erledigten Aufwandsminuten – dieselbe Zahl, die
 * auch die faire Verteilung steuert. Damit misst die Rangliste dasselbe wie
 * der Verlauf, nur mit anderem Vorzeichen: dort geht es um Ausgleich, hier
 * ums Kräftemessen.
 */

export type Score = {
  profileId: string;
  /** Erledigte Minuten im Zeitraum. */
  points: number;
  /** Anzahl erledigter Aufgaben im Zeitraum. */
  tasks: number;
};

/** Wer hat die Zuweisung tatsächlich erledigt? */
function doer(a: Assignment): string {
  return a.completed_by ?? a.assignee_id;
}

/** Punkte pro Person, absteigend sortiert. */
export function computeScores(profiles: Profile[], done: Assignment[]): Score[] {
  const scores = new Map<string, Score>(
    profiles.map((p) => [p.id, { profileId: p.id, points: 0, tasks: 0 }]),
  );

  for (const a of done) {
    if (a.status !== "done" || !a.completed_at) continue;
    const score = scores.get(doer(a));
    if (!score) continue;
    score.points += a.effort_minutes;
    score.tasks += 1;
  }

  return [...scores.values()].sort((a, b) => b.points - a.points || b.tasks - a.tasks);
}

export type Streak = {
  /** Laufende Serie in Tagen. */
  current: number;
  /** Längste je erreichte Serie. */
  longest: number;
};

/**
 * Serie = aufeinanderfolgende Tage, an denen die Person mindestens eine
 * Aufgabe erledigt hat.
 *
 * Der heutige Tag zählt erst, wenn tatsächlich etwas erledigt wurde – ohne
 * ihn läuft die Zählung ab gestern weiter. Sonst wäre die Serie jeden Morgen
 * um 00:01 gerissen, obwohl der Tag noch gar nicht gelaufen ist.
 */
export function computeStreak(done: Assignment[], profileId: string, reference = today()): Streak {
  const tage = new Set<string>();
  for (const a of done) {
    if (a.status !== "done" || !a.completed_at) continue;
    if (doer(a) !== profileId) continue;
    tage.add(toDay(a.completed_at));
  }
  if (tage.size === 0) return { current: 0, longest: 0 };

  // Laufende Serie: von heute (oder gestern) rückwärts zählen.
  let current = 0;
  let cursor = tage.has(reference) ? reference : addDays(reference, -1);
  while (tage.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  // Längste Serie: sortierte Tage durchlaufen und Lücken suchen.
  const sortiert = [...tage].sort();
  let longest = 1;
  let lauf = 1;
  for (let i = 1; i < sortiert.length; i++) {
    if (daysBetween(sortiert[i], sortiert[i - 1]) === 1) lauf += 1;
    else lauf = 1;
    if (lauf > longest) longest = lauf;
  }

  return { current, longest: Math.max(longest, current) };
}

/**
 * Wer führt? `null` bei Gleichstand oder wenn noch nichts erledigt wurde.
 * `abstand` ist der Vorsprung in Punkten.
 */
export function leader(scores: Score[]): { profileId: string; abstand: number } | null {
  if (scores.length < 2) return null;
  const [erster, zweiter] = scores;
  if (erster.points === 0) return null;
  if (erster.points === zweiter.points) return null;
  return { profileId: erster.profileId, abstand: erster.points - zweiter.points };
}
