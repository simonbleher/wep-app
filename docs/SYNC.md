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
- **Konflikt** (dasselbe WEP auf zwei Geräten geändert): Die neuere Änderung gilt vorerst.
  Die andere Fassung liegt als `<Vorgangs-Nr>.konflikt-<Zeit>.json` in `daten/` **und** am
  WEP selbst. Am WEP erscheint der Hinweis **„Auf zwei Geräten geändert“** (auch als Marke
  „Konflikt“ in der Liste) mit den Knöpfen **„Diese Fassung behalten“** und **„Andere Fassung
  übernehmen“**. Nach der Entscheidung wird die Konflikt-Kopie beim nächsten Abgleich aus
  OneDrive entfernt; „Andere Fassung übernehmen“ speichert die andere Fassung als neue
  Änderung, die dann auf allen Geräten gilt. Bis zur Entscheidung geht nichts verloren.
- **Löschen gilt überall (Papierkorb):** Löschen verschiebt das WEP per Graph-Move von
  `daten/<Nr>.json` nach `daten/papierkorb/<Nr>.json` und trägt den **Löschzeitpunkt**
  (`geloeschtAm`, `geloeschtVon`) in die Datei ein. Andere Geräte legen das WEP beim nächsten
  Abgleich in ihren lokalen Papierkorb. Ohne Konto bleibt der Papierkorb lokal; nach der
  Anmeldung wird er mit hochgeladen. Offline gelöscht heißt: erst der nächste Abgleich meldet
  es OneDrive. Alle Schritte sind idempotent (ein Abbruch zwischen Verschieben und Stempeln
  wird beim nächsten Abgleich geheilt).
- **Papierkorb-Ansicht** (Startseite → „Papierkorb“): **Wiederherstellen** (die Datei kommt
  nach `daten/` zurück, das WEP ist auf allen Geräten wieder da) und **„Endgültig löschen“**
  (mit Rückfrage; entfernt Datei, Papierkorb-Kopie und Konflikt-Kopien in OneDrive und auf
  den anderen Geräten). Nach **30 Tagen** wird automatisch endgültig gelöscht (beim Öffnen der
  App/Liste und bei jedem Abgleich, auch ohne Konto lokal). Ist die alte Nummer beim
  Wiederherstellen inzwischen vergeben, entsteht ein neues WEP mit der nächsten Nummer; das
  Original bleibt im Papierkorb. Neue WEPs bekommen nie eine Nummer, die im Papierkorb liegt.
- **Änderung nach dem Löschzeitpunkt:** Wurde ein WEP auf einem anderen Gerät **nach** dem
  Löschzeitpunkt noch geändert (oder hier gelöscht und dort danach geändert), wird nicht still
  gelöscht: Das WEP bleibt erhalten, zeigt „Gelöscht und danach geändert“ mit **„WEP
  behalten“** / **„Doch löschen“**. Eine Änderung **vor** dem Löschzeitpunkt (spät abgeglichen)
  verhindert das Löschen nicht; im Papierkorb landet dann die jüngste Fassung.
- **Umstieg von der Beta-Regel „Löschen wird nicht abgeglichen“:** Frühere Versionen
  merkten sich nur „hier gelöscht“ (`geloescht`), die Datei blieb in OneDrive. Beim ersten
  Start mit dieser Version bekommt diese Marke einen Löschzeitpunkt (Datenbank-Version 4);
  der nächste Abgleich verschiebt die Datei nach `daten/papierkorb/` und legt das WEP in den
  lokalen Papierkorb (30 Tage ab dem Umstieg). Andere Geräte folgen beim Abgleich. Ältere
  App-Versionen kennen den Papierkorb nicht und würden ein gelöschtes WEP neu hochladen –
  alle Geräte sollten auf diese Version aktualisiert werden.
- Neue WEPs bekommen die nächste freie Nummer **auf dem jeweiligen Gerät**.
  Legst du auf zwei Geräten offline gleichzeitig ein neues WEP an, können beide
  dieselbe Nummer bekommen – dann greift die Konflikt-Regel und die ältere
  Fassung liegt als Konflikt-Kopie in OneDrive. Am besten neue WEPs auf einem
  Gerät anlegen, solange das noch nicht gelöst ist.

## Ordnerstruktur im OneDrive

```
Apps/WEP-App/
  daten/          WEP-Dateien (<Vorgangs-Nr>.json), Konflikt-Kopien, profil.json,
                  eigene-positionen.json
  daten/papierkorb/   gelöschte WEPs (<Vorgangs-Nr>.json mit Löschzeitpunkt, 30 Tage)
  daten/fotos/<Vorgangs-Nr>/            Fotos (<Foto-Id>.jpg) aktiver WEPs
  daten/papierkorb/fotos/<Vorgangs-Nr>/ Fotos gelöschter WEPs (ziehen mit dem WEP um)
  daten/bau/<Vorgangs-Nr>.xlsx          Bau-Excel eines aktiven WEP (eine Datei je WEP)
  daten/papierkorb/bau/<Vorgangs-Nr>.xlsx  Bau-Excel eines gelöschten WEP (zieht mit um)
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
- **Fotos (Beta 3, Paket 4):** Die Angaben zu den Fotos (`Wep.fotos`: Id, Position, Text, Maße) stehen im WEP selbst und
  werden mit ihm abgeglichen (Konflikte wie gehabt). Die Bilddateien (JPEG, ≤ 2000 px, meist 300–500 KB) liegen lokal in IndexedDB
  und in OneDrive unter `daten/fotos/<Nr>/<Foto-Id>.jpg`. Der Foto-Abgleich (`src/sync/fotos.ts`) läuft nach dem WEP-Abgleich und
  richtet sich nach dessen Ergebnis; er arbeitet mit den Listen der Ordner, nicht mit Merkern, und ist idempotent:
  - **Hochladen** nur, wenn das Foto in OneDrive fehlt und die Datei hier liegt, und nur im WLAN, wenn „Upload nur über WLAN“ gilt
    (Android: unbegrenztes Netz; Browser: soweit `navigator.connection.type` es verrät). Sonst bleibt es offen und zählt in
    der Upload-Anzeige („n Änderungen warten“, Fotos-Ansicht). Die WEP-Datei geht unabhängig davon hoch.
  - **Nachladen:** Andere Geräte laden die Fotos eines WEP beim Öffnen nach (nicht alle Fotos aller WEPs); im Mobilfunk bei
    „nur WLAN“ erst nach „Jetzt laden“. Vorschaubilder entstehen lokal.
  - **Papierkorb mit Fotos:** Wird ein WEP gelöscht, verschiebt der Abgleich seine Fotos per Graph-Move nach
    `daten/papierkorb/fotos/<Nr>/` (auch Dateien, die ein Hintergrund-Upload noch nach `daten/fotos/` gelegt hat). Noch nicht
    hochgeladene Fotos eines gelöschten WEP gehen direkt in den Papierkorb-Ordner, **nie** nach `daten/fotos/`. Wiederherstellen
    holt sie zurück (auf jedem Gerät, das zuerst abgleicht). Wurde das WEP anderswo nach dem Löschen geändert (Konflikt) und
    bleibt es deshalb erhalten, liegen seine Fotos wieder in `daten/fotos/`.
  - **Endgültig löschen / 30 Tage:** Beide Fotoordner werden geleert, lokale Dateien entfernt. Die Nummer merkt sich eine
    Liste (`wep-fotos-aufraeumen`, localStorage), damit auch ein Abbruch nach dem WEP-Abgleich nichts liegen lässt; ist das WEP
    inzwischen wieder da, wird nichts gelöscht.
  - **Einzelnes Foto löschen** (mit Rückfrage): Verweis weg, Datei lokal weg, eine Löschmarke bleibt, bis die WEP-Datei ohne das Foto
    in OneDrive ist und kein Konflikt offen ist; erst dann wird die Datei in OneDrive entfernt. Nichts wird aus OneDrive gelöscht,
    nur weil es im WEP nicht mehr steht.
  - **Umnummerieren** (Nummer gehörte einem gelöschten WEP): die lokalen Fotos werden unter die neue Nummer kopiert, das gelöschte
    WEP behält seine Fotos. Wiederherstellen unter neuer Nummer kopiert ebenso. **Duplizieren** kopiert keine Fotos.
  - **Export:** Beim Excel-Export entsteht zusätzlich `Exporte/<Nr>_Fotos/` mit Namen `<Positionsnr> <Bezeichnung>[ n].jpg`
    (`00 Gesamtansicht 1.jpg`); Reste eines früheren Exports im Ordner werden entfernt. Offline wartet es in der Export-Warteschlange
    (Ordner-Marke `<Nr>_Fotos/`). Ohne Konto: ZIP-Download.
- **Bau-Excel (Beta 3, Paket 5):** Der Verweis `Wep.bauExcel` (Name, Größe, `version` = SHA-256-Kennung des Inhalts, `abgeglichen`)
  steht im WEP und folgt dessen Konflikt-/Papierkorb-Regeln; die Datei liegt lokal in IndexedDB (Stores `bauExcel`, `bauExcelDaten`, DB-Version 6)
  und in OneDrive unter `daten/bau/<Nr>.xlsx`. Der Abgleich (`src/sync/bauExcel.ts`) läuft nach Fotos und hat dieselben Regeln:
  - **Hochladen** nur, wenn die lokale Datei die Kennung hat, die das WEP meint (nie eine veraltete Fassung), kein Konflikt offen ist und
    „Upload nur über WLAN“ erlaubt (sonst bleibt sie offen und zählt in der Upload-Anzeige). **Austauschen** überschreibt die Datei in
    OneDrive (immer genau eine je WEP). Der Hintergrunddienst der Android-App kennt die Bau-Excel nicht; sie geht beim Abgleich in der App hoch.
  - **Nachladen:** Andere Geräte laden sie beim Öffnen des WEP und beim Export nach. Ihre Kennung muss zum Verweis passen; liegt in OneDrive noch
    die alte Fassung (anderes Gerät hat noch nicht hochgeladen), wird nichts übernommen („veraltet“), der Export bricht mit Hinweis ab statt still
    die leere Vorlage zu nehmen.
  - **Papierkorb:** Das WEP im Papierkorb nimmt die Datei per Graph-Move nach `daten/papierkorb/bau/` mit, Wiederherstellen holt sie zurück;
    eine noch nicht hochgeladene geht direkt in den Papierkorb-Ordner, nie nach `daten/bau/`. Endgültig löschen / 30 Tage leert beide Ordner
    (Merkliste `wep-bau-aufraeumen`, localStorage). Umnummerieren und Wiederherstellen unter neuer Nummer kopieren die lokale Datei.
  - **Entfernen** (mit Rückfrage): Verweis weg, lokale Datei weg, eine Löschmarke bleibt, bis die WEP-Datei ohne Verweis in OneDrive liegt und kein
    Konflikt offen ist. Bei offenem Zwei-Geräte-Konflikt bleibt die lokale Datei erhalten, solange eine der beiden Fassungen auf sie verweist;
    nichts wird in OneDrive gelöscht, was nur „nicht mehr im WEP steht“. **Duplizieren** kopiert die Bau-Excel nicht.
- **Eigene Positionen:** `daten/eigene-positionen.json` (`wep-eigene-positionen/1`) enthält die vom
  Wertermittler gemerkten Freitext-Positionen (Bezeichnung, Einheit, Preis, Abschnitt). Der Abgleich
  führt beide Fassungen **je Eintrag** zusammen: Die neuere Änderung (`geaendertAm`) gewinnt, bei
  gleicher Zeit gewinnt „gelöscht“. Gelöschte Einträge bleiben als Marke (`geloescht`) in der Datei,
  damit ein Gerät mit altem Stand sie nicht zurückbringt. Es gibt keine Konflikt-Kopien; überschreibt
  ein anderes Gerät die Datei, heilt der nächste Abgleich (Vereinigung). Ohne Konto bleiben sie lokal
  (`localStorage`), nach der Anmeldung werden sie hochgeladen.
- **Profil:** `daten/profil.json` (`wep-profil/1`) enthält Name, Rolle und
  Standard-Kleingartenanlage. Es gibt kein Konflikt-Verfahren, die neuere Änderung
  gewinnt. Geräte-Einstellungen („Upload nur über WLAN“) bleiben lokal und stehen
  nie in dieser Datei.

## Sicherung als Datei (Beta 3, Paket 6)

Zusätzlich zum Abgleich: Profil → „Sicherung erstellen“ legt eine ZIP-Datei an (`WEP-Sicherung_<Datum>.zip`) mit allen WEPs, dem
Papierkorb, den eigenen Positionen und dem Profil, auf Wunsch mit Fotos und Bau-Excel-Dateien. „Sicherung einspielen“ zeigt zuerst eine
Vorschau (neu, gleich, weicht ab, im Papierkorb) und spielt nur ein, was gewählt ist; bei Abweichungen bleibt der Stand auf dem Gerät, bis
„Aus der Sicherung übernehmen“ oder „Als neues WEP anlegen“ gewählt wird. Eingespielte WEPs gehen über den normalen Abgleich nach OneDrive.
Code: `src/sicherung/`.

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

## Datenmodell (Papierkorb und Konflikte)

- `SyncDatei` (`wep-sync/1`) hat zwei optionale Felder `geloeschtAm`/`geloeschtVon`, nur in
  `daten/papierkorb/`. Das Format bleibt `wep-sync/1`.
- `SyncMeta` (IndexedDB `syncMeta`) bekommt: `geloescht` + `geloeschtAm` (im Papierkorb),
  `papierkorbETag` (Löschung ist in OneDrive angekommen), `endgueltig` (nur noch Marke, bis
  OneDrive aufgeräumt ist), `wiederhergestellt` (Datei muss aus dem Papierkorb zurückgeholt
  werden), `konflikt` (offener Konflikt samt anderer Fassung) und `aufraeumen`
  (entschiedene Konflikt-Kopien).
- Der lokale Papierkorb ist der IndexedDB-Store `papierkorb` (Datenbank-Version 4). Version 5 ergänzt die Stores `fotos` (Verwaltung + Vorschau) und `fotoDaten` (die Bilddateien), Version 6 `bauExcel` (Verwaltung) und `bauExcelDaten` (die Excel-Dateien).
  Gespeichert wird in einem gelöschten WEP nichts mehr (z. B. eine verzögerte Speicherung):
  `speichereWep` ignoriert Einträge im Papierkorb.

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
| `src/sync/engine.ts` | Abgleich-Logik für die WEPs inkl. Papierkorb und Konflikte (rein, getestet) |
| `src/sync/papierkorb.ts` | Lokale Regeln: löschen, wiederherstellen, endgültig löschen, 30 Tage, Konflikt entscheiden |
| `src/sync/aktionen.ts` | Diese Regeln für die Oberfläche (an IndexedDB angebunden) |
| `src/sync/graph.ts` | Microsoft-Graph-Zugriff auf einen Ordner im App-Ordner (`/me/drive/special/approot`) |
| `src/sync/ordner.ts` | Ordnerstruktur (auch `daten/papierkorb/`), `LIESMICH.txt`, Verschieben alter Dateien |
| `src/sync/fotos.ts` | Foto-Abgleich: hochladen, Papierkorb-Umzug, Aufräumen, Löschmarken |
| `src/fotos/` | Verkleinern (EXIF, Größe), Ablage, Benennung für den Export, Nachladen |
| `src/sync/bauExcel.ts` | Bau-Excel-Abgleich: hochladen, Papierkorb-Umzug, Aufräumen, Löschmarke |
| `src/bauexcel/` | Bau-Excel wählen/austauschen/entfernen/nachladen, Formalien-Abgleich (`abgleich.ts`), Kennung |
| `src/sync/profil.ts` | Abgleich von `daten/profil.json` |
| `src/sync/exporte.ts` | Upload der Excel-Exporte und Warteschlange |
| `src/sync/speicher.ts` | Anbindung an IndexedDB (`src/app/db.ts`, Stores `weps`, `syncMeta`, `papierkorb`, `exporte`) |
| `src/app/Papierkorb.tsx`, `KonfliktHinweis.tsx` | Papierkorb-Ansicht, Konflikt-Hinweis am WEP |
| `src/profil/index.ts` | Profil und Geräte-Einstellungen (localStorage), Vorbelegung neuer WEPs |
| `src/app/SyncLeiste.tsx` | Statuszeile und Abgleich auf der Startseite |

`src/sync` kennt nur die Schnittstelle aus `src/konto`. Die Android-Umsetzung
(System-Browser + PKCE mit App-Rücksprung, Schritt 3 in `docs/PLAN-BETA2.md`) ist die
zweite `KontoDienst`-Umsetzung; Hintergrund-Upload und Test-APK: `docs/ANDROID.md`.
