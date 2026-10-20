# Veröffentlichung (Beta) über Cloudflare Pages

Die App wird bei jedem Merge auf `main` automatisch gebaut und unter
`https://<projektname>.pages.dev/` veröffentlicht (kostenlos, HTTPS, auch für
private GitHub-Repos).

| Einstellung        | Wert            |
|--------------------|-----------------|
| Build-Befehl       | `npm run build` |
| Ausgabeordner      | `dist`          |
| Node-Version       | 22 (`.nvmrc`, zusätzlich Variable `NODE_VERSION=22`) |
| Variable           | `VITE_MS_CLIENT_ID` = Client-ID aus docs/SYNC.md |

- `public/_headers` sorgt dafür, dass `sw.js`, `index.html` und das Manifest nicht
  zwischengespeichert werden – sonst kämen App-Updates erst verspätet an.
- Die Client-ID ist kein Geheimnis; sie wird beim Build in die App eingebaut. Nach
  dem Ändern der Variable muss einmal neu gebaut werden (Deployment „erneut ausführen“).
- In der Microsoft-App-Registrierung muss `https://<projektname>.pages.dev/`
  (mit Schrägstrich) als Umleitungs-URI vom Typ *Single-Page-Webanwendung* stehen.

## Live-Update-Pakete der Android-App

`npm run build` legt bei bekanntem Commit (`CF_PAGES_COMMIT_SHA`) zusätzlich `dist/updates/<commit>.zip`
ab und schreibt `bundleUrl`/`nativeVersion` in `version.json`; `public/_headers` setzt dafür einen
langen Cache. Details: docs/ANDROID.md, Abschnitt „Updates“. Der Build-Befehl bleibt `npm run build`.
