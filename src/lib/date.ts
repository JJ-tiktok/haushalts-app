/**
 * Datums-Helfer.
 *
 * Fälligkeiten sind reine Kalendertage (`date` in Postgres, "YYYY-MM-DD" im
 * Code). Der Server läuft auf Vercel in UTC, die Nutzer sitzen aber in einer
 * anderen Zeitzone – deshalb wird "heute" immer explizit in der Haushalts-
 * Zeitzone berechnet, sonst springt der Tageswechsel um 1–2 Stunden daneben.
 */

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Berlin";

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Heutiger Kalendertag in der Haushalts-Zeitzone, z. B. "2026-09-09". */
export function today(): string {
  return isoFormatter.format(new Date());
}

/** Kalendertag eines Zeitstempels in der Haushalts-Zeitzone. */
export function toDay(value: string | Date): string {
  return isoFormatter.format(typeof value === "string" ? new Date(value) : value);
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Verschiebung der Haushalts-Zeitzone gegenüber UTC zu diesem Zeitpunkt. */
function timezoneOffsetMs(date: Date): number {
  const parts = Object.fromEntries(
    partsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

/**
 * Zeitstempel von Mitternacht (Haushalts-Zeitzone) als ISO-String – für
 * Postgres-Abfragen wie "alles seit Wochenbeginn".
 *
 * Ohne das würde eine Aufgabe, die Montag um 00:30 Ortszeit abgehakt wurde,
 * noch in der Vorwoche landen: Berlin liegt 1–2 Stunden vor UTC.
 */
export function startOfDayIso(day: string): string {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  // Zweiter Durchlauf fängt Zeitumstellungen ab.
  let instant = utcMidnight - timezoneOffsetMs(new Date(utcMidnight));
  instant = utcMidnight - timezoneOffsetMs(new Date(instant));
  return new Date(instant).toISOString();
}

/** Addiert Tage auf einen "YYYY-MM-DD"-String (zeitzonenfrei gerechnet). */
export function addDays(day: string, amount: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Differenz in Tagen: `a - b`. Positiv, wenn a später liegt. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Montag der Woche, in der `day` liegt. */
export function startOfWeek(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = (date.getUTCDay() + 6) % 7; // Montag = 0
  return addDays(day, -weekday);
}

/** Erster Tag des Monats, in dem `day` liegt. */
export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** "Heute", "Morgen", "Gestern" oder z. B. "Mi, 17.09.". */
export function formatDueDate(day: string, reference = today()): string {
  const diff = daysBetween(day, reference);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  if (diff < -1) return `${Math.abs(diff)} Tage überfällig`;

  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS[date.getUTCDay()].slice(0, 2);
  if (diff < 7) return `${weekday}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

/**
 * Hinweis für verschleppte Aufgaben: "seit gestern offen", "seit 3 Tagen
 * offen". `null`, wenn die Aufgabe nicht hinter ihrem ursprünglichen Tag
 * zurückliegt.
 */
export function formatCarryOver(originalDue: string | null, reference = today()): string | null {
  if (!originalDue) return null;
  const tage = daysBetween(reference, originalDue);
  if (tage <= 0) return null;
  if (tage === 1) return "seit gestern offen";
  return `seit ${tage} Tagen offen`;
}

/** "45 Min" bzw. "1 Std 15 Min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} Min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} Std` : `${hours} Std ${rest} Min`;
}

/** "alle 3 Tage", "täglich", "wöchentlich" … */
export function formatRecurrence(intervalDays: number | null): string {
  if (intervalDays === null) return "bei Bedarf";
  if (intervalDays === 1) return "täglich";
  if (intervalDays === 7) return "wöchentlich";
  if (intervalDays === 14) return "alle 2 Wochen";
  if (intervalDays === 21) return "alle 3 Wochen";
  if (intervalDays === 30 || intervalDays === 31) return "monatlich";
  return `alle ${intervalDays} Tage`;
}

/** Kurzer Wochentag, z. B. "Mo". */
export function weekdayShort(day: string): string {
  // Mittags rechnen, damit keine Zeitzone den Tag verschiebt.
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`))
    .replace(".", "");
}

/** Tag und Monat ohne Jahr, z. B. "09.09.". */
export function dayAndMonth(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}.${m}.`;
}

/** Ist `day` ein Samstag oder Sonntag? */
export function isWeekend(day: string): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** "gerade eben", "vor 20 Min", "vor 3 Std", "gestern", sonst "12.09." */
export function formatWhen(timestamp: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - Date.parse(timestamp)) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std`;

  const tage = daysBetween(toDay(now), toDay(timestamp));
  if (tage === 1) return "gestern";
  if (tage < 7) return `vor ${tage} Tagen`;
  return dayAndMonth(toDay(timestamp));
}
