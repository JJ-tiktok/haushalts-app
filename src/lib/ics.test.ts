import { describe, expect, it } from "vitest";
import { buildCalendar } from "@/lib/ics";

const event = {
  uid: "abc@haushalt",
  day: "2026-09-09",
  summary: "Küche putzen (Anna)",
};

function zeilen(ics: string): string[] {
  return ics.split("\r\n");
}

describe("buildCalendar", () => {
  it("erzeugt ein gültiges Grundgerüst mit CRLF", () => {
    const ics = buildCalendar("Haushalt", [event]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(zeilen(ics)).toContain("VERSION:2.0");
    expect(zeilen(ics)).toContain("BEGIN:VEVENT");
    expect(zeilen(ics)).toContain("UID:abc@haushalt");
  });

  it("schreibt ganztägige Termine mit exklusivem Ende", () => {
    const ics = buildCalendar("Haushalt", [event]);
    expect(zeilen(ics)).toContain("DTSTART;VALUE=DATE:20260909");
    expect(zeilen(ics)).toContain("DTEND;VALUE=DATE:20260910");
  });

  it("rechnet das Ende über Monatsgrenzen korrekt", () => {
    const ics = buildCalendar("Haushalt", [{ ...event, day: "2026-09-30" }]);
    expect(zeilen(ics)).toContain("DTEND;VALUE=DATE:20261001");
  });

  it("maskiert Komma, Semikolon und Zeilenumbrüche", () => {
    const ics = buildCalendar("Haushalt", [
      { ...event, summary: "Bad; Küche, Flur", description: "Zeile 1\nZeile 2" },
    ]);
    expect(ics).toContain(String.raw`SUMMARY:Bad\; Küche\, Flur`);
    expect(ics).toContain(String.raw`DESCRIPTION:Zeile 1\nZeile 2`);
  });

  it("faltet zu lange Zeilen auf 75 Oktett", () => {
    const ics = buildCalendar("Haushalt", [{ ...event, summary: "Ü".repeat(100) }]);
    const encoder = new TextEncoder();

    for (const zeile of zeilen(ics)) {
      expect(encoder.encode(zeile).length).toBeLessThanOrEqual(75);
    }
    // Fortsetzungszeilen beginnen mit einem Leerzeichen.
    expect(ics).toMatch(/\r\n /);
  });

  it("hängt für jede Aufgabe genau ein VEVENT an", () => {
    const ics = buildCalendar("Haushalt", [event, { ...event, uid: "zweite@haushalt" }]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
  });
});
