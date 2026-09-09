import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { addDays, formatMinutes, today, toDay } from "@/lib/date";
import type { Assignment, Task } from "@/lib/database.types";

/**
 * ICS-Feed zum Abonnieren in Google Kalender, Apple Kalender oder Outlook.
 *
 * Die Adresse enthält ein geheimes Token pro Person und ist damit der
 * einzige Schutz – Kalender-Clients können sich nicht anmelden. Wer die
 * Adresse hat, sieht die Aufgabenliste. Deshalb: nicht öffentlich posten.
 * Ein neues Token in den Profil-Einstellungen macht die alte Adresse
 * augenblicklich ungültig.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt." },
      { status: 500 },
    );
  }

  const bereinigt = token.replace(/\.ics$/i, "");
  const { data: profile, error: lookupError } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("calendar_token", bereinigt)
    .maybeSingle();

  // Fehlt die Spalte, wurde schema.sql noch nicht aktualisiert – das ist ein
  // anderer Fall als ein unbekanntes Token und soll auch so aussehen.
  if (lookupError) {
    return new NextResponse(`Kalender nicht verfügbar: ${lookupError.message}`, { status: 500 });
  }
  if (!profile) {
    return new NextResponse("Kalender nicht gefunden.", { status: 404 });
  }

  const heute = today();

  // Offene Zuweisungen plus die letzten vier Wochen – so bleibt im Kalender
  // sichtbar, was schon erledigt wurde.
  const [{ data: assignments }, { data: profiles }] = await Promise.all([
    admin
      .from("assignments")
      .select("*, task:tasks(name, notes)")
      .or(`status.eq.open,completed_at.gte.${addDays(heute, -28)}T00:00:00Z`)
      .order("due_date"),
    admin.from("profiles").select("id, display_name"),
  ]);

  const namen = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const rows = (assignments ?? []) as unknown as (Assignment & {
    task: Pick<Task, "name" | "notes"> | null;
  })[];

  const events: IcsEvent[] = rows.map((a) => {
    const person = namen.get(a.assignee_id) ?? "?";
    const erledigt = a.status === "done";
    const name = a.task?.name ?? "Aufgabe";

    const beschreibung = [
      `Zuständig: ${person}`,
      `Aufwand: ${formatMinutes(a.effort_minutes)}`,
      erledigt && a.completed_at
        ? `Erledigt am ${toDay(a.completed_at).split("-").reverse().join(".")} von ${
            namen.get(a.completed_by ?? a.assignee_id) ?? person
          }`
        : null,
      a.task?.notes ?? null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      uid: `${a.id}@haushalt`,
      // Erledigtes steht am Tag der Erledigung, Offenes am Fälligkeitstag.
      day: erledigt && a.completed_at ? toDay(a.completed_at) : a.due_date,
      summary: `${erledigt ? "✓ " : ""}${name} (${person})`,
      description: beschreibung,
      changedAt: a.completed_at ?? a.created_at,
    };
  });

  const ics = buildCalendar("Haushalt", events);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="haushalt.ics"',
      // Kalender-Clients cachen ohnehin; sie sollen aber nichts Altes sehen.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
