import { describe, expect, it } from "vitest";
import type { Assignment, Profile } from "@/lib/database.types";
import { computeScores, computeStreak, leader } from "@/lib/score";

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
  ...anna,
  id: "ben",
  display_name: "Ben",
  created_at: "2026-01-02T10:00:00Z",
};
const PROFILE = [anna, ben];

let counter = 0;
function done(profileId: string, minutes: number, day: string): Assignment {
  counter += 1;
  return {
    id: `a${counter}`,
    task_id: `t${counter}`,
    assignee_id: profileId,
    due_date: day,
    status: "done",
    effort_minutes: minutes,
    // 12 Uhr mittags – so kippt der Tag nicht durch die Zeitzone.
    completed_at: `${day}T12:00:00Z`,
    completed_by: profileId,
    reminded_at: null,
    skipped_at: null,
    skipped_by: null,
    original_due_date: null,
    created_at: `${day}T08:00:00Z`,
  };
}

describe("computeScores", () => {
  it("zählt Minuten und Aufgaben pro Person, Führende zuerst", () => {
    const scores = computeScores(PROFILE, [
      done(anna.id, 30, "2026-09-08"),
      done(anna.id, 15, "2026-09-09"),
      done(ben.id, 60, "2026-09-07"),
    ]);

    expect(scores).toEqual([
      { profileId: "ben", points: 60, tasks: 1 },
      { profileId: "anna", points: 45, tasks: 2 },
    ]);
  });

  it("schreibt die Punkte der Person gut, die abgehakt hat", () => {
    const uebernommen = { ...done(anna.id, 25, HEUTE), completed_by: ben.id };
    const scores = computeScores(PROFILE, [uebernommen]);
    expect(scores.find((s) => s.profileId === "ben")?.points).toBe(25);
    expect(scores.find((s) => s.profileId === "anna")?.points).toBe(0);
  });

  it("liefert für alle Profile einen Eintrag, auch ohne Erledigtes", () => {
    expect(computeScores(PROFILE, [])).toHaveLength(2);
  });
});

describe("computeStreak", () => {
  it("zählt aufeinanderfolgende Tage", () => {
    const eintraege = [
      done(anna.id, 10, "2026-09-09"),
      done(anna.id, 10, "2026-09-08"),
      done(anna.id, 10, "2026-09-07"),
    ];
    expect(computeStreak(eintraege, anna.id, HEUTE)).toEqual({ current: 3, longest: 3 });
  });

  it("lässt die Serie am laufenden Tag noch nicht reißen", () => {
    // Heute noch nichts erledigt, gestern und vorgestern schon.
    const eintraege = [done(anna.id, 10, "2026-09-08"), done(anna.id, 10, "2026-09-07")];
    expect(computeStreak(eintraege, anna.id, HEUTE).current).toBe(2);
  });

  it("reißt bei einer Lücke", () => {
    const eintraege = [done(anna.id, 10, "2026-09-09"), done(anna.id, 10, "2026-09-06")];
    expect(computeStreak(eintraege, anna.id, HEUTE).current).toBe(1);
  });

  it("merkt sich die längste Serie, auch wenn die aktuelle kürzer ist", () => {
    const eintraege = [
      done(anna.id, 10, "2026-09-09"),
      done(anna.id, 10, "2026-09-01"),
      done(anna.id, 10, "2026-08-31"),
      done(anna.id, 10, "2026-08-30"),
      done(anna.id, 10, "2026-08-29"),
    ];
    expect(computeStreak(eintraege, anna.id, HEUTE)).toEqual({ current: 1, longest: 4 });
  });

  it("zählt mehrere Aufgaben am selben Tag nur einmal", () => {
    const eintraege = [done(anna.id, 10, HEUTE), done(anna.id, 20, HEUTE)];
    expect(computeStreak(eintraege, anna.id, HEUTE).current).toBe(1);
  });

  it("ignoriert die Tage der anderen Person", () => {
    const eintraege = [done(ben.id, 10, "2026-09-09"), done(ben.id, 10, "2026-09-08")];
    expect(computeStreak(eintraege, anna.id, HEUTE)).toEqual({ current: 0, longest: 0 });
  });
});

describe("leader", () => {
  it("nennt Führende und Vorsprung", () => {
    const scores = computeScores(PROFILE, [done(anna.id, 60, HEUTE), done(ben.id, 20, HEUTE)]);
    expect(leader(scores)).toEqual({ profileId: "anna", abstand: 40 });
  });

  it("meldet bei Gleichstand niemanden", () => {
    const scores = computeScores(PROFILE, [done(anna.id, 30, HEUTE), done(ben.id, 30, HEUTE)]);
    expect(leader(scores)).toBeNull();
  });

  it("meldet niemanden, solange nichts erledigt wurde", () => {
    expect(leader(computeScores(PROFILE, []))).toBeNull();
  });
});
