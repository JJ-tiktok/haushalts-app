/**
 * Minimaler iCalendar-Generator (RFC 5545).
 *
 * Reicht für das, was hier gebraucht wird: ganztägige Termine ohne
 * Wiederholungsregeln. Der Turnus wird bewusst nicht als RRULE abgebildet –
 * die App verschiebt Fälligkeiten dynamisch, eine feste Regel würde im
 * Kalender schnell etwas anderes behaupten als die App.
 */

export type IcsEvent = {
  /** Stabil über alle Abrufe hinweg, sonst dupliziert der Kalender. */
  uid: string;
  /** Kalendertag "YYYY-MM-DD" – der Termin ist ganztägig. */
  day: string;
  summary: string;
  description?: string;
  /** Zeitpunkt der letzten Änderung, für DTSTAMP. */
  changedAt?: string;
};

/** Sonderzeichen in TEXT-Werten maskieren. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Zeilen auf 75 Oktett falten. Umlaute zählen als zwei Bytes – deshalb wird
 * über die UTF-8-Länge gerechnet, nicht über die Zeichenzahl.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let bytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    // Fortsetzungszeilen beginnen mit einem Leerzeichen, das mitzählt.
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current) parts.push(current);

  return parts.join("\r\n ");
}

function toIcsDate(day: string): string {
  return day.replace(/-/g, "");
}

function toIcsTimestamp(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Ganztägige Termine enden am Folgetag (DTEND ist exklusiv). */
function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return toIcsDate(date.toISOString().slice(0, 10));
}

export function buildCalendar(name: string, events: IcsEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Haushalt//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    // Hinweis an Google & Co., wie oft sie nachsehen sollen.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${toIcsTimestamp(event.changedAt)}`,
      `DTSTART;VALUE=DATE:${toIcsDate(event.day)}`,
      `DTEND;VALUE=DATE:${nextDay(event.day)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(fold).join("\r\n")}\r\n`;
}
