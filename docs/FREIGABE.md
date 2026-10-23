# Freigabe: Updates nur, wenn Simon es will

Seit 23.10.2026 bekommen die Geräte (Android-App, Windows-Programm, Web-App im Browser) **nicht mehr nach
jedem Merge** ein Update, sondern nur nach einer **Freigabe**.

## So funktioniert es

- `main` = Entwicklung. Jeder Merge landet hier, Tests laufen wie bisher. Die Web-App von `main` ist als
  **Vorschau** erreichbar: <https://main.wep-pankow.pages.dev> (zum Ausprobieren im Browser; die Anmeldung
  mit Microsoft funktioniert dort nicht, „Ohne Konto fortfahren“ geht).
- `release` = freigegebener Stand. Nur davon bauen Cloudflare (Produktion `wep-pankow.pages.dev`), „Android
  Release“ und „Windows Release“. Die Geräte holen ihre Updates ausschließlich von dort.

## Freigeben

GitHub → **Actions → „Version freigeben“ → Run workflow** (Feld leer lassen = aktueller Stand von `main`).
Der Lauf setzt `release`, Cloudflare baut die Web-App neu, die Android-App bekommt ihr Live-Update
(bzw. bei geänderter `native-version` den Hinweis „Neue App-Version“), das Windows-Programm wird nur neu
gebaut, wenn sich `src-tauri/` geändert hat. In der Zusammenfassung des Laufs steht, was seit der letzten
Freigabe dazugekommen ist.

**Zurück auf einen älteren Stand:** denselben Workflow mit einem älteren Commit von `main` starten.
Android-/Windows-Live-Updates gehen nur vorwärts nach Commit-Vergleich mit Zeitstempel – bei einem
Zurückgehen besser die zuletzt funktionierende Freigabe erneut freigeben und den Fehler auf `main` beheben.

## Einmalig einrichten (Cloudflare)

Cloudflare → Workers & Pages → Projekt **wep-pankow** → Settings → Builds → **Branch control** →
**Production branch: `release`** → Speichern. Vorschau-Builds für andere Branches bleiben an.
Umgebungsvariable `VITE_MS_CLIENT_ID` gilt für „Production“ – für Vorschauen nicht nötig.

## Einmalig einrichten (Cloudflare Deploy Hook)

Ein Push durch GitHub Actions startet den Produktions-Build bei Cloudflare nicht zuverlässig. Deshalb ruft
„Version freigeben“ einen **Deploy Hook** auf:

1. Cloudflare → Workers & Pages → **wep-pankow** → Settings → Builds → **Deploy hooks** → **Add deploy hook**.
2. Name `freigabe`, Branch **`release`** → Save → die angezeigte URL kopieren (sie ist geheim).
3. GitHub → Settings → Secrets and variables → Actions → **New repository secret**:
   `CLOUDFLARE_DEPLOY_HOOK` = die URL.
4. „Version freigeben“ noch einmal starten.
