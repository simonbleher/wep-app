# Sync über das private OneDrive (Beta)

Die App gleicht die WEPs zwischen Simons Geräten (Handy, Tablet, Windows) über
sein **privates OneDrive** ab. Die App sieht dabei **nur ihren eigenen Ordner**
(`Apps/<App-Name>`), nicht das restliche OneDrive.

## So funktioniert es

- Pro WEP liegt eine Datei `<Vorgangs-Nr>.json` im App-Ordner.
- Jede Änderung wird zuerst lokal gespeichert (IndexedDB, funktioniert offline)
  und als „wartet auf Upload“ markiert.
- Abgeglichen wird beim Öffnen der Startseite, wenn das Gerät wieder online geht,
  und über den Knopf **„🔄 Abgleichen“**.
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
   `https://simonbleher.github.io/wep-app/` (genau mit Schrägstrich am Ende).
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
Startseite erscheint **„☁️ Mit OneDrive verbinden“**. Beim ersten Verbinden
fragt Microsoft, ob die App auf ihren eigenen Ordner in deinem OneDrive
zugreifen darf.

Ohne Client-ID ist der Sync einfach ausgeblendet; die App funktioniert dann wie
bisher nur lokal.

## Datenschutz

- Die WEPs enthalten Namen von Unterpächtern. Sie liegen nur lokal im Browser
  und in **deinem** OneDrive, nicht im Git-Repo und nicht auf fremden Servern.
- Die App hat nur Zugriff auf `Apps/WEP-App`, nicht auf andere OneDrive-Dateien.
- Abmelden: Microsoft-Konto → *Datenschutz → Apps und Dienste* → Zugriff der
  WEP-App entfernen.

## Technik

| Datei | Inhalt |
|-------|--------|
| `src/sync/engine.ts` | Abgleich-Logik (rein, getestet) |
| `src/sync/graph.ts` | Microsoft-Graph-Zugriff auf `/me/drive/special/approot` |
| `src/sync/auth.ts` | Anmeldung mit MSAL.js, Authority `consumers` |
| `src/sync/speicher.ts` | Anbindung an IndexedDB (`src/app/db.ts`, Store `syncMeta`) |
| `src/app/SyncLeiste.tsx` | Knopf und Status auf der Startseite |
