import { NoteComposer } from "@/components/note-composer";
import { NoteItem } from "@/components/note-item";
import { getDoneNotes, getNotes, getProfiles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NotizenPage() {
  const [offen, erledigt, profiles] = await Promise.all([
    getNotes(),
    getDoneNotes(),
    getProfiles(),
  ]);

  const byId = new Map(profiles.map((p) => [p.id, p]));

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Notizen</h1>
        <p className="mt-1 text-sm text-muted">
          Kurze Nachrichten für den Haushalt. Die andere Person bekommt eine Benachrichtigung.
        </p>
      </header>

      <NoteComposer />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">
          Aktuell
          {offen.length > 0 && <span className="ml-2 font-normal text-muted">{offen.length}</span>}
        </h2>

        {offen.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Nichts angeschrieben.
          </p>
        ) : (
          <ul className="space-y-3">
            {offen.map((note) => (
              <NoteItem key={note.id} note={note} author={byId.get(note.author_id)} />
            ))}
          </ul>
        )}
      </section>

      {erledigt.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-ink marker:text-muted">
            Erledigt
            <span className="ml-2 font-normal text-muted">{erledigt.length}</span>
          </summary>
          <ul className="mt-3 space-y-3">
            {erledigt.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                author={byId.get(note.author_id)}
                doneBy={note.done_by ? byId.get(note.done_by) : undefined}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
