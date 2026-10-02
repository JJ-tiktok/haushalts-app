# Haushalt

Mobile-first PWA für zwei Personen: Wer macht was, wann – fair verteilt nach Aufwand,
mit Checklisten statt gegenseitiger Kontrolle.

Umgesetzt ist die komplette Roadmap: Aufgabenliste mit automatischer Rotation,
Erledigt-Markierung, Login für zwei Personen, Checklisten, Aufwand-Gewichtung, Verlauf,
Tausch-Funktion, Push-Benachrichtigungen und die Dashboard-Ansicht fürs Tablet.

## Stack

- **Next.js 16** (App Router, Server Actions) + **React 19**
- **Tailwind CSS 4**
- **Supabase** – Postgres, Auth und Realtime
- **PWA** – Web App Manifest + Service Worker, installierbar über „Zum Homebildschirm"

## Einrichtung

### 1. Supabase-Projekt anlegen

Auf [supabase.com](https://supabase.com/dashboard) ein kostenloses Projekt erstellen
(das musst du selbst machen – Account und Passwort gehören dir).

### 2. Datenbank aufsetzen

Im Supabase-Dashboard unter **SQL Editor** nacheinander ausführen:

1. [`supabase/schema.sql`](supabase/schema.sql) – Tabellen, Trigger, RLS-Policies, Realtime
2. [`supabase/seed.sql`](supabase/seed.sql) – optionale Beispiel-Aufgabenliste

`seed.sql` ist als leicht editierbare Liste geschrieben: Namen, Turnus, Aufwand und
Checklisten stehen ganz oben als Tabelle. Mehrfaches Ausführen legt keine Duplikate an.

**Update auf eine neue Version:** `schema.sql` ist idempotent und darf jederzeit komplett
erneut ausgeführt werden – neue Spalten, Typen und Funktionen kommen dann einfach dazu.
Für „Auf morgen“, „Diesmal auslassen“ und das automatische Weiterrollen überfälliger
Aufgaben muss die Datei einmal erneut gelaufen sein.

### 3. Zugangsdaten eintragen

```bash
cp .env.local.example .env.local
```

| Variable                        | Pflicht  | Wofür                                                        |
| ------------------------------- | -------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | ja       | Projekt-URL (**ohne** `/rest/v1/`)                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ja       | `anon`/`public`-Key aus **Project Settings → API**           |
| `NEXT_PUBLIC_APP_TIMEZONE`      | nein     | Standard `Europe/Berlin`; bestimmt, wann der Tag umschlägt   |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | für Push | öffentlicher VAPID-Schlüssel                                 |
| `VAPID_PRIVATE_KEY`             | für Push | privater VAPID-Schlüssel                                     |
| `VAPID_SUBJECT`                 | für Push | `mailto:`-Adresse für den Push-Dienst                        |
| `SUPABASE_SERVICE_ROLE_KEY`     | für Push | nur serverseitig; nötig, um an die _andere_ Person zu senden |
| `CRON_SECRET`                   | für Push | schützt `/api/cron/reminders`                                |

Neue VAPID-Schlüssel erzeugt `npx web-push generate-vapid-keys`.

> Der `service_role`-Schlüssel umgeht alle RLS-Policies. Er gehört ausschließlich in
> serverseitige Variablen (kein `NEXT_PUBLIC_`-Präfix) und darf nie ins Repo.

### 4. Starten

```bash
npm install
npm run dev
```

Dann [http://localhost:3000](http://localhost:3000) öffnen. Beide Personen registrieren
sich je einmal selbst über den Tab **Registrieren** – Name und Farbe werden dabei direkt
gesetzt. Die Rotation greift, sobald beide Konten existieren.

> Falls Supabase E-Mail-Bestätigung verlangt: unter **Authentication → Providers → Email**
> die Bestätigung abschalten, oder die beiden Bestätigungsmails einmal anklicken.

## Skripte

| Befehl              | Zweck                                         |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Entwicklungsserver                            |
| `npm run build`     | Produktions-Build (inkl. TypeScript-Prüfung)  |
| `npm start`         | Produktions-Server                            |
| `npm test`          | Tests für Verteilungslogik und Datumsrechnung |
| `npm run typecheck` | Nur TypeScript prüfen                         |
| `npm run format`    | Prettier über das Projekt laufen lassen       |
| `npm run icons`     | PWA-Icons neu erzeugen                        |

## Wie die Verteilung funktioniert

Der Kern steckt in [`src/lib/rotation.ts`](src/lib/rotation.ts) und
[`src/lib/scheduler.ts`](src/lib/scheduler.ts):

- **Last statt Anzahl.** Die „Last" einer Person ist die Summe der Aufwandsminuten aus
  allen offenen Zuweisungen plus allem, was sie in den letzten 28 Tagen erledigt hat.
  Ein 60-Minuten-Job zählt also sechsmal so viel wie ein 10-Minuten-Job.
- **Wer weniger hat, ist dran.** Bei Gleichstand bekommt die Aufgabe die Person, die sie
  nicht zuletzt gemacht hat – so entsteht bei gleich schweren Aufgaben die erwartete
  Abwechslung.
- **Gutgeschrieben wird, wer erledigt.** Hakt Person A eine Aufgabe von Person B ab,
  zählen die Minuten für A.
- **Urlaub.** Im Profil lässt sich „Abwesend bis" setzen. Neu fällige Aufgaben gehen
  dann an die andere Person; im Verlauf bleibt sichtbar, wie sich das ausgewirkt hat.
- **Fällig ohne Cron-Job.** Fehlende Zuweisungen werden erzeugt, sobald jemand die App
  öffnet. Ein partieller Unique-Index (`assignments_one_open_per_task`) stellt sicher,
  dass pro Aufgabe nie zwei offene Zuweisungen entstehen – auch nicht, wenn beide Handys
  gleichzeitig syncen.

`npm test` deckt genau diese Regeln ab.

## Tausch-Funktion

Wer eine Aufgabe zugewiesen bekommen hat, kann sie auf der Karte zum Tausch anbieten.
Die andere Person sieht die Anfrage ganz oben auf **Heute** und kann übernehmen oder
ablehnen; bei Annahme wechselt die Zuweisung, und die Minuten zählen ab dann für die
neue Person. Ein partieller Unique-Index lässt pro Zuweisung nur eine offene Anfrage zu.
Wird die Aufgabe zwischenzeitlich erledigt, schließt sich die Anfrage von selbst.

## Benachrichtigungen

Zwei Anlässe: eine neue Tauschanfrage (sofort) und die Erinnerung an fällige Aufgaben
(einmal täglich, eine Nachricht pro Person statt eine pro Aufgabe).

Aktiviert wird das pro Gerät unter **Profil → Benachrichtigungen**. Der Versand läuft
über die Web-Push-API mit VAPID; `public/sw.js` verarbeitet `push` und
`notificationclick`. Tote Endpunkte (App deinstalliert) räumt der Server automatisch auf.

Die tägliche Erinnerung hängt an `/api/cron/reminders`, geschützt über `CRON_SECRET`.
Auf Vercel übernimmt das der Cron-Eintrag in [`vercel.json`](vercel.json) (06:00 UTC).
Lokal testen:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

Der Endpunkt ist idempotent – pro Zuweisung wird über `reminded_at` höchstens einmal
erinnert.

**Auf dem iPhone** funktioniert Push nur, wenn die App über „Teilen → Zum
Homebildschirm“ installiert und von dort geöffnet wird (iOS 16.4+). Im Safari-Tab fehlt
die API komplett; die App weist im Profil darauf hin.

## Einkaufsliste

`/einkauf`: ein Feld, ein Knopf. Steht eine Menge vorne („2 Liter Milch"), wird sie
automatisch abgetrennt und separat angezeigt. Abgehakte Artikel wandern nach „Im Wagen"
und lassen sich nach dem Einkauf per „Liste aufräumen" in einem Rutsch löschen. Beide
Geräte sehen Änderungen sofort.

## Kommentare und Fotos

An jeder offenen Zuweisung hängt ein kleiner Notizblock: ein Kommentar („Wischmopp ist
hin") und beliebig viele Fotos. Ein Kommentar löst eine Benachrichtigung bei der anderen
Person aus.

Bilder werden im Browser auf 1600 px längste Kante heruntergerechnet, bevor sie hochgeladen
werden – ein Handyfoto hat sonst leicht 8 MB. Sie liegen im **privaten** Storage-Bucket
`task-photos`; die Anzeige läuft über signierte Links mit einer Stunde Gültigkeit.

## Rangliste

Unter `/verlauf`, unterhalb der neutralen Verteilungsübersicht: Punkte (= erledigte
Minuten), Serie in Tagen, Monats- und Gesamtwertung. Die Serie zählt aufeinanderfolgende
Tage mit mindestens einer erledigten Aufgabe und reißt am laufenden Tag noch nicht.

Die Logik steckt in [`src/lib/score.ts`](src/lib/score.ts) und ist getestet.

## Kalender-Abo (ICS)

Unter **Profil → Kalender-Abo** steht eine Adresse der Form
`/api/kalender/<token>.ics`. Einmal in Google Kalender („Weitere Kalender → Per URL"),
Apple Kalender oder Outlook eintragen – danach stehen alle Aufgaben dort, offene am
Fälligkeitstag, erledigte der letzten vier Wochen mit Häkchen am Tag der Erledigung.

Der Feed ist bewusst einbahn (App → Kalender). Das Token in der URL ist der einzige
Schutz, Kalender-Clients können sich nicht anmelden – die Adresse ist deshalb wie ein
Passwort zu behandeln. „Neue Adresse erzeugen" macht die alte sofort ungültig.

Der Turnus wird **nicht** als `RRULE` abgebildet: die App verschiebt Fälligkeiten
dynamisch, eine feste Wiederholungsregel würde im Kalender bald etwas anderes behaupten
als die App.

## Notizen

Eine gemeinsame Pinnwand für kurze Nachrichten – „Milch ist alle", „Handwerker kommt
Donnerstag". Zu finden unter `/notizen`, in Kurzform auch auf der Startseite und auf dem
Wochenplan (dort nur lesend).

Eine neue Notiz löst eine Benachrichtigung bei der anderen Person aus. Notizen lassen
sich anheften (stehen dann immer oben), abhaken (verschwinden aus der aktiven Liste,
bleiben unter „Erledigt" nachlesbar) oder endgültig löschen.

Nicht zu verwechseln mit der **Notiz an einer Aufgabe** – die steht im Aufgabenformular
und beschreibt die Aufgabe selbst dauerhaft.

## Wochenplan fürs Tablet

`/dashboard` zeigt Montag bis Sonntag nebeneinander, jede Aufgabe farbig nach Person,
der heutige Tag hervorgehoben. Unter jeder Spalte steht der Tagesaufwand – daran sieht
man sofort, ob ein Tag überladen ist.

Eine Aufgabe antippen öffnet die Tagesauswahl: damit wandert sie auf einen anderen Tag
derselben Woche. Verschoben wird nur die Fälligkeit, nicht die Zuständigkeit, und der
Turnus rechnet weiterhin ab der tatsächlichen Erledigung – eine Verschiebung verzerrt
ihn also nicht dauerhaft.

Überfälliges steht in einem eigenen Streifen über dem Raster, alles jenseits des
Sonntags unter „Nächste Woche". Abgehakt wird weiterhin am Handy. Die Seite
aktualisiert sich über Realtime und zusätzlich alle fünf Minuten, damit auch der
Tageswechsel ankommt.

## Projektstruktur

```
src/
  app/
    (app)/            Angemeldeter Bereich mit Bottom-Navigation
      page.tsx        „Heute" – überfällig / heute / diese Woche + Wochenverteilung
      aufgaben/       Liste, Anlegen, Bearbeiten inkl. Verlauf pro Aufgabe
      einkauf/        Einkaufsliste
      notizen/        Gemeinsame Pinnwand
      verlauf/        Woche & Monat pro Person, zuletzt Erledigtes
      profil/         Name, Farbe, Abwesenheit, Abmelden
    login/            Anmelden und Registrieren
    dashboard/        Große Übersicht für Tablet/Wand-Display
    api/cron/         Täglicher Erinnerungs-Endpunkt
    api/kalender/     ICS-Feed zum Abonnieren
  components/         UI-Bausteine (Client Components)
  lib/
    rotation.ts       Reine Verteilungslogik (getestet)
    scheduler.ts      Erzeugt fällige Zuweisungen
    actions.ts        Server Actions (Schreiben)
    queries.ts        Server-seitige Lesezugriffe
    score.ts          Punkte und Serien (getestet)
    ics.ts            iCalendar-Generator (getestet)
    push.ts           Push-Versand (Server)
    push-client.ts    An-/Abmelden von Geräten (Browser)
    supabase/         Client für Browser, Server, Proxy und Service-Role
supabase/             schema.sql und seed.sql
scripts/              Icon-Generator
```

## Deployment (Vercel)

1. Repository auf GitHub pushen und in Vercel importieren.
2. Die beiden `NEXT_PUBLIC_SUPABASE_*`-Variablen als Environment Variables eintragen.
3. Deployen. Auf dem Handy die Seite öffnen und über das Browser-Menü
   „Zum Homebildschirm hinzufügen" wählen.

## Mögliche nächste Schritte

- Tauschanfragen mit einer kurzen Begründung versehen (das Feld `message` existiert schon,
  die UI schickt es noch nicht mit).
- Erinnerung am Vorabend statt nur am Fälligkeitstag.
- Turnus nach Wochentag („jeden zweiten Donnerstag") für Dinge wie die Mülltonne.

## Anmerkungen

- `npm install` funktioniert normal. Nur beim _Hinzufügen_ von `vitest` stolpert npm 10.9.2
  über einen Bug in der Peer-Dependency-Auflösung – falls das nötig wird, hilft
  `npm install --legacy-peer-deps`.
- Die RLS-Policies sind bewusst einfach: beide angemeldeten Personen sehen und bearbeiten
  alles. Für einen gemeinsamen Haushalt ist das gewollt; für mehrere Haushalte müsste eine
  `household_id` dazukommen.
