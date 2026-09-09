import Link from "next/link";
import { NoteItem } from "@/components/note-item";
import { getNotes, getProfiles } from "@/lib/queries";

const VORSCHAU = 3;

/**
 * Kompakte Notiz-Vorschau für die Startseite. Zeigt nur die obersten
 * Notizen – der Rest steht unter /notizen.
 */
export async function NotesPreview() {
  const [notes, profiles] = await Promise.all([getNotes({ limit: 10 }), getProfiles()]);

  if (notes.length === 0) {
    return (
      <Link
        href="/notizen"
        className="flex items-center justify-between rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted"
      >
        Notiz hinterlassen
        <span aria-hidden>+</span>
      </Link>
    );
  }

  const byId = new Map(profiles.map((p) => [p.id, p]));
  const sichtbar = notes.slice(0, VORSCHAU);
  const weitere = notes.length - sichtbar.length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">
          Notizen
          <span className="ml-2 font-normal text-muted">{notes.length}</span>
        </h2>
        <Link href="/notizen" className="text-xs font-medium text-accent">
          Alle
        </Link>
      </div>

      <ul className="space-y-3">
        {sichtbar.map((note) => (
          <NoteItem key={note.id} note={note} author={byId.get(note.author_id)} />
        ))}
      </ul>

      {weitere > 0 && (
        <Link href="/notizen" className="block text-xs font-medium text-muted">
          {weitere} weitere {weitere === 1 ? "Notiz" : "Notizen"}
        </Link>
      )}
    </section>
  );
}
