import type { Assignment, Profile } from "@/lib/database.types";
import { computeScores, computeStreak, leader } from "@/lib/score";
import { formatMinutes, startOfDayIso, startOfMonth, startOfWeek, today } from "@/lib/date";
import { readableInk } from "@/lib/color";

/**
 * Rangliste: dieselben Minuten wie im Verlauf, nur sportlich gelesen.
 * Der Verlauf darüber bleibt die neutrale Darstellung – hier darf gestichelt
 * werden.
 */
export function Scoreboard({
  profiles,
  completed,
}: {
  profiles: Profile[];
  completed: Assignment[];
}) {
  const heute = today();
  const wocheAb = startOfDayIso(startOfWeek(heute));
  const monatAb = startOfDayIso(startOfMonth(heute));

  const imZeitraum = (ab: string) =>
    completed.filter((a) => a.completed_at !== null && a.completed_at >= ab);

  const woche = computeScores(profiles, imZeitraum(wocheAb));
  const monat = computeScores(profiles, imZeitraum(monatAb));
  const gesamt = computeScores(profiles, completed);

  const fuehrend = leader(woche);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Rangliste</h2>
        <span className="text-xs text-muted">Punkt = erledigte Minute</span>
      </div>

      <p className="text-sm text-ink">
        {fuehrend
          ? `${byId.get(fuehrend.profileId)?.display_name ?? "?"} führt diese Woche mit ${formatMinutes(fuehrend.abstand)} Vorsprung.`
          : woche.every((s) => s.points === 0)
            ? "Diese Woche steht es noch 0 zu 0."
            : "Diese Woche steht es unentschieden."}
      </p>

      <ul className="space-y-2">
        {woche.map((score, index) => {
          const person = byId.get(score.profileId);
          if (!person) return null;
          const streak = computeStreak(completed, score.profileId, heute);
          const bestPunkte = Math.max(...woche.map((s) => s.points), 1);

          return (
            <li key={score.profileId} className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
                    style={{ backgroundColor: person.color, color: readableInk(person.color) }}
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  {person.display_name}
                </span>
                <span className="text-sm font-semibold text-ink">{score.points}</span>
              </div>

              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((score.points / bestPunkte) * 100)}%`,
                    backgroundColor: person.color,
                  }}
                />
              </div>

              <p className="mt-2 text-[11px] text-muted">
                {score.tasks} {score.tasks === 1 ? "Aufgabe" : "Aufgaben"} · Serie {streak.current}{" "}
                {streak.current === 1 ? "Tag" : "Tage"}
                {streak.longest > streak.current && ` (Rekord ${streak.longest})`} · Monat{" "}
                {monat.find((s) => s.profileId === score.profileId)?.points ?? 0} · Gesamt{" "}
                {gesamt.find((s) => s.profileId === score.profileId)?.points ?? 0}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
