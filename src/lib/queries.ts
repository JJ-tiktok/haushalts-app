import "server-only";

import type {
  Assignment,
  AssignmentComment,
  AssignmentPhoto,
  ChecklistItem,
  Note,
  Profile,
  ShoppingItem,
  SwapRequest,
  Task,
} from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { addDays, startOfDayIso, today } from "@/lib/date";

export type AssignmentView = Assignment & {
  task: Task;
  checklist: ChecklistItem[];
  checkedItemIds: string[];
  /** Offene Tauschanfrage zu dieser Zuweisung, falls vorhanden. */
  pendingSwap: SwapRequest | null;
  comments: AssignmentComment[];
  photos: PhotoView[];
};

export type TaskView = Task & {
  checklist: ChecklistItem[];
  openAssignment: Assignment | null;
  lastDoneAt: string | null;
  lastDoneBy: string | null;
};

/** Alle Profile des Haushalts, in stabiler Reihenfolge. */
export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Das Profil der angemeldeten Person. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) return null;
  return data;
}

/** Offene Zuweisungen inkl. Aufgabe, Checkliste und Abhak-Status. */
export async function getOpenAssignments(): Promise<AssignmentView[]> {
  const supabase = await createClient();

  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("*, task:tasks(*)")
    .eq("status", "open")
    .order("due_date");
  if (error) throw error;

  const rows = (assignments ?? []) as unknown as (Assignment & { task: Task })[];
  if (rows.length === 0) return [];

  const [checklistRes, checksRes, swapsRes] = await Promise.all([
    supabase
      .from("checklist_items")
      .select("*")
      .in("task_id", [...new Set(rows.map((r) => r.task_id))])
      .order("position"),
    supabase
      .from("assignment_checks")
      .select("*")
      .in(
        "assignment_id",
        rows.map((r) => r.id),
      ),
    supabase
      .from("swap_requests")
      .select("*")
      .eq("status", "pending")
      .in(
        "assignment_id",
        rows.map((r) => r.id),
      ),
  ]);
  if (checklistRes.error) throw checklistRes.error;
  if (checksRes.error) throw checksRes.error;
  if (swapsRes.error) throw swapsRes.error;

  const swapByAssignment = new Map<string, SwapRequest>();
  for (const swap of swapsRes.data ?? []) swapByAssignment.set(swap.assignment_id, swap);

  const ids = rows.map((r) => r.id);
  const [comments, photos] = await Promise.all([
    getAssignmentComments(ids),
    getAssignmentPhotos(ids),
  ]);

  const commentsByAssignment = new Map<string, AssignmentComment[]>();
  for (const comment of comments) {
    const list = commentsByAssignment.get(comment.assignment_id) ?? [];
    list.push(comment);
    commentsByAssignment.set(comment.assignment_id, list);
  }

  const photosByAssignment = new Map<string, PhotoView[]>();
  for (const photo of photos) {
    const list = photosByAssignment.get(photo.assignment_id) ?? [];
    list.push(photo);
    photosByAssignment.set(photo.assignment_id, list);
  }

  const checklistByTask = new Map<string, ChecklistItem[]>();
  for (const item of checklistRes.data ?? []) {
    const list = checklistByTask.get(item.task_id) ?? [];
    list.push(item);
    checklistByTask.set(item.task_id, list);
  }

  const checkedByAssignment = new Map<string, string[]>();
  for (const check of checksRes.data ?? []) {
    const list = checkedByAssignment.get(check.assignment_id) ?? [];
    list.push(check.checklist_item_id);
    checkedByAssignment.set(check.assignment_id, list);
  }

  return rows.map((row) => ({
    ...row,
    checklist: checklistByTask.get(row.task_id) ?? [],
    checkedItemIds: checkedByAssignment.get(row.id) ?? [],
    pendingSwap: swapByAssignment.get(row.id) ?? null,
    comments: commentsByAssignment.get(row.id) ?? [],
    photos: photosByAssignment.get(row.id) ?? [],
  }));
}

/** Alle Aufgaben mit Checkliste, offener Zuweisung und letzter Erledigung. */
export async function getTasks(includeInactive = false): Promise<TaskView[]> {
  const supabase = await createClient();

  let query = supabase.from("tasks").select("*").order("name");
  if (!includeInactive) query = query.eq("is_active", true);

  const [tasksRes, checklistRes, assignmentsRes] = await Promise.all([
    query,
    supabase.from("checklist_items").select("*").order("position"),
    supabase
      .from("assignments")
      .select("*")
      .order("completed_at", { ascending: false, nullsFirst: true }),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (checklistRes.error) throw checklistRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;

  const checklistByTask = new Map<string, ChecklistItem[]>();
  for (const item of checklistRes.data ?? []) {
    const list = checklistByTask.get(item.task_id) ?? [];
    list.push(item);
    checklistByTask.set(item.task_id, list);
  }

  const openByTask = new Map<string, Assignment>();
  const lastDoneByTask = new Map<string, Assignment>();
  for (const a of assignmentsRes.data ?? []) {
    if (a.status === "open") {
      openByTask.set(a.task_id, a);
    } else if (a.completed_at && !lastDoneByTask.has(a.task_id)) {
      lastDoneByTask.set(a.task_id, a);
    }
  }

  return (tasksRes.data ?? []).map((task) => {
    const last = lastDoneByTask.get(task.id);
    return {
      ...task,
      checklist: checklistByTask.get(task.id) ?? [],
      openAssignment: openByTask.get(task.id) ?? null,
      lastDoneAt: last?.completed_at ?? null,
      lastDoneBy: last ? (last.completed_by ?? last.assignee_id) : null,
    };
  });
}

export type HistoryEntry = Assignment & { task: Task };

/** Zuletzt erledigte Aufgaben (Verlauf). */
export async function getHistory(limit = 60): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .select("*, task:tasks(*)")
    .eq("status", "done")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as HistoryEntry[];
}

/** Erledigte Zuweisungen seit einem Stichtag – Basis der Fairness-Übersicht. */
export async function getCompletedSince(day: string): Promise<Assignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("status", "done")
    .gte("completed_at", startOfDayIso(day))
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Offene und in den letzten 28 Tagen erledigte Zuweisungen (für die Last). */
export async function getLoadRelevantAssignments(): Promise<Assignment[]> {
  const supabase = await createClient();
  const windowStart = addDays(today(), -28);
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .or(`status.eq.open,completed_at.gte.${startOfDayIso(windowStart)}`);
  if (error) throw error;
  return data ?? [];
}

/** Eine einzelne Aufgabe inkl. Checkliste und Status. */
export async function getTask(taskId: string): Promise<TaskView | null> {
  const tasks = await getTasks(true);
  return tasks.find((t) => t.id === taskId) ?? null;
}

/** Verlauf einer einzelnen Aufgabe: wer hat sie wann gemacht? */
export async function getTaskHistory(taskId: string, limit = 20): Promise<Assignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("task_id", taskId)
    .eq("status", "done")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Anzahl der Geräte, auf denen die angemeldete Person Push aktiviert hat. */
export async function getMyPushDeviceCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Notizen der Pinnwand. Angeheftetes zuerst, danach das Neueste.
 * Erledigtes kommt nur auf Anfrage mit.
 */
export async function getNotes(options?: {
  includeDone?: boolean;
  limit?: number;
}): Promise<Note[]> {
  const supabase = await createClient();

  let query = supabase
    .from("notes")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (!options?.includeDone) query = query.is("done_at", null);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Nur die erledigten Notizen, für den ausklappbaren Bereich. */
export async function getDoneNotes(limit = 30): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .not("done_at", "is", null)
    .order("done_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Einkaufsliste
// ---------------------------------------------------------------------------

/** Offene Einkaufsartikel, neueste zuerst. */
export async function getShoppingItems(): Promise<ShoppingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_items")
    .select("*")
    .is("done_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Zuletzt abgehakte Artikel – Basis für "nochmal draufsetzen". */
export async function getDoneShoppingItems(limit = 25): Promise<ShoppingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_items")
    .select("*")
    .not("done_at", "is", null)
    .order("done_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Kommentare und Fotos an Zuweisungen
// ---------------------------------------------------------------------------

export async function getAssignmentComments(assignmentIds: string[]): Promise<AssignmentComment[]> {
  if (assignmentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignment_comments")
    .select("*")
    .in("assignment_id", assignmentIds)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export type PhotoView = AssignmentPhoto & { url: string };

/**
 * Fotos inkl. signierter Links. Der Bucket ist privat – die Links laufen
 * nach einer Stunde ab und werden bei jedem Laden neu erzeugt.
 */
export async function getAssignmentPhotos(assignmentIds: string[]): Promise<PhotoView[]> {
  if (assignmentIds.length === 0) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assignment_photos")
    .select("*")
    .in("assignment_id", assignmentIds)
    .order("created_at");
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: signed } = await supabase.storage.from("task-photos").createSignedUrls(
    data.map((photo) => photo.storage_path),
    60 * 60,
  );

  const urlByPath = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl]));

  return data
    .map((photo) => ({ ...photo, url: urlByPath.get(photo.storage_path) ?? "" }))
    .filter((photo) => photo.url !== "");
}

/**
 * Alle erledigten Zuweisungen – Grundlage für Punkte und Serien.
 * Bei zwei Personen bleibt das auch nach Jahren eine überschaubare Menge.
 */
export async function getAllCompleted(limit = 2000): Promise<Assignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("status", "done")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
