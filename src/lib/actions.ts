"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureAssignments, requestOnDemand } from "@/lib/scheduler";
import { sendPushToProfile } from "@/lib/push";
import { daysBetween, today } from "@/lib/date";
import { getOrigin } from "@/lib/origin";
import type { RecurrenceType } from "@/lib/database.types";

function revalidateAll() {
  revalidatePath("/", "layout");
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type AuthState = { error: string | null };

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Anmeldung fehlgeschlagen. E-Mail oder Passwort stimmen nicht." };

  revalidateAll();
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const color = String(formData.get("color") ?? "#6366f1");

  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben." };
  if (password.length < 8) return { error: "Das Passwort braucht mindestens 8 Zeichen." };
  if (!displayName) return { error: "Bitte einen Namen angeben." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName, color },
      // Ohne das nimmt Supabase die im Dashboard hinterlegte Site-URL –
      // die zeigt im Standard auf localhost.
      emailRedirectTo: `${await getOrigin()}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  if (!data.session) {
    return { error: "Konto angelegt. Bitte zuerst die E-Mail-Adresse bestätigen." };
  }

  revalidateAll();
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidateAll();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Zuweisungen
// ---------------------------------------------------------------------------

export async function completeAssignment(assignmentId: string) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("assignments")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq("id", assignmentId)
    .eq("status", "open");
  if (error) throw error;

  // Direkt die nächste Runde planen, damit der Turnus sichtbar weiterläuft.
  await ensureAssignments(supabase);
  revalidateAll();
}

export async function reopenAssignment(assignmentId: string) {
  const { supabase } = await requireUser();

  const { data: assignment, error } = await supabase
    .from("assignments")
    .select("id, task_id")
    .eq("id", assignmentId)
    .single();
  if (error) throw error;

  // Beim Erledigen wurde ggf. schon die Folge-Zuweisung erzeugt. Pro Aufgabe
  // darf es nur eine offene geben – die neuere muss also weichen.
  const { error: cleanupError } = await supabase
    .from("assignments")
    .delete()
    .eq("task_id", assignment.task_id)
    .eq("status", "open");
  if (cleanupError) throw cleanupError;

  const { error: reopenError } = await supabase
    .from("assignments")
    .update({ status: "open", completed_at: null, completed_by: null })
    .eq("id", assignmentId);
  if (reopenError) throw reopenError;

  revalidateAll();
}

export async function toggleChecklistItem(
  assignmentId: string,
  checklistItemId: string,
  checked: boolean,
) {
  const { supabase } = await requireUser();

  if (checked) {
    const { error } = await supabase
      .from("assignment_checks")
      .upsert({ assignment_id: assignmentId, checklist_item_id: checklistItemId });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("assignment_checks")
      .delete()
      .eq("assignment_id", assignmentId)
      .eq("checklist_item_id", checklistItemId);
    if (error) throw error;
  }

  revalidateAll();
}

export async function triggerOnDemandTask(taskId: string) {
  const { supabase } = await requireUser();
  await requestOnDemand(supabase, taskId);
  revalidateAll();
}

export async function syncAssignments() {
  const { supabase } = await requireUser();
  await ensureAssignments(supabase);
  revalidateAll();
}

// ---------------------------------------------------------------------------
// Aufgaben
// ---------------------------------------------------------------------------

export type TaskFormState = { error: string | null };

function parseTaskForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const recurrence = String(formData.get("recurrence") ?? "interval") as RecurrenceType;
  const intervalRaw = String(formData.get("interval_days") ?? "").trim();
  const effortRaw = String(formData.get("effort_minutes") ?? "").trim();

  const intervalDays = recurrence === "interval" ? Number(intervalRaw) : null;
  const effortMinutes = Number(effortRaw);

  const checklist = formData
    .getAll("checklist")
    .map((entry) => String(entry).trim())
    .filter(Boolean);

  return { name, notes, recurrence, intervalDays, effortMinutes, checklist };
}

function validateTaskForm(input: ReturnType<typeof parseTaskForm>): string | null {
  if (!input.name) return "Die Aufgabe braucht einen Namen.";
  if (!Number.isFinite(input.effortMinutes) || input.effortMinutes <= 0) {
    return "Bitte einen Aufwand in Minuten angeben.";
  }
  if (input.recurrence === "interval") {
    if (!Number.isFinite(input.intervalDays ?? NaN) || (input.intervalDays ?? 0) <= 0) {
      return "Bitte einen Turnus in Tagen angeben.";
    }
  }
  return null;
}

async function replaceChecklist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  labels: string[],
) {
  const { error: deleteError } = await supabase
    .from("checklist_items")
    .delete()
    .eq("task_id", taskId);
  if (deleteError) throw deleteError;

  if (labels.length === 0) return;
  const { error } = await supabase
    .from("checklist_items")
    .insert(labels.map((label, position) => ({ task_id: taskId, label, position })));
  if (error) throw error;
}

export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const { supabase } = await requireUser();
  const input = parseTaskForm(formData);
  const invalid = validateTaskForm(input);
  if (invalid) return { error: invalid };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      name: input.name,
      notes: input.notes || null,
      recurrence: input.recurrence,
      interval_days: input.intervalDays,
      effort_minutes: input.effortMinutes,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await replaceChecklist(supabase, data.id, input.checklist);
  await ensureAssignments(supabase);
  revalidateAll();
  redirect("/aufgaben");
}

export async function updateTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Aufgabe nicht gefunden." };

  const input = parseTaskForm(formData);
  const invalid = validateTaskForm(input);
  if (invalid) return { error: invalid };

  const { error } = await supabase
    .from("tasks")
    .update({
      name: input.name,
      notes: input.notes || null,
      recurrence: input.recurrence,
      interval_days: input.intervalDays,
      effort_minutes: input.effortMinutes,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await replaceChecklist(supabase, id, input.checklist);
  revalidateAll();
  redirect("/aufgaben");
}

export async function setTaskActive(taskId: string, isActive: boolean) {
  const { supabase } = await requireUser();

  const { error } = await supabase.from("tasks").update({ is_active: isActive }).eq("id", taskId);
  if (error) throw error;

  if (!isActive) {
    // Pausierte Aufgaben sollen nicht mehr in der Liste stehen.
    const { error: cleanupError } = await supabase
      .from("assignments")
      .delete()
      .eq("task_id", taskId)
      .eq("status", "open");
    if (cleanupError) throw cleanupError;
  } else {
    await ensureAssignments(supabase);
  }

  revalidateAll();
}

export async function deleteTask(taskId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
  revalidateAll();
  redirect("/aufgaben");
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export type ProfileFormState = { error: string | null; saved: boolean };

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const { supabase, user } = await requireUser();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const awayUntil = String(formData.get("away_until") ?? "").trim();

  if (!displayName) return { error: "Bitte einen Namen angeben.", saved: false };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      color: color || "#6366f1",
      away_until: awayUntil || null,
    })
    .eq("id", user.id);
  if (error) return { error: error.message, saved: false };

  revalidateAll();
  return { error: null, saved: true };
}

// ---------------------------------------------------------------------------
// Tausch-Funktion
// ---------------------------------------------------------------------------

/** Die jeweils andere Person im Haushalt. */
async function partnerOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  meId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .neq("id", meId)
    .order("created_at")
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

async function displayName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", profileId)
    .single();
  return data?.display_name ?? "Jemand";
}

export type SwapResult = { error: string | null };

/** Eine zugewiesene Aufgabe der anderen Person zum Tausch anbieten. */
export async function offerSwap(assignmentId: string, message?: string): Promise<SwapResult> {
  const { supabase, user } = await requireUser();

  const { data: assignment, error } = await supabase
    .from("assignments")
    .select("*, task:tasks(name)")
    .eq("id", assignmentId)
    .single();
  if (error) return { error: "Aufgabe nicht gefunden." };
  if (assignment.status !== "open") return { error: "Die Aufgabe ist schon erledigt." };
  if (assignment.assignee_id !== user.id) {
    return { error: "Tauschen kann nur, wem die Aufgabe zugewiesen ist." };
  }

  const partner = await partnerOf(supabase, user.id);
  if (!partner) return { error: "Es gibt noch keine zweite Person im Haushalt." };

  const { error: insertError } = await supabase.from("swap_requests").insert({
    assignment_id: assignmentId,
    requested_by: user.id,
    requested_to: partner,
    message: message?.trim() || null,
  });
  // Unique-Index: es läuft bereits eine Anfrage zu dieser Zuweisung.
  if (insertError?.code === "23505")
    return { error: "Für diese Aufgabe läuft schon eine Anfrage." };
  if (insertError) return { error: insertError.message };

  const taskName =
    (assignment as unknown as { task: { name: string } }).task?.name ?? "Eine Aufgabe";
  await sendPushToProfile(partner, {
    title: "Tauschanfrage",
    body: `${await displayName(supabase, user.id)} möchte "${taskName}" tauschen.`,
    url: "/",
    tag: `swap-${assignmentId}`,
  });

  revalidateAll();
  return { error: null };
}

/** Anfrage annehmen: die Zuweisung wechselt zur annehmenden Person. */
export async function acceptSwap(swapId: string): Promise<SwapResult> {
  const { supabase, user } = await requireUser();

  const { data: swap, error } = await supabase
    .from("swap_requests")
    .select("*")
    .eq("id", swapId)
    .single();
  if (error) return { error: "Anfrage nicht gefunden." };
  if (swap.status !== "pending") return { error: "Die Anfrage ist nicht mehr offen." };
  if (swap.requested_to !== user.id) return { error: "Diese Anfrage ist nicht an dich gerichtet." };

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("*, task:tasks(name)")
    .eq("id", swap.assignment_id)
    .single();
  if (assignmentError) return { error: "Aufgabe nicht gefunden." };
  if (assignment.status !== "open") {
    // Zwischenzeitlich erledigt – Anfrage stillschweigend schließen.
    await supabase
      .from("swap_requests")
      .update({ status: "cancelled", resolved_at: new Date().toISOString() })
      .eq("id", swapId);
    revalidateAll();
    return { error: "Die Aufgabe wurde inzwischen erledigt." };
  }

  const { error: reassignError } = await supabase
    .from("assignments")
    .update({ assignee_id: user.id })
    .eq("id", swap.assignment_id)
    .eq("status", "open");
  if (reassignError) return { error: reassignError.message };

  const { error: updateError } = await supabase
    .from("swap_requests")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", swapId);
  if (updateError) return { error: updateError.message };

  const taskName =
    (assignment as unknown as { task: { name: string } }).task?.name ?? "Die Aufgabe";
  await sendPushToProfile(swap.requested_by, {
    title: "Tausch angenommen",
    body: `${await displayName(supabase, user.id)} übernimmt "${taskName}".`,
    url: "/",
    tag: `swap-${swap.assignment_id}`,
  });

  revalidateAll();
  return { error: null };
}

/** Anfrage ablehnen – die Zuweisung bleibt, wo sie ist. */
export async function declineSwap(swapId: string): Promise<SwapResult> {
  const { supabase, user } = await requireUser();

  const { data: swap, error } = await supabase
    .from("swap_requests")
    .select("*, assignment:assignments(task:tasks(name))")
    .eq("id", swapId)
    .single();
  if (error) return { error: "Anfrage nicht gefunden." };
  if (swap.requested_to !== user.id) return { error: "Diese Anfrage ist nicht an dich gerichtet." };

  const { error: updateError } = await supabase
    .from("swap_requests")
    .update({ status: "declined", resolved_at: new Date().toISOString() })
    .eq("id", swapId)
    .eq("status", "pending");
  if (updateError) return { error: updateError.message };

  const taskName =
    (swap as unknown as { assignment: { task: { name: string } } }).assignment?.task?.name ??
    "Die Aufgabe";
  await sendPushToProfile(swap.requested_by, {
    title: "Tausch abgelehnt",
    body: `"${taskName}" bleibt bei dir.`,
    url: "/",
    tag: `swap-${swap.assignment_id}`,
  });

  revalidateAll();
  return { error: null };
}

/** Eigene Anfrage zurückziehen. */
export async function cancelSwap(swapId: string): Promise<SwapResult> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("swap_requests")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", swapId)
    .eq("requested_by", user.id)
    .eq("status", "pending");
  if (error) return { error: error.message };

  revalidateAll();
  return { error: null };
}

// ---------------------------------------------------------------------------
// Push-Benachrichtigungen
// ---------------------------------------------------------------------------

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

/** Gerät für Benachrichtigungen registrieren. */
export async function savePushSubscription(input: PushSubscriptionInput) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;

  revalidatePath("/profil");
}

/** Gerät wieder abmelden. */
export async function deletePushSubscription(endpoint: string) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("profile_id", user.id);
  if (error) throw error;

  revalidatePath("/profil");
}

/** Testbenachrichtigung an die eigenen Geräte. */
export async function sendTestPush(): Promise<{ delivered: number }> {
  const { user } = await requireUser();

  const delivered = await sendPushToProfile(user.id, {
    title: "Haushalt",
    body: "Benachrichtigungen funktionieren.",
    url: "/",
    tag: "test",
  });

  return { delivered };
}

// ---------------------------------------------------------------------------
// Aufgaben auf andere Tage schieben (Wochenplanung im Dashboard)
// ---------------------------------------------------------------------------

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verschiebt eine offene Zuweisung auf einen anderen Tag.
 *
 * Ändert nur die Fälligkeit, nicht die Zuständigkeit – wer dran ist, bleibt
 * dran. Der Turnus rechnet ab der tatsächlichen Erledigung weiter, die
 * Verschiebung verzerrt ihn also nicht dauerhaft.
 */
export async function rescheduleAssignment(
  assignmentId: string,
  dueDate: string,
): Promise<{ error: string | null }> {
  const { supabase } = await requireUser();

  if (!ISO_DAY.test(dueDate)) return { error: "Ungültiges Datum." };

  // Grober Rahmen gegen Vertipper und manipulierte Requests.
  const abstand = daysBetween(dueDate, today());
  if (abstand < -60 || abstand > 180) {
    return { error: "Das Datum liegt zu weit weg." };
  }

  const { error } = await supabase
    .from("assignments")
    .update({ due_date: dueDate })
    .eq("id", assignmentId)
    .eq("status", "open");
  if (error) return { error: error.message };

  revalidateAll();
  return { error: null };
}

// ---------------------------------------------------------------------------
// Notizen (gemeinsame Pinnwand)
// ---------------------------------------------------------------------------

const NOTE_MAX = 500;

export type NoteFormState = { error: string | null; saved: boolean };

/**
 * Notiz hinterlassen. Die andere Person bekommt eine Benachrichtigung –
 * genau dafür schreibt man ja eine Notiz.
 */
export async function createNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const { supabase, user } = await requireUser();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Die Notiz ist leer.", saved: false };
  if (body.length > NOTE_MAX) {
    return { error: `Bitte auf ${NOTE_MAX} Zeichen kürzen.`, saved: false };
  }

  const { error } = await supabase.from("notes").insert({ author_id: user.id, body });
  if (error) return { error: error.message, saved: false };

  const partner = await partnerOf(supabase, user.id);
  if (partner) {
    await sendPushToProfile(partner, {
      title: `Notiz von ${await displayName(supabase, user.id)}`,
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      url: "/notizen",
      tag: "note",
    });
  }

  revalidateAll();
  return { error: null, saved: true };
}

/** Notiz abhaken – sie verschwindet aus der aktiven Liste. */
export async function completeNote(noteId: string) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("notes")
    .update({ done_at: new Date().toISOString(), done_by: user.id })
    .eq("id", noteId)
    .is("done_at", null);
  if (error) throw error;

  revalidateAll();
}

/** Abgehakte Notiz wieder aktiv setzen. */
export async function reopenNote(noteId: string) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("notes")
    .update({ done_at: null, done_by: null })
    .eq("id", noteId);
  if (error) throw error;

  revalidateAll();
}

/** Anheften oder lösen – Angeheftetes steht immer oben. */
export async function toggleNotePinned(noteId: string, pinned: boolean) {
  const { supabase } = await requireUser();

  const { error } = await supabase.from("notes").update({ is_pinned: pinned }).eq("id", noteId);
  if (error) throw error;

  revalidateAll();
}

/** Notiz endgültig löschen. */
export async function deleteNote(noteId: string) {
  const { supabase } = await requireUser();

  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) throw error;

  revalidateAll();
}

// ---------------------------------------------------------------------------
// Einkaufsliste
// ---------------------------------------------------------------------------

export type ShoppingFormState = { error: string | null; saved: boolean };

/**
 * Artikel auf die Liste setzen. Bewusst ein Feld: man tippt "Milch" oder
 * "2 Liter Milch" und ist fertig – die Menge wird abgetrennt, wenn sie
 * vorne steht.
 */
export async function addShoppingItem(
  _prev: ShoppingFormState,
  formData: FormData,
): Promise<ShoppingFormState> {
  const { supabase, user } = await requireUser();

  const eingabe = String(formData.get("name") ?? "").trim();
  if (!eingabe) return { error: "Bitte etwas eintragen.", saved: false };
  if (eingabe.length > 120) return { error: "Bitte kürzer fassen.", saved: false };

  // "2 Liter Milch" -> Menge "2 Liter", Name "Milch"
  const match = eingabe.match(/^(\d+(?:[.,]\d+)?\s*[a-zA-ZäöüÄÖÜ]*\.?)\s+(.{2,})$/);
  const quantity = match ? match[1].trim() : null;
  const name = match ? match[2].trim() : eingabe;

  const { error } = await supabase
    .from("shopping_items")
    .insert({ name, quantity, added_by: user.id });
  if (error) return { error: error.message, saved: false };

  revalidateAll();
  return { error: null, saved: true };
}

/** Artikel abhaken (im Laden) oder wieder auf die Liste holen. */
export async function setShoppingItemDone(itemId: string, done: boolean) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("shopping_items")
    .update(
      done
        ? { done_at: new Date().toISOString(), done_by: user.id }
        : { done_at: null, done_by: null },
    )
    .eq("id", itemId);
  if (error) throw error;

  revalidateAll();
}

/** Einen Artikel von der Liste nehmen. */
export async function deleteShoppingItem(itemId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("shopping_items").delete().eq("id", itemId);
  if (error) throw error;
  revalidateAll();
}

/** Nach dem Einkauf aufräumen: alle abgehakten Artikel löschen. */
export async function clearDoneShoppingItems() {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("shopping_items").delete().not("done_at", "is", null);
  if (error) throw error;
  revalidateAll();
}

// ---------------------------------------------------------------------------
// Kommentare an Zuweisungen
// ---------------------------------------------------------------------------

/**
 * Kommentar an eine Zuweisung hängen. Gedacht für Hinweise wie "Wischmopp
 * ist hin" – bewusst kein Bewertungssystem, sondern eine Information.
 */
export async function addAssignmentComment(
  assignmentId: string,
  body: string,
): Promise<{ error: string | null }> {
  const { supabase, user } = await requireUser();

  const text = body.trim();
  if (!text) return { error: "Der Kommentar ist leer." };
  if (text.length > 500) return { error: "Bitte auf 500 Zeichen kürzen." };

  const { error } = await supabase
    .from("assignment_comments")
    .insert({ assignment_id: assignmentId, author_id: user.id, body: text });
  if (error) return { error: error.message };

  const partner = await partnerOf(supabase, user.id);
  if (partner) {
    await sendPushToProfile(partner, {
      title: `Kommentar von ${await displayName(supabase, user.id)}`,
      body: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      url: "/verlauf",
      tag: `comment-${assignmentId}`,
    });
  }

  revalidateAll();
  return { error: null };
}

export async function deleteAssignmentComment(commentId: string) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("assignment_comments")
    .delete()
    .eq("id", commentId)
    .eq("author_id", user.id);
  if (error) throw error;

  revalidateAll();
}

// ---------------------------------------------------------------------------
// Fotos an Zuweisungen
// ---------------------------------------------------------------------------

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Foto zu einer Zuweisung hochladen. */
export async function uploadAssignmentPhoto(
  assignmentId: string,
  formData: FormData,
): Promise<{ error: string | null }> {
  const { supabase, user } = await requireUser();

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Kein Bild ausgewählt." };
  if (file.size > PHOTO_MAX_BYTES) return { error: "Das Bild ist größer als 5 MB." };
  if (!PHOTO_TYPES.includes(file.type)) return { error: "Nur JPG, PNG oder WebP." };

  const endung = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const pfad = `${assignmentId}/${crypto.randomUUID()}.${endung}`;

  const { error: uploadError } = await supabase.storage
    .from("task-photos")
    .upload(pfad, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("assignment_photos")
    .insert({ assignment_id: assignmentId, uploaded_by: user.id, storage_path: pfad });
  if (error) {
    // Verwaiste Datei nicht liegen lassen.
    await supabase.storage.from("task-photos").remove([pfad]);
    return { error: error.message };
  }

  revalidateAll();
  return { error: null };
}

export async function deleteAssignmentPhoto(photoId: string) {
  const { supabase } = await requireUser();

  const { data: photo, error } = await supabase
    .from("assignment_photos")
    .select("storage_path")
    .eq("id", photoId)
    .single();
  if (error) throw error;

  await supabase.storage.from("task-photos").remove([photo.storage_path]);

  const { error: deleteError } = await supabase
    .from("assignment_photos")
    .delete()
    .eq("id", photoId);
  if (deleteError) throw deleteError;

  revalidateAll();
}

// ---------------------------------------------------------------------------
// Kalender-Abo
// ---------------------------------------------------------------------------

/**
 * Neues Kalender-Token erzeugen. Die bisherige Abo-Adresse wird damit
 * sofort ungültig – gedacht für den Fall, dass sie irgendwo gelandet ist,
 * wo sie nicht hingehört.
 */
export async function regenerateCalendarToken(): Promise<{ token: string | null }> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("profiles")
    .update({ calendar_token: crypto.randomUUID() })
    .eq("id", user.id)
    .select("calendar_token")
    .single();
  if (error) throw error;

  revalidatePath("/profil");
  return { token: data?.calendar_token ?? null };
}
