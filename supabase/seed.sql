-- =====================================================================
-- Startdaten: Beispiel-Aufgabenliste
-- Nach schema.sql im SQL Editor ausführen. Gerne anpassen – Namen,
-- Turnus und Aufwand sind bewusst als leicht editierbare Liste gebaut.
-- Mehrfaches Ausführen legt keine Duplikate an (Abgleich über den Namen).
-- =====================================================================

with vorlage (name, recurrence, interval_days, effort_minutes, notes, checklist) as (
  values
    ('Küche putzen',        'interval'::recurrence_type,   3,  30, 'Nach dem Abendessen',        array['Herd', 'Spüle', 'Arbeitsflächen', 'Boden']),
    ('Bad putzen',          'interval'::recurrence_type,   7,  45, null,                          array['Dusche', 'WC', 'Waschbecken', 'Spiegel', 'Boden']),
    ('Staubsaugen',         'interval'::recurrence_type,   7,  25, 'Alle Räume inkl. Flur',      array['Wohnzimmer', 'Schlafzimmer', 'Flur']),
    ('Wischen',             'interval'::recurrence_type,  14,  30, null,                          array[]::text[]),
    ('Müll rausbringen',    'interval'::recurrence_type,   3,   5, null,                          array[]::text[]),
    ('Spülmaschine ausräumen','interval'::recurrence_type, 1,   5, null,                          array[]::text[]),
    ('Einkaufen',           'interval'::recurrence_type,   7,  60, null,                          array['Liste durchgehen', 'Einräumen']),
    ('Bettwäsche wechseln', 'interval'::recurrence_type,  21,  20, null,                          array[]::text[]),
    ('Staub wischen',       'interval'::recurrence_type,  14,  20, null,                          array[]::text[]),
    ('Wäsche waschen',      'on_demand'::recurrence_type, null, 40, 'Wenn der Wäschekorb voll ist', array['Waschen', 'Aufhängen/Trockner', 'Zusammenlegen', 'Wegräumen']),
    ('Pflanzen gießen',     'interval'::recurrence_type,   5,  10, null,                          array[]::text[]),
    ('Kühlschrank ausmisten','interval'::recurrence_type, 14,  15, 'Abgelaufenes raus',          array[]::text[])
),
neu as (
  insert into public.tasks (name, recurrence, interval_days, effort_minutes, notes)
  select v.name, v.recurrence, v.interval_days, v.effort_minutes, v.notes
  from vorlage v
  where not exists (select 1 from public.tasks t where t.name = v.name)
  returning id, name
)
insert into public.checklist_items (task_id, label, position)
select n.id, punkt.label, punkt.position
from neu n
join vorlage v on v.name = n.name
cross join lateral unnest(v.checklist) with ordinality as punkt(label, position);
