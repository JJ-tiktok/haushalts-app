import { FairnessBar } from "@/components/fairness-bar";
import { HistoryItem } from "@/components/history-item";
import { Scoreboard } from "@/components/scoreboard";
import { getAllCompleted, getCompletedSince, getHistory, getProfiles } from "@/lib/queries";
import { formatMinutes, startOfMonth, startOfWeek, today } from "@/lib/date";
import type { Assignment, Profile } from "@/lib/database.types";

export const dynamic = "force-dynamic";

function sumByPerson(assignments: Assignment[]): Record<string, number> {
  const minutes: Record<string, number> = {};
  for (const a of assignments) {
    const doer = a.completed_by ?? a.assignee_id;
    minutes[doer] = (minutes[doer] ?? 0) + a.effort_minutes;
  }
  return minutes;
}

function balanceHinweis(profiles: Profile[], minutes: Record<string, number>): string {
  if (profiles.length < 2) return "Sobald beide Konten angelegt sind, wird es hier interessant.";

  const values = profiles.map((p) => ({ p, m: minutes[p.id] ?? 0 })).sort((a, b) => b.m - a.m);
  const total = values.reduce((sum, v) => sum + v.m, 0);
  if (total === 0) return "In diesem Zeitraum wurde noch nichts abgehakt.";

  const diff = values[0].m - values[1].m;
  if (diff <= 20) return "Ziemlich ausgeglichen.";
  return `${values[0].p.display_name} hat ${formatMinutes(diff)} mehr übernommen.`;
}

export default async function VerlaufPage() {
  const heute = today();

  const [profiles, week, month, history, completed] = await Promise.all([
    getProfiles(),
    getCompletedSince(startOfWeek(heute)),
    getCompletedSince(startOfMonth(heute)),
    getHistory(60),
    getAllCompleted(),
  ]);

  const byId = new Map(profiles.map((p) => [p.id, p]));
  const weekMinutes = sumByPerson(week);
  const monthMinutes = sumByPerson(month);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Verlauf</h1>
        <p className="mt-1 text-sm text-muted">
          Wie sich die Arbeit verteilt hat – gemessen in Zeit, nicht in Anzahl.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Diese Woche</h2>
          <FairnessBar
            profiles={profiles}
            minutes={weekMinutes}
            caption={balanceHinweis(profiles, weekMinutes)}
          />
        </div>
        <hr className="border-border" />
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Dieser Monat</h2>
          <FairnessBar
            profiles={profiles}
            minutes={monthMinutes}
            caption={balanceHinweis(profiles, monthMinutes)}
          />
        </div>
      </section>

      <Scoreboard profiles={profiles} completed={completed} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Zuletzt erledigt oder ausgelassen</h2>
        {history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            Noch nichts abgehakt.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {history.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                person={byId.get(
                  (entry.status === "skipped" ? entry.skipped_by : entry.completed_by) ??
                    entry.assignee_id,
                )}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
