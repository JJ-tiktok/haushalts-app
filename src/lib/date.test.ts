import { describe, expect, it } from "vitest";
import {
  addDays,
  dayAndMonth,
  daysBetween,
  formatDueDate,
  formatMinutes,
  formatRecurrence,
  isWeekend,
  startOfDayIso,
  startOfMonth,
  startOfWeek,
  weekdayShort,
} from "@/lib/date";

// Die Tests gehen von der Standard-Zeitzone Europe/Berlin aus.

describe("addDays / daysBetween", () => {
  it("rechnet über Monatsgrenzen", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("zählt Tage über die Zeitumstellung hinweg korrekt", () => {
    // Sommerzeit-Ende in Europa: 25.10.2026
    expect(daysBetween("2026-10-26", "2026-10-24")).toBe(2);
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});

describe("startOfWeek / startOfMonth", () => {
  it("beginnt die Woche am Montag", () => {
    // 2026-09-09 ist ein Mittwoch
    expect(startOfWeek("2026-09-09")).toBe("2026-09-07");
    // ein Montag bleibt er selbst
    expect(startOfWeek("2026-09-07")).toBe("2026-09-07");
    // ein Sonntag gehört zur Woche davor
    expect(startOfWeek("2026-09-13")).toBe("2026-09-07");
  });

  it("liefert den Monatsersten", () => {
    expect(startOfMonth("2026-09-09")).toBe("2026-09-01");
  });
});

describe("startOfDayIso", () => {
  it("trifft Mitternacht Ortszeit in der Sommerzeit (UTC+2)", () => {
    expect(startOfDayIso("2026-09-07")).toBe("2026-09-06T22:00:00.000Z");
  });

  it("trifft Mitternacht Ortszeit in der Winterzeit (UTC+1)", () => {
    expect(startOfDayIso("2026-01-05")).toBe("2026-01-04T23:00:00.000Z");
  });

  it("schneidet Erledigtes kurz nach Mitternacht nicht ab", () => {
    // Montag 00:30 Ortszeit muss zur neuen Woche zählen.
    const wochenbeginn = startOfDayIso(startOfWeek("2026-09-09"));
    const montagHalbEins = new Date("2026-09-06T22:30:00.000Z"); // = Mo 00:30 in Berlin
    expect(montagHalbEins.toISOString() >= wochenbeginn).toBe(true);
  });
});

describe("Formatierung", () => {
  it("benennt nahe Tage in Worten", () => {
    expect(formatDueDate("2026-09-09", "2026-09-09")).toBe("Heute");
    expect(formatDueDate("2026-09-10", "2026-09-09")).toBe("Morgen");
    expect(formatDueDate("2026-09-08", "2026-09-09")).toBe("Gestern");
    expect(formatDueDate("2026-09-06", "2026-09-09")).toBe("3 Tage überfällig");
  });

  it("schreibt Minuten und Stunden aus", () => {
    expect(formatMinutes(45)).toBe("45 Min");
    expect(formatMinutes(60)).toBe("1 Std");
    expect(formatMinutes(75)).toBe("1 Std 15 Min");
  });

  it("beschreibt den Turnus", () => {
    expect(formatRecurrence(null)).toBe("bei Bedarf");
    expect(formatRecurrence(1)).toBe("täglich");
    expect(formatRecurrence(7)).toBe("wöchentlich");
    expect(formatRecurrence(3)).toBe("alle 3 Tage");
  });
});

describe("Wochenraster-Beschriftung", () => {
  it("beschriftet die sieben Tage der Woche", () => {
    const montag = startOfWeek("2026-09-09");
    const labels = Array.from({ length: 7 }, (_, i) => weekdayShort(addDays(montag, i)));
    expect(labels).toEqual(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
  });

  it("schreibt Tag und Monat ohne Jahr", () => {
    expect(dayAndMonth("2026-09-07")).toBe("07.09.");
  });

  it("erkennt das Wochenende", () => {
    expect(isWeekend("2026-09-11")).toBe(false); // Freitag
    expect(isWeekend("2026-09-12")).toBe(true); // Samstag
    expect(isWeekend("2026-09-13")).toBe(true); // Sonntag
  });
});
