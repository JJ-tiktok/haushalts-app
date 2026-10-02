/**
 * Handgepflegte Typen passend zu supabase/schema.sql.
 * Alternativ generierbar mit:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */

export type RecurrenceType = "interval" | "on_demand";
export type AssignmentStatus = "open" | "done" | "skipped";
export type SwapStatus = "pending" | "accepted" | "declined" | "cancelled";

export type Profile = {
  id: string;
  display_name: string;
  color: string;
  away_until: string | null;
  /** Geheimes Token für das Kalender-Abo (ICS). */
  calendar_token: string;
  created_at: string;
};

export type Task = {
  id: string;
  name: string;
  notes: string | null;
  recurrence: RecurrenceType;
  interval_days: number | null;
  effort_minutes: number;
  is_active: boolean;
  created_at: string;
};

export type ChecklistItem = {
  id: string;
  task_id: string;
  label: string;
  position: number;
};

export type Assignment = {
  id: string;
  task_id: string;
  assignee_id: string;
  due_date: string;
  status: AssignmentStatus;
  effort_minutes: number;
  completed_at: string | null;
  completed_by: string | null;
  reminded_at: string | null;
  /** Gesetzt, wenn die Runde ausgelassen wurde ("diesmal nicht"). */
  skipped_at: string | null;
  skipped_by: string | null;
  /** Ursprünglich geplanter Tag – gesetzt beim ersten Verschieben/Weiterrollen. */
  original_due_date: string | null;
  created_at: string;
};

export type SwapRequest = {
  id: string;
  assignment_id: string;
  requested_by: string;
  requested_to: string;
  status: SwapStatus;
  message: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: string | null;
  added_by: string;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};

export type AssignmentComment = {
  id: string;
  assignment_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type AssignmentPhoto = {
  id: string;
  assignment_id: string;
  uploaded_by: string;
  storage_path: string;
  created_at: string;
};

export type Note = {
  id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
};

export type AssignmentCheck = {
  assignment_id: string;
  checklist_item_id: string;
  checked_at: string;
};

/** Alles außer den Pflichtfeldern ist beim Schreiben optional. */
type Writable<Row, Required extends keyof Row> = Partial<Row> & Pick<Row, Required>;

type Fk<Name extends string, Column extends string, Relation extends string> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Relation;
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Writable<Profile, "id" | "display_name">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Writable<Task, "name">;
        Update: Partial<Task>;
        Relationships: [];
      };
      checklist_items: {
        Row: ChecklistItem;
        Insert: Writable<ChecklistItem, "task_id" | "label">;
        Update: Partial<ChecklistItem>;
        Relationships: [Fk<"checklist_items_task_id_fkey", "task_id", "tasks">];
      };
      assignments: {
        Row: Assignment;
        Insert: Writable<Assignment, "task_id" | "assignee_id" | "due_date" | "effort_minutes">;
        Update: Partial<Assignment>;
        Relationships: [
          Fk<"assignments_task_id_fkey", "task_id", "tasks">,
          Fk<"assignments_assignee_id_fkey", "assignee_id", "profiles">,
          Fk<"assignments_completed_by_fkey", "completed_by", "profiles">,
          Fk<"assignments_skipped_by_fkey", "skipped_by", "profiles">,
        ];
      };
      swap_requests: {
        Row: SwapRequest;
        Insert: Writable<SwapRequest, "assignment_id" | "requested_by" | "requested_to">;
        Update: Partial<SwapRequest>;
        Relationships: [
          Fk<"swap_requests_assignment_id_fkey", "assignment_id", "assignments">,
          Fk<"swap_requests_requested_by_fkey", "requested_by", "profiles">,
          Fk<"swap_requests_requested_to_fkey", "requested_to", "profiles">,
        ];
      };
      shopping_items: {
        Row: ShoppingItem;
        Insert: Writable<ShoppingItem, "name" | "added_by">;
        Update: Partial<ShoppingItem>;
        Relationships: [
          Fk<"shopping_items_added_by_fkey", "added_by", "profiles">,
          Fk<"shopping_items_done_by_fkey", "done_by", "profiles">,
        ];
      };
      assignment_comments: {
        Row: AssignmentComment;
        Insert: Writable<AssignmentComment, "assignment_id" | "author_id" | "body">;
        Update: Partial<AssignmentComment>;
        Relationships: [
          Fk<"assignment_comments_assignment_id_fkey", "assignment_id", "assignments">,
          Fk<"assignment_comments_author_id_fkey", "author_id", "profiles">,
        ];
      };
      assignment_photos: {
        Row: AssignmentPhoto;
        Insert: Writable<AssignmentPhoto, "assignment_id" | "uploaded_by" | "storage_path">;
        Update: Partial<AssignmentPhoto>;
        Relationships: [
          Fk<"assignment_photos_assignment_id_fkey", "assignment_id", "assignments">,
          Fk<"assignment_photos_uploaded_by_fkey", "uploaded_by", "profiles">,
        ];
      };
      notes: {
        Row: Note;
        Insert: Writable<Note, "author_id" | "body">;
        Update: Partial<Note>;
        Relationships: [
          Fk<"notes_author_id_fkey", "author_id", "profiles">,
          Fk<"notes_done_by_fkey", "done_by", "profiles">,
        ];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Writable<PushSubscriptionRow, "profile_id" | "endpoint" | "p256dh" | "auth">;
        Update: Partial<PushSubscriptionRow>;
        Relationships: [Fk<"push_subscriptions_profile_id_fkey", "profile_id", "profiles">];
      };
      assignment_checks: {
        Row: AssignmentCheck;
        Insert: Writable<AssignmentCheck, "assignment_id" | "checklist_item_id">;
        Update: Partial<AssignmentCheck>;
        Relationships: [
          Fk<"assignment_checks_assignment_id_fkey", "assignment_id", "assignments">,
          Fk<"assignment_checks_checklist_item_id_fkey", "checklist_item_id", "checklist_items">,
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      roll_over_overdue: {
        Args: { p_today: string };
        Returns: number;
      };
    };
    Enums: {
      recurrence_type: RecurrenceType;
      assignment_status: AssignmentStatus;
      swap_status: SwapStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
