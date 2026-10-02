"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { rescheduleAssignment } from "@/lib/actions";
import { formatMinutes } from "@/lib/date";
import { tint } from "@/lib/color";

export type WeekItem = {
  id: string;
  name: string;
  dueDate: string;
  minutes: number;
  assigneeName: string;
  color: string;
};

export type WeekDay = {
  date: string;
  /** "Mo" */
  weekday: string;
  /** "09.09." */
  dayLabel: string;
  isToday: boolean;
  /** Vergangene Tage sind kein Ziel zum Verschieben. */
  isPast: boolean;
  isWeekend: boolean;
};

/**
 * Wochenraster fürs Dashboard: sieben Tagesspalten, Aufgaben farbig nach
 * Person. Antippen öffnet die Tagesauswahl – so lässt sich die Woche
 * einteilen, ohne den Turnus anzufassen.
 */
export function WeekBoard({
  days,
  items,
  overdue,
}: {
  days: WeekDay[];
  items: WeekItem[];
  overdue: WeekItem[];
}) {
  const [selected, setSelected] = useState<WeekItem | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function verschieben(item: WeekItem, ziel: string) {
    startTransition(async () => {
      setFehler(null);
      const result = await rescheduleAssignment(item.id, ziel);
      if (result.error) setFehler(result.error);
      else setSelected(null);
    });
  }

  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {overdue.length > 0 && (
        <section className="mb-4 rounded-2xl border border-danger/40 bg-surface p-3">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-danger uppercase">
            Überfällig
          </h2>
          <ul className="flex flex-wrap gap-2">
            {overdue.map((item) => (
              <li key={item.id}>
                <TaskChip item={item} onClick={() => setSelected(item)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Auf schmalen Displays horizontal scrollen statt die Spalten zu quetschen. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[52rem] grid-cols-7 gap-2">
          {days.map((day) => {
            const desTages = items.filter((item) => item.dueDate === day.date);
            const minuten = desTages.reduce((sum, item) => sum + item.minutes, 0);

            return (
              <section
                key={day.date}
                className={`flex min-h-48 flex-col rounded-2xl border ${
                  day.isToday ? "border-accent bg-accent-soft" : "border-border bg-surface"
                }`}
              >
                <header className="flex items-baseline justify-between gap-1 px-3 pt-2.5 pb-2">
                  <span
                    className={`text-sm font-semibold ${
                      day.isToday ? "text-accent" : day.isWeekend ? "text-muted" : "text-ink"
                    }`}
                  >
                    {day.weekday}
                  </span>
                  <span className="text-[11px] text-muted">{day.dayLabel}</span>
                </header>

                <ul className="flex flex-1 flex-col gap-1.5 px-2">
                  {desTages.map((item) => (
                    <li key={item.id}>
                      <TaskChip item={item} block onClick={() => setSelected(item)} />
                    </li>
                  ))}
                </ul>

                <footer className="px-3 pt-2 pb-2.5 text-[11px] text-muted">
                  {minuten > 0 ? formatMinutes(minuten) : "frei"}
                </footer>
              </section>
            );
          })}
        </div>
      </div>

      {selected && (
        <TagAuswahl
          item={selected}
          days={days}
          pending={pending}
          fehler={fehler}
          onClose={() => {
            setFehler(null);
            setSelected(null);
          }}
          onPick={(ziel) => verschieben(selected, ziel)}
        />
      )}
    </div>
  );
}

function TaskChip({
  item,
  onClick,
  block = false,
}: {
  item: WeekItem;
  onClick: () => void;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${item.name} · ${item.assigneeName} · ${formatMinutes(item.minutes)}`}
      className={`${block ? "w-full text-left" : ""} rounded-lg px-2 py-1.5 text-xs leading-snug text-ink`}
      style={{
        backgroundColor: tint(item.color, 0.18),
        boxShadow: `inset 2px 0 0 0 ${item.color}`,
      }}
    >
      <span className="block font-medium">{item.name}</span>
      <span className="mt-0.5 block text-[10px] text-muted">
        {item.assigneeName} · {item.minutes} Min
      </span>
    </button>
  );
}

function TagAuswahl({
  item,
  days,
  pending,
  fehler,
  onClose,
  onPick,
}: {
  item: WeekItem;
  days: WeekDay[];
  pending: boolean;
  fehler: string | null;
  onClose: () => void;
  onPick: (day: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} verschieben`}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 outline-none"
      >
        <h2 className="text-base font-semibold text-ink">{item.name}</h2>
        <p className="mt-0.5 text-xs text-muted">
          {item.assigneeName} · {formatMinutes(item.minutes)} · auf welchen Tag?
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-2">
          {days.map((day) => {
            const aktuell = day.date === item.dueDate;
            return (
              <li key={day.date}>
                <button
                  type="button"
                  disabled={pending || aktuell || day.isPast}
                  onClick={() => onPick(day.date)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm font-medium disabled:opacity-60 ${
                    aktuell ? "border-accent bg-accent-soft text-ink" : "border-border text-ink"
                  }`}
                >
                  {day.weekday}
                  <span className="ml-1.5 text-xs text-muted">{day.dayLabel}</span>
                  {aktuell && <span className="mt-0.5 block text-[10px] text-muted">aktuell</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {fehler && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {fehler}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-surface-2 py-2 text-sm font-medium text-ink"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
