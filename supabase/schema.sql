-- =====================================================================
-- Haushalts-App – Datenbankschema (Supabase / Postgres)
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Typen
-- ---------------------------------------------------------------------
do $$ begin
  create type recurrence_type as enum ('interval', 'on_demand');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_status as enum ('open', 'done');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Profile (1:1 zu auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null,
  color        text        not null default '#6366f1',
  -- Abwesenheit: solange gesetzt und in der Zukunft, gehen neu erzeugte
  -- Zuweisungen an die andere Person (Urlaub/Dienstreise).
  away_until   date,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Aufgaben
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  notes          text,
  recurrence     recurrence_type not null default 'interval',
  -- nur bei recurrence = 'interval': Turnus in Tagen ("alle 3 Tage")
  interval_days  int,
  -- Basis für die faire Verteilung
  effort_minutes int not null default 15 check (effort_minutes > 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint tasks_interval_days_valid check (
    (recurrence = 'interval'  and interval_days is not null and interval_days > 0)
    or
    (recurrence = 'on_demand' and interval_days is null)
  )
);

-- Optionale Checkliste = "Definition of Done" pro Aufgabe
create table if not exists public.checklist_items (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid not null references public.tasks (id) on delete cascade,
  label    text not null,
  position int  not null default 0
);
create index if not exists checklist_items_task_idx on public.checklist_items (task_id, position);

-- ---------------------------------------------------------------------
-- Zuweisungen (eine konkrete Ausführung einer Aufgabe)
-- ---------------------------------------------------------------------
create table if not exists public.assignments (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks (id) on delete cascade,
  assignee_id    uuid not null references public.profiles (id) on delete cascade,
  due_date       date not null,
  status         assignment_status not null default 'open',
  -- Aufwand zum Zeitpunkt der Zuweisung (damit spätere Änderungen an der
  -- Aufgabe die Fairness-Historie nicht rückwirkend verzerren)
  effort_minutes int  not null,
  completed_at   timestamptz,
  completed_by   uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

-- Invariante: pro Aufgabe existiert immer höchstens eine offene Zuweisung.
-- Macht die automatische Erzeugung idempotent (kein doppeltes Anlegen,
-- auch wenn beide Handys gleichzeitig die App öffnen).
create unique index if not exists assignments_one_open_per_task
  on public.assignments (task_id) where status = 'open';

create index if not exists assignments_due_idx      on public.assignments (due_date);
create index if not exists assignments_assignee_idx on public.assignments (assignee_id, status);
create index if not exists assignments_task_idx     on public.assignments (task_id, completed_at desc);

-- Abgehakte Checklistenpunkte einer Zuweisung (Zeile vorhanden = erledigt)
create table if not exists public.assignment_checks (
  assignment_id     uuid not null references public.assignments (id) on delete cascade,
  checklist_item_id uuid not null references public.checklist_items (id) on delete cascade,
  checked_at        timestamptz not null default now(),
  primary key (assignment_id, checklist_item_id)
);

-- ---------------------------------------------------------------------
-- Neuer Auth-User -> automatisch ein Profil anlegen
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  insert into public.profiles (id, display_name, color)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'color', ''), '#6366f1')
  )
  on conflict (id) do nothing;
  return new;
end;
$func$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Row Level Security
-- Bewusst einfach: der Haushalt besteht aus zwei Personen, beide sehen und
-- bearbeiten alles. Anonyme Zugriffe sind komplett gesperrt.
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.tasks             enable row level security;
alter table public.checklist_items   enable row level security;
alter table public.assignments       enable row level security;
alter table public.assignment_checks enable row level security;

drop policy if exists "household reads profiles" on public.profiles;
drop policy if exists "own profile is writable"  on public.profiles;
create policy "household reads profiles" on public.profiles
  for select to authenticated using (true);
create policy "own profile is writable" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "household manages tasks" on public.tasks;
create policy "household manages tasks" on public.tasks
  for all to authenticated using (true) with check (true);

drop policy if exists "household manages checklist_items" on public.checklist_items;
create policy "household manages checklist_items" on public.checklist_items
  for all to authenticated using (true) with check (true);

drop policy if exists "household manages assignments" on public.assignments;
create policy "household manages assignments" on public.assignments
  for all to authenticated using (true) with check (true);

drop policy if exists "household manages assignment_checks" on public.assignment_checks;
create policy "household manages assignment_checks" on public.assignment_checks
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- Realtime (sofortiger Sync zwischen beiden Handys)
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.assignments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.assignment_checks;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- v3: Tausch-Funktion und Push-Notifications
-- Dieser Teil ist wie der Rest idempotent – die Datei darf jederzeit
-- erneut komplett ausgeführt werden.
-- =====================================================================

do $$ begin
  create type swap_status as enum ('pending', 'accepted', 'declined', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Tauschanfragen
-- ---------------------------------------------------------------------
create table if not exists public.swap_requests (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  requested_by  uuid not null references public.profiles (id) on delete cascade,
  requested_to  uuid not null references public.profiles (id) on delete cascade,
  status        swap_status not null default 'pending',
  message       text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  constraint swap_requests_two_parties check (requested_by <> requested_to)
);

-- Pro Zuweisung darf nur eine Anfrage offen sein.
create unique index if not exists swap_requests_one_pending_per_assignment
  on public.swap_requests (assignment_id) where status = 'pending';

create index if not exists swap_requests_inbox_idx
  on public.swap_requests (requested_to, status);

-- ---------------------------------------------------------------------
-- Push-Subscriptions (ein Gerät pro Zeile)
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

-- ---------------------------------------------------------------------
-- Merker, damit die Fälligkeits-Erinnerung pro Zuweisung nur einmal geht
-- ---------------------------------------------------------------------
alter table public.assignments
  add column if not exists reminded_at timestamptz;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.swap_requests      enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "household manages swap_requests" on public.swap_requests;
create policy "household manages swap_requests" on public.swap_requests
  for all to authenticated using (true) with check (true);

-- Push-Endpunkte gehören zum Gerät einer Person und bleiben privat.
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.swap_requests;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- Notizen: gemeinsame Pinnwand für kurze Nachrichten
-- ("Milch ist alle", "Handwerker kommt Donnerstag")
-- Ebenfalls idempotent – die Datei darf erneut ausgeführt werden.
-- =====================================================================

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 500),
  -- Angeheftetes steht immer oben, egal wie alt es ist.
  is_pinned  boolean not null default false,
  -- Erledigt statt gelöscht: bleibt nachvollziehbar, verschwindet aber
  -- aus der aktiven Liste.
  done_at    timestamptz,
  done_by    uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists notes_open_idx
  on public.notes (is_pinned desc, created_at desc) where done_at is null;

alter table public.notes enable row level security;

drop policy if exists "household manages notes" on public.notes;
create policy "household manages notes" on public.notes
  for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- Einkaufsliste, Kommentare, Fotos und Kalender-Abo
-- Wie der Rest idempotent – die Datei darf erneut ausgeführt werden.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Einkaufsliste
-- ---------------------------------------------------------------------
create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 120),
  -- Freitext statt Zahl: "2 Liter", "eine Packung", "viel"
  quantity   text,
  added_by   uuid not null references public.profiles (id) on delete cascade,
  done_at    timestamptz,
  done_by    uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists shopping_open_idx
  on public.shopping_items (created_at desc) where done_at is null;

-- ---------------------------------------------------------------------
-- Kommentare an einer Zuweisung
-- ("Fertig, aber der Wischmopp ist hin.")
-- ---------------------------------------------------------------------
create table if not exists public.assignment_comments (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (length(btrim(body)) between 1 and 500),
  created_at    timestamptz not null default now()
);

create index if not exists assignment_comments_idx
  on public.assignment_comments (assignment_id, created_at);

-- ---------------------------------------------------------------------
-- Fotos zu einer Zuweisung
-- Die Datei liegt im Storage-Bucket "task-photos", hier steht nur der Pfad.
-- ---------------------------------------------------------------------
create table if not exists public.assignment_photos (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  uploaded_by   uuid not null references public.profiles (id) on delete cascade,
  storage_path  text not null unique,
  created_at    timestamptz not null default now()
);

create index if not exists assignment_photos_idx
  on public.assignment_photos (assignment_id, created_at);

-- ---------------------------------------------------------------------
-- Kalender-Abo: geheimes Token pro Person für den ICS-Feed
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_calendar_token_idx
  on public.profiles (calendar_token);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.shopping_items      enable row level security;
alter table public.assignment_comments enable row level security;
alter table public.assignment_photos   enable row level security;

drop policy if exists "household manages shopping_items" on public.shopping_items;
create policy "household manages shopping_items" on public.shopping_items
  for all to authenticated using (true) with check (true);

drop policy if exists "household manages assignment_comments" on public.assignment_comments;
create policy "household manages assignment_comments" on public.assignment_comments
  for all to authenticated using (true) with check (true);

drop policy if exists "household manages assignment_photos" on public.assignment_photos;
create policy "household manages assignment_photos" on public.assignment_photos
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- Storage-Bucket für die Fotos (privat, Zugriff nur über signierte Links)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-photos', 'task-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.shopping_items;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.assignment_comments;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Zugriffsregeln für den Foto-Bucket.
-- Ohne diese Policies schlägt der Upload stillschweigend fehl: der Bucket
-- ist privat, und storage.objects hat eigenes RLS.
-- ---------------------------------------------------------------------
drop policy if exists "household reads task photos"   on storage.objects;
drop policy if exists "household writes task photos"  on storage.objects;
drop policy if exists "household deletes task photos" on storage.objects;

create policy "household reads task photos" on storage.objects
  for select to authenticated using (bucket_id = 'task-photos');

create policy "household writes task photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'task-photos');

create policy "household deletes task photos" on storage.objects
  for delete to authenticated using (bucket_id = 'task-photos');

-- =====================================================================
-- Verschieben, Auslassen und automatisches Weiterrollen
-- Wie der Rest idempotent – die Datei darf erneut ausgeführt werden.
-- =====================================================================

-- "Diesmal auslassen": die Runde ist beendet, zählt aber weder als Last
-- noch als Punkte. Der neue Wert wird in dieser Datei bewusst nirgends
-- verwendet – Postgres erlaubt das erst nach dem Commit.
alter type assignment_status add value if not exists 'skipped';

alter table public.assignments
  add column if not exists skipped_at        timestamptz,
  add column if not exists skipped_by        uuid references public.profiles (id),
  -- Ursprünglich geplanter Tag. Wird beim ersten Verschieben bzw.
  -- Weiterrollen gesetzt – Grundlage für "seit 3 Tagen offen".
  add column if not exists original_due_date date;

-- ---------------------------------------------------------------------
-- Was nicht erledigt wurde, rutscht auf heute statt ewig überfällig zu
-- stehen. Ein einziges UPDATE – laufen beide Handys gleichzeitig, passiert
-- nichts Doppeltes. reminded_at wird zurückgesetzt, damit die
-- Morgen-Erinnerung die Aufgabe erneut aufführt.
-- ---------------------------------------------------------------------
create or replace function public.roll_over_overdue(p_today date)
returns int
language sql
security invoker
set search_path = public
as $func$
  with moved as (
    update public.assignments
       set original_due_date = coalesce(original_due_date, due_date),
           due_date          = p_today,
           reminded_at       = null
     where status = 'open'
       and due_date < p_today
    returning 1
  )
  select count(*)::int from moved;
$func$;

grant execute on function public.roll_over_overdue(date) to authenticated, service_role;
