# Sync über das private OneDrive (Beta)

Die App gleicht die WEPs zwischen Simons Geräten (Handy, Tablet, Windows) über
sein **privates OneDrive** ab. Die App sieht dabei **nur ihren eigenen Ordner**
(`Apps/<App-Name>`), nicht das restliche OneDrive.

## So funktioniert es

- Pro WEP liegt eine Datei `<Vorgangs-Nr>.json` im Ordner `daten/` des App-Ordners.
- Jede Änderung wird zuerst lokal gespeichert (IndexedDB, funktioniert offline)
  und als „wartet auf Upload“ markiert.
- Abgeglichen wird beim Öffnen der Startseite, wenn das Gerät wieder online geht,
  und über den Textknopf **„Abgleichen“** in der Statuszeile der Startseite.
- **Konflikt** (dasselbe WEP auf zwei Geräten geändert): Die neuere Änderung
  gewinnt. Die ältere Fassung bleibt als
  `<Vorgangs-Nr>.konflikt-<Zeit>.json` im OneDrive-Ordner erhalten, und die App
  zeigt einen Hinweis. Es geht also nichts verloren.
- **Löschen** wird in der Beta nicht abgeglichen: Ein auf einem Gerät gelöschtes
  WEP bleibt in OneDrive und auf den anderen Geräten, wird aber auf dem
  löschenden Gerät nicht wieder geladen.
- Neue WEPs bekommen die nächste freie Nummer **auf dem jeweiligen Gerät**.
  Legst du auf zwei Geräten offline gleichzeitig ein neues WEP an, können beide
  dieselbe Nummer bekommen – dann greift die Konflikt-Regel und die ältere
  Fassung liegt als Konflikt-Kopie in OneDrive. Am besten neue WEPs auf einem
  Gerät anlegen, solange das noch nicht gelöst ist.

## Ordnerstruktur im OneDrive

```
Apps/WEP-App/
  daten/          WEP-Dateien (<Vorgangs-Nr>.json), Konflikt-Kopien, profil.json
  Exporte/        fertige Excel-Dateien (<Vorgangs-Nr>_WEP.xlsx)
  LIESMICH.txt    „Ordner der WEP-App – bitte nichts von Hand ändern; fertige
                  Excel-Dateien liegen in Exporte/.“
```

- **Erster Abgleich:** Die App legt `LIESMICH.txt` an und verschiebt WEP- und
  Konflikt-Dateien, die frühere Versionen direkt in den App-Ordner gelegt haben,
  nach `daten/` (Graph-Verschieben, pro Gerät einmal; `src/sync/ordner.ts`).
  Das ist idempotent und überschreibt nie etwas: Gibt es die Datei in `daten/`
  schon, bleibt die alte im App-Ordner unberührt liegen. Fremde Dateien bleiben
  ebenfalls, wo sie sind. Schlägt das Einrichten fehl, wird nicht abgeglichen.
- **Excel-Export:** Beim Export wird die Datei wie bisher heruntergeladen und
  zusätzlich nach `Exporte/` hochgeladen, wenn die App angemeldet und online ist.
  Sonst wartet sie in einer Warteschlange auf dem Gerät (IndexedDB-Store
  `exporte`) und geht beim nächsten Abgleich hoch. Ein neuer Export mit demselben
  Namen ersetzt die ältere Fassung. Ohne Konto passiert nichts. (Einfacher
  Graph-Upload, geeignet bis ca. 4 MB je Datei.)
- **Profil:** `daten/profil.json` (`wep-profil/1`) enthält Name, Rolle und
  Standard-Kleingartenanlage. Es gibt kein Konflikt-Verfahren, die neuere Änderung
  gewinnt. Geräte-Einstellungen („Upload nur über WLAN“) bleiben lokal und stehen
  nie in dieser Datei.

## Anmeldung, „ohne Konto“ und Profil in der App

- Beim ersten Start und nach dem Abmelden erscheint ein Login-Bildschirm mit dem
  Knopf „Mit Microsoft anmelden“ und dem kleinen Textlink „Ohne Konto fortfahren
  (nur auf diesem Gerät)“. Die Wahl wird auf dem Gerät gemerkt; danach startet die
  App direkt, auch offline. Ist keine Client-ID eingetragen, gibt es keinen
  Login-Bildschirm und die App läuft wie „ohne Konto“.
- Wer ohne Konto startet, kann sich später im **Profil** (Symbol oben auf der
  Startseite) anmelden. Der erste Abgleich lädt dann alle lokalen WEPs hoch.
- **Abmelden** (im Profil) vergisst nur den Abgleich-Stand (damit ein anderes Konto
  sauber bei null beginnt) – WEPs und Profil bleiben auf dem Gerät.
- Im Profil: Name (wird „Wertermittler Außenanlagen & Aufwuchs“ in neuen WEPs),
  Rolle (Grün / Bau / beides, vorerst nur gespeichert), Standard-Kleingartenanlage
  (Vorbelegung neuer WEPs), „Upload nur über WLAN“ (nur dieses Gerät, Standard an;
  wirkt erst in der Android-App), Konto, App-Version, Speicherort.

## Einmalig: App bei Microsoft registrieren

Damit die App auf OneDrive zugreifen darf, braucht sie eine **Client-ID**. Die
bekommst du kostenlos über eine App-Registrierung mit deinem privaten
Microsoft-Konto (dem, mit dem du auch OneDrive nutzt).

1. Öffne <https://entra.microsoft.com> und melde dich mit deinem **privaten
   Microsoft-Konto** an.
   - Falls dort steht, dass du kein Verzeichnis/keinen Mandanten hast: Lege über
     <https://azure.microsoft.com/free> ein kostenloses Azure-Konto an. Dabei
     entsteht automatisch ein eigenes Verzeichnis („Standardverzeichnis“).
     Für die App-Registrierung entstehen keine Kosten.
2. Links: **Identität → Anwendungen → App-Registrierungen** (englisch:
   *Identity → Applications → App registrations*) → **Neue Registrierung**.
3. Ausfüllen:
   - **Name:** `WEP-App` (unter diesem Namen erscheint später der Ordner
     `Apps/WEP-App` in deinem OneDrive)
   - **Unterstützte Kontotypen:** **Nur persönliche Microsoft-Konten**
     (*Personal Microsoft accounts only*)
   - **Umleitungs-URI:** Plattform **Single-Page-Webanwendung (SPA)**,
     Adresse `http://localhost:5173/`
   - **Registrieren** klicken.
4. Auf der Übersichtsseite die **Anwendungs-ID (Client)** kopieren – das ist die
   Client-ID (Form `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). Sie ist kein Geheimnis.
5. **Authentifizierung** → bei *Single-Page-Webanwendung* weitere Umleitungs-URIs
   hinzufügen, sobald die App veröffentlicht ist, z. B.
   `https://wep-pankow.pages.dev/` (genau mit Schrägstrich am Ende, siehe docs/HOSTING.md).
   Für einen Test im Heimnetz vom Handy aus zusätzlich die Adresse, unter der
   `npm run dev -- --host` erreichbar ist (Microsoft erlaubt `http` nur für
   `localhost`; fürs Handy daher besser die veröffentlichte `https`-Adresse).
6. **API-Berechtigungen** → **Berechtigung hinzufügen** → **Microsoft Graph** →
   **Delegierte Berechtigungen** → `Files.ReadWrite.AppFolder` auswählen →
   hinzufügen. (`User.Read` darf stehen bleiben.) Eine Administratorzustimmung
   ist bei privaten Konten nicht nötig – du stimmst beim ersten Verbinden selbst zu.
7. **Kein** geheimer Clientschlüssel und **kein** Zertifikat anlegen – eine
   Browser-App braucht das nicht (Anmeldung per Authorization Code + PKCE).

## Client-ID in der App eintragen

Im Projektordner die Datei `.env.example` nach `.env.local` kopieren und die ID
eintragen:

```bash
cp .env.example .env.local
# dann in .env.local:
VITE_MS_CLIENT_ID=deine-client-id
```

`.env.local` wird nicht eingecheckt. Danach `npm run dev` neu starten. Auf der
erste Start zeigt den Login-Bildschirm. Beim ersten Anmelden
fragt Microsoft, ob die App auf ihren eigenen Ordner in deinem OneDrive
zugreifen darf.

Ohne Client-ID ist der Sync einfach ausgeblendet; die App funktioniert dann wie
bisher nur lokal.

Für den Durchlauf im Browser (`npm run e2e`) wird mit einer Platzhalter-Client-ID
gebaut, damit der Login-Bildschirm erscheint; angemeldet wird dabei nie.

## Datenschutz

- Die WEPs enthalten Namen von Unterpächtern. Sie liegen nur lokal im Browser
  und in **deinem** OneDrive, nicht im Git-Repo und nicht auf fremden Servern.
- Die App hat nur Zugriff auf `Apps/WEP-App`, nicht auf andere OneDrive-Dateien.
- Abmelden: Microsoft-Konto → *Datenschutz → Apps und Dienste* → Zugriff der
  WEP-App entfernen.

## Technik

| Datei | Inhalt |
|-------|--------|
| `src/konto/index.ts` | Schnittstelle: `anmelden`, `abmelden`, `aktuellesKonto`, `zugriffstoken`, `istAngemeldet` (Umsetzung austauschbar über `setzeKontoDienst`) |
| `src/konto/web.ts` | Web-Umsetzung mit MSAL.js, Authority `consumers` |
| `src/konto/android.ts` | Android-Umsetzung: System-Browser + PKCE, Token nativ (docs/ANDROID.md) |
| `src/konto/startwahl.ts` | Gemerkte Wahl „mit Konto / ohne Konto“ und Start-Entscheidung |
| `src/sync/engine.ts` | Abgleich-Logik für die WEPs (rein, getestet) |
| `src/sync/graph.ts` | Microsoft-Graph-Zugriff auf einen Ordner im App-Ordner (`/me/drive/special/approot`) |
| `src/sync/ordner.ts` | Ordnerstruktur, `LIESMICH.txt`, Verschieben alter Dateien |
| `src/sync/profil.ts` | Abgleich von `daten/profil.json` |
| `src/sync/exporte.ts` | Upload der Excel-Exporte und Warteschlange |
| `src/sync/speicher.ts` | Anbindung an IndexedDB (`src/app/db.ts`, Stores `syncMeta`, `exporte`) |
| `src/profil/index.ts` | Profil und Geräte-Einstellungen (localStorage), Vorbelegung neuer WEPs |
| `src/app/SyncLeiste.tsx` | Statuszeile und Abgleich auf der Startseite |

`src/sync` kennt nur die Schnittstelle aus `src/konto`. Die Android-Umsetzung
(System-Browser + PKCE mit App-Rücksprung, Schritt 3 in `docs/PLAN-BETA2.md`) ist die
zweite `KontoDienst`-Umsetzung; Hintergrund-Upload und Test-APK: `docs/ANDROID.md`.
