# Design-Entwurf (Beta 2, Schritt 4)

Vorschau der drei Bildschirme mit erfundenen Daten. Die echte App ist davon unberührt.

- Seite: `entwurf.html` (lokal `npm run dev` → http://localhost:5173/entwurf.html;
  Cloudflare-Vorschau des Branches → `https://design-entwurf.wep-pankow.pages.dev/entwurf.html`)
- Umschalten über die dunkle Leiste oben; Parameter: `?b=liste|aufwuchs|suche|formular`,
  `&leiste=0` (ohne Leiste), `&thema=dunkel`
- Code: `src/design/entwurf/`, Tokens: `src/design/tokens.css`
- Screenshots neu erzeugen: `npm run entwurf:screenshots`, Dunkelmodus danach mit
  `node tools/entwurf/screenshots.mjs --dunkel`

| Bildschirm | Handy (390 × 844) | Tablet (1180 × 820) |
|---|---|---|
| 1 WEP-Liste | `handy-1-liste.png` | `tablet-1-liste.png` |
| 2 Erfassung Aufwuchs | `handy-2-aufwuchs.png`, `handy-2-aufwuchs-unten.png` | `tablet-2-aufwuchs.png` |
| 3 Position hinzufügen | `handy-3a-suche.png`, `handy-3b-formular.png` | `tablet-3-hinzufuegen.png` |

Dunkelmodus jeweils mit Endung `-dunkel.png`.
