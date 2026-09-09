"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { RecurrenceType } from "@/lib/database.types";
import type { TaskView } from "@/lib/queries";
import type { TaskFormState } from "@/lib/actions";

const INTERVAL_PRESETS = [
  { days: 1, label: "täglich" },
  { days: 3, label: "alle 3 Tage" },
  { days: 7, label: "wöchentlich" },
  { days: 14, label: "alle 2 Wochen" },
  { days: 30, label: "monatlich" },
];

const EFFORT_PRESETS = [5, 10, 15, 30, 45, 60];

const feldKlasse =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";

export function TaskForm({
  action,
  task,
}: {
  action: (state: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  task?: TaskView;
}) {
  const [state, formAction] = useActionState(action, { error: null });

  const [recurrence, setRecurrence] = useState<RecurrenceType>(task?.recurrence ?? "interval");
  const [intervalDays, setIntervalDays] = useState(String(task?.interval_days ?? 7));
  const [effort, setEffort] = useState(String(task?.effort_minutes ?? 15));
  const [checklist, setChecklist] = useState<string[]>(task?.checklist.map((c) => c.label) ?? [""]);

  function updateChecklist(index: number, value: string) {
    setChecklist((prev) => prev.map((entry, i) => (i === index ? value : entry)));
  }

  return (
    <form action={formAction} className="space-y-6">
      {task && <input type="hidden" name="id" value={task.id} />}

      <Feld label="Name">
        <input
          name="name"
          defaultValue={task?.name ?? ""}
          required
          autoFocus={!task}
          placeholder="z. B. Küche putzen"
          className={feldKlasse}
        />
      </Feld>

      <Feld label="Turnus">
        <div className="flex gap-2">
          <Umschalter
            active={recurrence === "interval"}
            onClick={() => setRecurrence("interval")}
            label="Fester Turnus"
          />
          <Umschalter
            active={recurrence === "on_demand"}
            onClick={() => setRecurrence("on_demand")}
            label="Bei Bedarf"
          />
        </div>
        <input type="hidden" name="recurrence" value={recurrence} />

        {recurrence === "interval" ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_PRESETS.map((preset) => (
                <Chip
                  key={preset.days}
                  active={intervalDays === String(preset.days)}
                  onClick={() => setIntervalDays(String(preset.days))}
                  label={preset.label}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              alle
              <input
                name="interval_days"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                className={`${feldKlasse} w-20 text-center`}
              />
              Tage
            </label>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Wird nicht automatisch fällig – ihr löst sie selbst aus, z. B. wenn der Wäschekorb voll
            ist.
          </p>
        )}
      </Feld>

      <Feld label="Geschätzter Aufwand" hinweis="Basis für die faire Verteilung.">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {EFFORT_PRESETS.map((minutes) => (
            <Chip
              key={minutes}
              active={effort === String(minutes)}
              onClick={() => setEffort(String(minutes))}
              label={`${minutes} Min`}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            name="effort_minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            className={`${feldKlasse} w-24 text-center`}
          />
          Minuten
        </label>
      </Feld>

      <Feld
        label="Checkliste"
        hinweis="Definition of Done – macht klar, wann die Aufgabe wirklich fertig ist."
      >
        <ul className="space-y-2">
          {checklist.map((entry, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                name="checklist"
                value={entry}
                onChange={(e) => updateChecklist(index, e.target.value)}
                placeholder={index === 0 ? "z. B. Herd" : "Weiterer Schritt"}
                className={feldKlasse}
              />
              <button
                type="button"
                onClick={() => setChecklist((prev) => prev.filter((_, i) => i !== index))}
                aria-label={`Schritt ${index + 1} entfernen`}
                className="shrink-0 rounded-lg px-2 py-2 text-muted"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setChecklist((prev) => [...prev, ""])}
          className="mt-2 text-sm font-medium text-accent"
        >
          + Schritt hinzufügen
        </button>
      </Feld>

      <Feld label="Notiz (optional)">
        <textarea
          name="notes"
          defaultValue={task?.notes ?? ""}
          rows={2}
          placeholder="Alles, was man leicht vergisst"
          className={feldKlasse}
        />
      </Feld>

      {state.error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <Speichern label={task ? "Änderungen speichern" : "Aufgabe anlegen"} />
    </form>
  );
}

function Speichern({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent disabled:opacity-60"
    >
      {pending ? "Speichern …" : label}
    </button>
  );
}

function Feld({
  label,
  hinweis,
  children,
}: {
  label: string;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">{label}</p>
      {children}
      {hinweis && <p className="mt-2 text-xs text-muted">{hinweis}</p>}
    </div>
  );
}

function Umschalter({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? "border-accent bg-accent-soft text-ink" : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
        active ? "border-accent bg-accent-soft text-ink" : "border-border bg-surface text-muted"
      }`}
    >
      {label}
    </button>
  );
}
