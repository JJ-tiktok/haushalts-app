import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAssignments } from "@/lib/scheduler";
import { sendPushToProfile } from "@/lib/push";
import { formatMinutes, today } from "@/lib/date";
import type { Assignment, Task } from "@/lib/database.types";

/**
 * Tägliche Erinnerung an fällige Aufgaben.
 *
 * Läuft über Vercel Cron (siehe vercel.json) und ist mit CRON_SECRET
 * geschützt. Vercel schickt den Wert automatisch als Bearer-Token mit,
 * sobald die Variable im Projekt gesetzt ist.
 *
 * Der Endpunkt ist bewusst idempotent: pro Zuweisung wird höchstens einmal
 * erinnert (`reminded_at`), ein zweiter Aufruf am selben Tag schickt nichts.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET ist nicht gesetzt." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt." },
      { status: 500 },
    );
  }

  const heute = today();

  // Erst nachziehen, was heute fällig geworden ist …
  const created = await ensureAssignments(admin);

  // … dann erinnern.
  const { data, error } = await admin
    .from("assignments")
    .select("*, task:tasks(name)")
    .eq("status", "open")
    .lte("due_date", heute)
    .is("reminded_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const faellig = (data ?? []) as unknown as (Assignment & { task: Pick<Task, "name"> })[];
  if (faellig.length === 0) {
    return NextResponse.json({ created, reminded: 0, notified: 0 });
  }

  // Eine Benachrichtigung pro Person, nicht eine pro Aufgabe.
  const proPerson = new Map<string, (Assignment & { task: Pick<Task, "name"> })[]>();
  for (const assignment of faellig) {
    const liste = proPerson.get(assignment.assignee_id) ?? [];
    liste.push(assignment);
    proPerson.set(assignment.assignee_id, liste);
  }

  let notified = 0;

  for (const [profileId, aufgaben] of proPerson) {
    const minuten = aufgaben.reduce((sum, a) => sum + a.effort_minutes, 0);
    const namen = aufgaben.map((a) => a.task?.name ?? "Aufgabe");
    const liste = namen.length > 3 ? `${namen.slice(0, 3).join(", ")} …` : namen.join(", ");

    const delivered = await sendPushToProfile(profileId, {
      title: aufgaben.length === 1 ? "Heute fällig" : `Heute fällig: ${aufgaben.length} Aufgaben`,
      body: `${liste} · ${formatMinutes(minuten)}`,
      url: "/",
      tag: `due-${heute}`,
    });
    if (delivered > 0) notified += 1;
  }

  const { error: markError } = await admin
    .from("assignments")
    .update({ reminded_at: new Date().toISOString() })
    .in(
      "id",
      faellig.map((a) => a.id),
    );
  if (markError) {
    return NextResponse.json({ error: markError.message }, { status: 500 });
  }

  return NextResponse.json({ created, reminded: faellig.length, notified });
}
