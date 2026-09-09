"use client";

import { useRef, useState, useTransition } from "react";
import type { AssignmentComment, Profile } from "@/lib/database.types";
import type { PhotoView } from "@/lib/queries";
import {
  addAssignmentComment,
  deleteAssignmentComment,
  deleteAssignmentPhoto,
  uploadAssignmentPhoto,
} from "@/lib/actions";
import { formatWhen } from "@/lib/date";

/** Längste Kante eines hochgeladenen Bildes. Handyfotos sind sonst riesig. */
const MAX_KANTE = 1600;

/**
 * Kommentare und Fotos zu einer Zuweisung.
 *
 * Gedacht als Notizblock an der Aufgabe – "Wischmopp ist hin", ein Foto vom
 * Ergebnis. Bewusst keine Bewertung: es gibt nichts anzukreuzen, nur zu sagen.
 */
export function AssignmentExtras({
  assignmentId,
  comments,
  photos,
  profiles,
  meId,
}: {
  assignmentId: string;
  comments: AssignmentComment[];
  photos: PhotoView[];
  profiles: Record<string, Pick<Profile, "display_name" | "color">>;
  meId: string | undefined;
}) {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const anzahl = comments.length + photos.length;

  function kommentieren() {
    if (!text.trim()) return;
    startTransition(async () => {
      setFehler(null);
      const result = await addAssignmentComment(assignmentId, text);
      if (result.error) setFehler(result.error);
      else setText("");
    });
  }

  function fotoWaehlen(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      setFehler(null);
      try {
        const verkleinert = await verkleinern(file);
        const formData = new FormData();
        formData.append("photo", verkleinert);
        const result = await uploadAssignmentPhoto(assignmentId, formData);
        if (result.error) setFehler(result.error);
      } catch {
        setFehler("Das Bild konnte nicht verarbeitet werden.");
      } finally {
        if (fileInput.current) fileInput.current.value = "";
      }
    });
  }

  return (
    <div className={pending ? "opacity-60" : ""}>
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="mt-2 w-full py-1 text-xs font-medium text-muted"
      >
        {anzahl > 0
          ? `${comments.length > 0 ? `${comments.length} Kommentar${comments.length === 1 ? "" : "e"}` : ""}${
              comments.length > 0 && photos.length > 0 ? " · " : ""
            }${photos.length > 0 ? `${photos.length} Foto${photos.length === 1 ? "" : "s"}` : ""}`
          : "Kommentar oder Foto"}
      </button>

      {offen && (
        <div className="mt-2 space-y-3 border-t border-border pt-3">
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {photos.map((photo) => (
                <li key={photo.id} className="relative">
                  <a href={photo.url} target="_blank" rel="noreferrer">
                    {/* Signierte Storage-URL, läuft nach einer Stunde ab – daher kein next/image. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt="Foto zur Aufgabe"
                      className="h-20 w-20 rounded-lg border border-border object-cover"
                    />
                  </a>
                  {photo.uploaded_by === meId && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => void (await deleteAssignmentPhoto(photo.id)))
                      }
                      aria-label="Foto löschen"
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-surface text-xs text-muted shadow"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {comments.length > 0 && (
            <ul className="space-y-2">
              {comments.map((comment) => {
                const author = profiles[comment.author_id];
                return (
                  <li key={comment.id} className="text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: author?.color ?? "var(--muted)" }}
                        aria-hidden
                      />
                      <span className="font-medium text-ink">
                        {author?.display_name ?? "Unbekannt"}
                      </span>
                      <span className="text-muted">{formatWhen(comment.created_at)}</span>
                      {comment.author_id === meId && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(
                              async () => void (await deleteAssignmentComment(comment.id)),
                            )
                          }
                          className="text-muted disabled:opacity-50"
                        >
                          löschen
                        </button>
                      )}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap text-ink">{comment.body}</p>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="z. B. Wischmopp ist hin"
              className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !text.trim()}
                onClick={kommentieren}
                className="flex-1 rounded-lg bg-accent py-2 text-xs font-semibold text-on-accent disabled:opacity-50"
              >
                Kommentieren
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => fileInput.current?.click()}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted disabled:opacity-50"
              >
                Foto
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                hidden
                onChange={(e) => fotoWaehlen(e.target.files?.[0])}
              />
            </div>
          </div>

          {fehler && (
            <p role="alert" className="text-xs text-danger">
              {fehler}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bild im Browser auf eine vernünftige Größe bringen, bevor es hochgeladen
 * wird – ein Handyfoto hat sonst leicht 8 MB und sprengt das Limit.
 */
async function verkleinern(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const faktor = Math.min(1, MAX_KANTE / Math.max(bitmap.width, bitmap.height));

  if (faktor === 1 && file.size < 2 * 1024 * 1024) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * faktor);
  canvas.height = Math.round(bitmap.height * faktor);

  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob) return file;

  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
