# Umbau der App im Entwurfs-Stil – Teil A (Beta 2, Schritt 4)

Screenshots der echten App mit erfundenen Testdaten. Neu erzeugen: `npm run umbau:screenshots`
(baut nach `dist-e2e/`, Skript `tools/umbau/screenshots.mjs`).

| Bildschirm | Handy (390 × 844) | Tablet (1180 × 820) |
|---|---|---|
| Login | `handy-1-login.png` | `tablet-1-login.png` |
| WEP-Liste mit Statuszeile | `handy-2-liste.png` | `tablet-2-liste.png` |
| Aufwuchs | `handy-3-aufwuchs.png`, `handy-3-aufwuchs-unten.png` | `tablet-3-aufwuchs.png` |
| Aufwuchs: Hinweise aufgeklappt, Position angetippt | `handy-3-aufwuchs-hinweise.png` | `tablet-3-aufwuchs-hinweise.png` |
| Außenanlagen | `handy-4-aussenanlagen.png` | `tablet-4-aussenanlagen.png` |
| Position hinzufügen: Suche / Formular | `handy-5a-suche.png`, `handy-5b-formular.png` | `tablet-5-hinzufuegen.png` |
| Preis überschrieben | `handy-5c-ueberschreiben.png` | `tablet-5c-ueberschreiben.png` |
| Eigene Position (Freitext) | `handy-5d-freitext.png` | `tablet-5d-freitext.png` |
| Export (Aktion) | `handy-6-export.png` | `tablet-6-export.png` |
| Menü „⋯“ / Rückfrage Löschen | `handy-7a-menue.png`, `handy-7b-loeschen-rueckfrage.png` | `tablet-7a-menue.png`, `tablet-7b-loeschen-rueckfrage.png` |
| Profil und Einstellungen | `handy-8-profil.png` | `tablet-8-profil.png` |
| Android-Test-Seite (im Profil, nur APK) | `handy-9-android-test.png` | `tablet-9-android-test.png` |

Die Android-Test-Seite erscheint nur in der APK; für das Bild ersetzt das Skript die
Capacitor-Brücke im Browser durch eine Attrappe mit Beispielwerten.
