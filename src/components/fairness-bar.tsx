import type { Profile } from "@/lib/database.types";
import { formatMinutes } from "@/lib/date";

/**
 * Verteilte "Last" pro Person – bewusst nüchtern gehalten: eine ehrliche
 * Gesprächsgrundlage, kein Wettkampf. Deshalb kein Sieger, keine Punkte.
 */
export function FairnessBar({
  profiles,
  minutes,
  caption,
}: {
  profiles: Profile[];
  minutes: Record<string, number>;
  caption?: string;
}) {
  const total = profiles.reduce((sum, p) => sum + (minutes[p.id] ?? 0), 0);

  return (
    <section aria-label="Verteilung">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={
          total === 0
            ? "Noch nichts erledigt"
            : profiles
                .map((p) => `${p.display_name}: ${formatMinutes(minutes[p.id] ?? 0)}`)
                .join(", ")
        }
      >
        {total > 0 &&
          profiles.map((p) => {
            const share = ((minutes[p.id] ?? 0) / total) * 100;
            if (share === 0) return null;
            return (
              <span
                key={p.id}
                style={{ width: `${share}%`, backgroundColor: p.color }}
                className="h-full"
              />
            );
          })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {profiles.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
            <span className="font-medium text-ink">{p.display_name}</span>
            <span>{formatMinutes(minutes[p.id] ?? 0)}</span>
            {total > 0 && <span>({Math.round(((minutes[p.id] ?? 0) / total) * 100)} %)</span>}
          </span>
        ))}
      </div>

      {caption && <p className="mt-2 text-xs text-muted">{caption}</p>}
    </section>
  );
}
