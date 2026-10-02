import { describe, expect, it } from "vitest";
import type { Assignment, Profile } from "@/lib/database.types";
import { computeLoad, isAway, nextRoundDate, pickAssignee } from "@/lib/rotation";

const HEUTE = "2026-09-09";

const anna: Profile = {
  id: "anna",
  display_name: "Anna",
  color: "#3f6b5a",
  away_until: null,
  calendar_token: "11111111-1111-1111-1111-111111111111",
  created_at: "2026-01-01T10:00:00Z",
};

const ben: Profile = {
  id: "ben",
  display_name: "Ben",
  color: "#2f6f9f",
  away_until: null,
  calendar_token: "22222222-2222-2222-2222-222222222222",
  created_at: "2026-01-02T10:00:00Z",
};

const PROFILE = [anna, ben];

let counter = 0;
function assignment(partial: Partial<Assignment>): Assignment {
  counter += 1;
  return {
    id: `a${counter}`,
    task_id: `t${counter}`,
    assignee_id: anna.id,
    due_date: HEUTE,
    status: "open",
    effort_minutes: 30,
    completed_at: null,
    completed_by: null,
    reminded_at: null,
    skipped_at: null,
    skipped_by: null,
    original_due_date: null,
    created_at: `${HEUTE}T08:00:00Z`,
    ...partial,
  };
}

function done(profileId: string, minutes: number, day: string): Assignment {
  return assignment({
    assignee_id: profileId,
    status: "done",
    effort_minutes: minutes,
    completed_at: `${day}T12:00:00Z`,
    completed_by: profileId,
  });
}

describe("computeLoad", () => {
  it("zählt offene Zuweisungen und erledigte im Zeitfenster", () => {
    const load = computeLoad(
      PROFILE,
      [
        assignment({ assignee_id: anna.id, effort_minutes: 45 }),
        done(ben.id, 30, "2026-09-08"),
        done(ben.id, 10, "2026-09-01"),
      ],
      HEUTE,
    );

    expect(load).toEqual({ anna: 45, ben: 40 });
  });

  it("ignoriert Erledigtes außerhalb des 28-Tage-Fensters", () => {
    const load = computeLoad(PROFILE, [done(anna.id, 60, "2026-07-01")], HEUTE);
    expect(load).toEqual({ anna: 0, ben: 0 });
  });

  it("schreibt die Minuten der Person gut, die tatsächlich erledigt hat", () => {
    // Ben hakt eine Aufgabe ab, die Anna zugewiesen war.
    const uebernommen = assignment({
      assignee_id: anna.id,
      status: "done",
      effort_minutes: 25,
      completed_at: `${HEUTE}T09:00:00Z`,
      completed_by: ben.id,
    });

    expect(computeLoad(PROFILE, [uebernommen], HEUTE)).toEqual({ anna: 0, ben: 25 });
  });
});

describe("pickAssignee", () => {
  it("wählt die Person mit der kleineren Last", () => {
    const gewaehlt = pickAssignee({
      profiles: PROFILE,
      load: { anna: 90, ben: 30 },
      onDate: HEUTE,
    });
    expect(gewaehlt).toBe(ben.id);
  });

  it("gewichtet nach Aufwand, nicht nach Anzahl", () => {
    // Anna: ein 60-Minuten-Job. Ben: drei 10-Minuten-Jobs.
    const load = computeLoad(
      PROFILE,
      [
        done(anna.id, 60, "2026-09-08"),
        done(ben.id, 10, "2026-09-08"),
        done(ben.id, 10, "2026-09-07"),
        done(ben.id, 10, "2026-09-06"),
      ],
      HEUTE,
    );

    expect(pickAssignee({ profiles: PROFILE, load, onDate: HEUTE })).toBe(ben.id);
  });

  it("gibt die Aufgabe bei Gleichstand nicht derselben Person wie zuletzt", () => {
    const gewaehlt = pickAssignee({
      profiles: PROFILE,
      load: { anna: 0, ben: 0 },
      lastDoneBy: anna.id,
      onDate: HEUTE,
    });
    expect(gewaehlt).toBe(ben.id);
  });

  it("überspringt abwesende Personen", () => {
    const annaImUrlaub = { ...anna, away_until: "2026-09-20" };
    const gewaehlt = pickAssignee({
      profiles: [annaImUrlaub, ben],
      // Anna hätte eigentlich die kleinere Last.
      load: { anna: 0, ben: 120 },
      onDate: HEUTE,
    });
    expect(gewaehlt).toBe(ben.id);
  });

  it("verteilt trotzdem, wenn beide abwesend sind", () => {
    const gewaehlt = pickAssignee({
      profiles: [
        { ...anna, away_until: "2026-09-20" },
        { ...ben, away_until: "2026-09-20" },
      ],
      load: { anna: 60, ben: 10 },
      onDate: HEUTE,
    });
    expect(gewaehlt).toBe(ben.id);
  });

  it("ist nach Ablauf der Abwesenheit wieder normal dabei", () => {
    const zurueck = { ...anna, away_until: "2026-09-08" };
    expect(isAway(zurueck, HEUTE)).toBe(false);
    expect(
      pickAssignee({ profiles: [zurueck, ben], load: { anna: 0, ben: 60 }, onDate: HEUTE }),
    ).toBe(anna.id);
  });
});

describe("Verteilung über mehrere Aufgaben", () => {
  it("gleicht ungleich schwere Aufgaben über die Zeit aus", () => {
    // Reihenfolge wie im Scheduler: pro Zuweisung wächst die Last mit.
    const aufgaben = [60, 10, 10, 30, 45, 5, 20];
    const load: Record<string, number> = { anna: 0, ben: 0 };

    for (const minuten of aufgaben) {
      const gewaehlt = pickAssignee({ profiles: PROFILE, load, onDate: HEUTE })!;
      load[gewaehlt] += minuten;
    }

    const differenz = Math.abs(load.anna - load.ben);
    const summe = load.anna + load.ben;

    expect(summe).toBe(180);
    // Perfekt geht nicht bei diesen Zahlen – aber deutlich unter der
    // größten Einzelaufgabe muss der Unterschied bleiben.
    expect(differenz).toBeLessThanOrEqual(20);
  });
});

describe("Auslassen", () => {
  it("zählt ausgelassene Runden nicht als Last", () => {
    const load = computeLoad(
      PROFILE,
      [
        assignment({
          status: "skipped",
          skipped_at: `${HEUTE}T09:00:00Z`,
          skipped_by: anna.id,
          effort_minutes: 60,
        }),
        done(ben.id, 20, "2026-09-08"),
      ],
      HEUTE,
    );
    expect(load).toEqual({ anna: 0, ben: 20 });
  });
});

describe("nextRoundDate", () => {
  it("ist ohne Historie sofort fällig", () => {
    expect(nextRoundDate(7, undefined, HEUTE)).toBe(HEUTE);
  });

  it("rechnet nach Erledigung ab dem Erledigungstag", () => {
    expect(nextRoundDate(3, { kind: "done", day: "2026-09-08" }, HEUTE)).toBe("2026-09-11");
  });

  it("behält beim Auslassen am Fälligkeitstag den Rhythmus", () => {
    // Montag geplant, Montag ausgelassen -> nächster Montag
    expect(
      nextRoundDate(7, { kind: "skipped", plannedDay: "2026-09-07", day: "2026-09-07" }, HEUTE),
    ).toBe("2026-09-14");
  });

  it("behält den Rhythmus auch bei verspätetem Auslassen", () => {
    // Montag geplant, Mittwoch ausgelassen -> trotzdem nächster Montag
    expect(
      nextRoundDate(7, { kind: "skipped", plannedDay: "2026-09-07", day: "2026-09-09" }, HEUTE),
    ).toBe("2026-09-14");
  });

  it("kommt nach dem Auslassen frühestens am nächsten Tag wieder", () => {
    // Täglich, seit Tagen verschleppt, heute ausgelassen -> morgen
    expect(nextRoundDate(1, { kind: "skipped", plannedDay: "2026-09-05", day: HEUTE }, HEUTE)).toBe(
      "2026-09-10",
    );
  });
});
