// Durchlauf im echten Browser (Chromium): erster Start → „Ohne Konto fortfahren“ →
// WEP anlegen → Profil öffnen, Name speichern → neues WEP ist vorbelegt →
// Position über die Suche (Variante direkt im Treffer) hinzufügen, Preis überschreiben,
// Warnung und Summe → Position antippen, ändern und mit Rückfrage löschen (Richtlinie nur im
// Formular) → Beseitigung hinzufügen/ändern/löschen → Export mit Bau-Excel → Skizze-Werkzeugleiste
// und Dialoge → Status (exportiert nach Export, fertig, zurücksetzen, Filter in der Liste) →
// WEP duplizieren → WEPs über das Menü „⋯“ mit Rückfrage in den Papierkorb legen → Papierkorb:
// Wiederherstellen, „Endgültig löschen“ mit Rückfrage, Frist von 30 Tagen, Umstieg der
// Datenbank von Version 3 (Beta-Marke „gelöscht“). Eigene Positionen: Freitext merken (Standard an),
// „Eigene“ in der Suche, im Profil ändern und löschen. Fotos: aufnehmen/aus der Galerie (selbst erzeugte
// Testbilder mit EXIF-Ausrichtung und GPS), Verkleinern, Standortdaten weg, Text, Löschen mit Rückfrage,
// Fotos zur Position, Export als ZIP, Papierkorb nimmt die Fotos mit, Duplizieren ohne Fotos, endgültig löschen.
// Bau-Excel (Paket 5): Test-Bau-Excel aus der Vorlage mit erfundenen Werten am WEP merken, Formalien vorbefüllen, je Feld
// wählen, austauschen, entfernen, Export nimmt die gemerkte Datei (Überschrift im Skizzen-Blatt), „Neues WEP aus Bau-Excel“.
//
// Start: npm run e2e  (baut mit einer Platzhalter-Client-ID nach dist-e2e/, damit der
// Login-Bildschirm erscheint; es wird nie wirklich bei Microsoft angemeldet).
// Chromium kommt aus PLAYWRIGHT_BROWSERS_PATH (vorinstalliert), nicht „playwright install“.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { chromium } from 'playwright'
import { EXIF_GPS, EXIF_KAMERA, testFoto } from '../fotos/testbild.mjs'

const PORT = 4173
const URL = `http://localhost:${PORT}/`

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

/** Wartet (bis 5 s), bis die Liste genau n Einträge hat – sie lädt asynchron aus IndexedDB. */
async function anzahlEintraege(ort, n) {
  for (let i = 0; i < 50; i++) {
    if ((await ort.getByRole('listitem').count()) === n) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(`Prüfung fehlgeschlagen: ${text}`)
  console.log(`ok  ${text}`)
}

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
let browser
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL)).ok) break
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  browser = await chromium.launch({ executablePath: chromiumPfad() })
  const kontext = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 412, height: 800 } })
  const seite = await kontext.newPage()
  const fehler = []
  seite.on('pageerror', (e) => fehler.push(e.message))

  // 1. Erster Start: Login-Bildschirm
  await seite.goto(URL)
  await seite.getByRole('button', { name: 'Mit Microsoft anmelden' }).waitFor()
  pruefe(await seite.getByText('Ohne Konto fortfahren (nur auf diesem Gerät)').isVisible(), 'erster Start zeigt den Login-Bildschirm')
  await seite.screenshot({ path: 'dist-e2e/login.png' })

  // 2. Ohne Konto fortfahren → Startseite mit schlichter Statuszeile
  await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await seite.getByRole('main').getByText('Nur auf diesem Gerät gespeichert').isVisible(), 'Statuszeile: nur auf diesem Gerät')

  // 3. Neustart: Wahl gemerkt, App startet direkt
  await seite.reload()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe((await seite.getByRole('button', { name: 'Mit Microsoft anmelden' }).count()) === 0, 'nach Neustart kein Login-Bildschirm mehr')

  // 4. Profil öffnen, Name und Anlage eintragen
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()
  await seite.getByLabel(/^Name/).fill('Erika Musterfrau')
  await seite.getByLabel(/Standard-Kleingartenanlage/).fill('KGA Musterwiese')
  await seite.getByLabel('Rolle').selectOption('gruen')
  pruefe(await seite.getByLabel('Upload nur über WLAN').isChecked(), 'Upload nur über WLAN ist standardmäßig an')
  pruefe(await seite.getByText(/Gilt für Fotos und den Hintergrund-Upload der Android-App/).isVisible(), 'Hinweis zu „nur WLAN“ nennt Fotos und die Android-App')
  pruefe(await seite.getByText('Version', { exact: true }).isVisible(), 'App-Version wird angezeigt')
  pruefe(await seite.getByText(/Nicht angemeldet/).isVisible(), 'Konto: nicht angemeldet, Anmelden möglich')
  await seite.screenshot({ path: 'dist-e2e/profil.png' })
  await seite.getByRole('button', { name: 'Protokolle' }).click()

  // 5. WEP anlegen: Name und Anlage aus dem Profil sind vorbelegt
  await seite.getByRole('button', { name: 'Neues WEP', exact: true }).click()
  await seite.getByLabel(/Kleingartenanlage/).first().waitFor()
  pruefe((await seite.getByLabel(/Kleingartenanlage/).first().inputValue()) === 'KGA Musterwiese', 'Anlage aus dem Profil vorbelegt')
  pruefe((await seite.locator('input[value="Erika Musterfrau"]').count()) > 0, 'Wertermittler aus dem Profil vorbelegt')

  // 6. Aufwuchs: Position über die Suche hinzufügen – die Variante steht direkt im Treffer
  await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Aufwuchs' }).click()
  await seite.getByRole('heading', { name: 'Aufwuchs' }).waitFor()
  pruefe(await seite.getByText('0 Positionen').isVisible(), 'Aufwuchs: noch keine Positionen')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByLabel('Katalog durchsuchen').fill('apfel')
  await seite.getByRole('button', { name: /Apfel, Halbstamm, 5–30 J\./ }).click()
  await seite.getByLabel('Anzahl').fill('2')
  pruefe((await seite.getByText('63,75').count()) > 0, 'Preisvorschlag Höchstwert × Zustand (85 × 0,75)')
  await seite.getByRole('button', { name: 'Überschreiben' }).click()
  await seite.getByLabel('Einzelpreis').fill('70')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByText('Apfel, Halbstamm, 5–30 J.').waitFor()
  pruefe(await seite.getByText(/2.Stück · gut · je 70,00/).isVisible(), 'Position mit überschriebenem Preis in der Liste')
  pruefe(await seite.getByText(/manuell/).filter({ visible: true }).first().isVisible(), 'überschriebener Preis ist als „manuell“ markiert')

  // 7. Rasen über 100 m² → Warnung (nur Hinweis, keine Sperre), Summe
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByLabel('Katalog durchsuchen').fill('rasen')
  await seite.getByRole('button', { name: /^Rasen/ }).first().click()
  pruefe((await seite.getByLabel(/^Bezeichnung/).inputValue()) === 'Rasen', 'Suche „rasen“ behält den Positionsnamen (nicht „Rasengräser“)')
  await seite.getByLabel('Anzahl').fill('120')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByText(/Nur bis max\. 100/).first().waitFor()
  pruefe(await seite.getByText(/Nur bis max\. 100/).first().isVisible(), 'Warnung Rasen > 100 m²')
  pruefe(await seite.getByText('2 Positionen').isVisible(), 'zwei Positionen gespeichert')
  pruefe(await seite.getByRole('row', { name: /Summe Aufwuchs/ }).getByText('185,00').isVisible(), 'Summe Aufwuchs 140 + 45 = 185 €')

  // 8. Eigene Position (Freitext)
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByRole('button', { name: 'Eigene Position (Freitext)' }).click()
  await seite.getByLabel(/^Bezeichnung/).fill('Zaubernuss')
  await seite.getByRole('button', { name: 'schlecht', exact: true }).click()
  pruefe(await seite.getByText(/Erinnerungswert 1,00\s€ bei schlechtem Zustand/).isVisible(), 'eigene Position, Zustand „schlecht“: Vorschlag 1,00 € ohne Höchstwert')
  await seite.getByRole('button', { name: 'Überschreiben' }).click()
  await seite.getByLabel('Einzelpreis').fill('40')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  pruefe(await seite.getByText('3 Positionen').isVisible(), 'Freitext-Position gespeichert')

  // 9. Position antippen → Formular zum Ändern (Bezeichnung, Anzahl, Zustand, Preis)
  await seite.getByRole('row', { name: /Zaubernuss/ }).click()
  await seite.getByLabel(/^Bezeichnung/).waitFor()
  pruefe((await seite.getByLabel(/^Bezeichnung/).inputValue()) === 'Zaubernuss', 'Antippen öffnet das Formular mit den Werten')
  pruefe((await seite.getByLabel('Einzelpreis').inputValue()) === '40', 'eigener Preis ist vorbelegt')
  await seite.getByLabel(/^Bezeichnung/).fill('Zaubernuss, alt')
  await seite.getByLabel('Anzahl').fill('2')
  await seite.getByRole('button', { name: 'mittel', exact: true }).click()
  await seite.getByLabel('Einzelpreis').fill('35')
  await seite.getByRole('button', { name: 'Speichern' }).click()
  await seite.getByText(/Zaubernuss, alt/).waitFor()
  pruefe(await seite.getByText(/2.Stück · mittel · je 35,00/).isVisible(), 'geänderte Position steht in der Liste')
  pruefe(await seite.getByText('3 Positionen').isVisible(), 'Ändern legt keine zweite Position an')

  // 9b. Richtlinien-Erläuterung nur im Formular, nicht in der Liste; Warnung bleibt in der Liste
  const rasenRegeln = JSON.parse(readFileSync('data/katalog.json', 'utf-8')).positionen.find((p) => p.id === 'aw-rasen').regeln
  const regelnStart = rasenRegeln.slice(0, 30)
  pruefe((await seite.getByText(regelnStart, { exact: false }).count()) === 0, 'Richtlinientext steht nicht in der Positionsliste')
  pruefe(await seite.getByText(/Nur bis max\. 100/).first().isVisible(), 'Warnung steht weiter in der Liste')
  await seite.getByRole('row', { name: /^Rasen/ }).click()
  await seite.getByText('Richtlinie', { exact: true }).click()
  pruefe(await seite.getByText(regelnStart, { exact: false }).first().isVisible(), 'Richtlinie steht im Formular')
  await seite.getByRole('button', { name: 'Abbrechen' }).filter({ visible: true }).first().click()
  pruefe(await seite.getByText('3 Positionen').isVisible(), 'Abbrechen ändert nichts')

  // 9c. Löschen unten im Formular mit Rückfrage
  await seite.getByRole('row', { name: /Zaubernuss/ }).click()
  await seite.getByRole('button', { name: 'Löschen' }).click()
  await seite.getByRole('alertdialog').waitFor()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
  pruefe((await seite.getByRole('alertdialog').count()) === 0, 'Rückfrage „Abbrechen“ löscht nicht')
  await seite.getByRole('button', { name: 'Löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
  await seite.getByText('2 Positionen').waitFor()
  pruefe(await seite.getByText('2 Positionen').isVisible(), 'Position nach Rückfrage gelöscht')

  // 9d. Eigene Position: Freitext wurde gemerkt (Standard an), „Eigene“ in der Suche, Schalter aus merkt nicht
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByLabel('Katalog durchsuchen').fill('zaubernus')
  pruefe(await seite.getByRole('button', { name: /Zaubernuss.*Eigene/ }).isVisible(), 'Suche zeigt die gemerkte Position mit Kennzeichnung „Eigene“')
  await seite.getByRole('button', { name: /Zaubernuss.*Eigene/ }).click()
  pruefe((await seite.getByLabel(/^Bezeichnung/).inputValue()) === 'Zaubernuss', 'Eigene Position: Bezeichnung vorbelegt')
  pruefe((await seite.getByLabel('Einzelpreis').inputValue()) === '40', 'Eigene Position: gemerkter Preis vorbelegt')
  pruefe((await seite.getByRole('switch', { name: 'Als eigene Position merken' }).count()) === 0, 'Gemerkte Position: kein zweites Merken')
  await seite.getByRole('button', { name: 'Suche', exact: true }).click()
  await seite.getByLabel('Katalog durchsuchen').fill('')
  await seite.getByRole('button', { name: 'Eigene Position (Freitext)' }).click()
  pruefe(await seite.getByRole('switch', { name: 'Als eigene Position merken' }).isChecked(), 'Freitext: „Als eigene Position merken“ ist standardmäßig an')
  await seite.getByLabel(/^Bezeichnung/).fill('Einmalpflanze')
  await seite.getByRole('switch', { name: 'Als eigene Position merken' }).uncheck()
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByText('3 Positionen').waitFor()
  await seite.getByRole('row', { name: /Einmalpflanze/ }).click()
  await seite.getByRole('button', { name: 'Löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
  await seite.getByText('2 Positionen').waitFor()
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByLabel('Katalog durchsuchen').fill('einmalpflanze')
  pruefe((await seite.getByRole('button', { name: /Einmalpflanze/ }).count()) === 0, 'Ohne „merken“ taucht die Freitext-Position nicht in der Suche auf')
  await seite.getByRole('button', { name: 'Abbrechen' }).filter({ visible: true }).first().click()
  pruefe(await seite.getByText('2 Positionen').isVisible(), 'Abbrechen ändert nichts')

  // 10. Gespeichert: nach Neuladen noch da
  await seite.reload()
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Aufwuchs' }).click()
  pruefe(await seite.getByText('2 Positionen').isVisible(), 'Positionen nach Neuladen gespeichert')

  // 10b. Beseitigung: leer → hinzufügen → ändern → löschen
  const nav = seite.getByRole('navigation', { name: 'Abschnitte' })
  await nav.getByRole('button', { name: 'Beseitigung' }).click()
  await seite.getByRole('heading', { name: 'Beseitigung' }).waitFor()
  pruefe(await seite.getByText('Noch keine Positionen').isVisible(), 'Beseitigung: Leerzustand')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByLabel(/^Gegenstand/).fill('Japanischer Knöterich entfernen')
  await seite.getByLabel('Einzelpreis (€)').fill('90')
  await seite.getByLabel('Menge').fill('2')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByText('Japanischer Knöterich entfernen').waitFor()
  pruefe(await seite.getByRole('main').getByText('180,00').first().isVisible(), 'Beseitigung: 2 × 90 € = 180 €')
  await seite.getByRole('button', { name: /Japanischer Knöterich entfernen/ }).click()
  pruefe((await seite.getByLabel('Menge').inputValue()) === '2', 'Beseitigung antippen: Formular mit Werten')
  await seite.getByLabel('Faktor (Standard 1)').fill('1,5')
  await seite.getByLabel(/^Begründung/).fill('schwer zugänglich')
  await seite.getByRole('button', { name: 'Speichern' }).click()
  await seite.getByText(/Faktor 1,5/).waitFor()
  pruefe(await seite.getByRole('main').getByText('270,00').first().isVisible(), 'Beseitigung geändert: 2 × 90 € × 1,5 = 270 €')
  await seite.getByRole('button', { name: /Japanischer Knöterich entfernen/ }).click()
  await seite.getByRole('button', { name: 'Löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
  await seite.getByText('Noch keine Positionen').waitFor()
  pruefe(await seite.getByText('Noch keine Positionen').isVisible(), 'Beseitigung nach Rückfrage gelöscht')

  // 10c. Formalien: gruppierte Felder, Eingaben werden gespeichert
  await nav.getByRole('button', { name: 'Formalien' }).click()
  await seite.getByRole('heading', { name: 'Beteiligte' }).waitFor()
  await seite.getByLabel('Parzelle', { exact: true }).fill('Parzelle 42')
  await seite.getByLabel('Parzellenfläche (m²)').fill('350')

  // 10d. Bau-Excel (Paket 5): am WEP merken, Formalien vorbefüllen, je Feld wählen, austauschen, entfernen, Export
  // Test-Bau-Excel aus der Vorlage mit erfundenen Werten (Anlage „KGA Testgarten“, Fläche 380 …)
  const bauOrdner = mkdtempSync(join(tmpdir(), 'wep-bau-'))
  const bauDatei = join(bauOrdner, 'WEP Bau Testgarten.xlsx')
  const bauDateiNeu = join(bauOrdner, 'WEP Bau neu.xlsx')
  execFileSync('npx', ['vite-node', 'tools/paket5/erzeuge-test-bau-excel.ts', '--', bauDatei], { stdio: 'ignore' })
  execFileSync('npx', ['vite-node', 'tools/paket5/erzeuge-test-bau-excel.ts', '--', bauDateiNeu, 'abweichend'], { stdio: 'ignore' })
  const bauEingabe = seite.getByTestId('bau-excel-eingabe')
  pruefe(await seite.getByRole('button', { name: 'Bau-Excel auswählen' }).isVisible(), 'Bau-Excel: Formalien bieten „Bau-Excel auswählen“')
  await bauEingabe.setInputFiles(bauDatei)
  await seite.getByRole('heading', { name: 'Formalien abgleichen' }).waitFor()
  const abgleichDialog = seite.getByRole('dialog')
  pruefe((await abgleichDialog.getByRole('radio').count()) >= 4, 'Bau-Excel: abweichende Felder werden einzeln zur Wahl gestellt')
  pruefe(await abgleichDialog.getByText('Bau-Excel sagt').first().isVisible(), 'Bau-Excel: „Bau-Excel sagt … / Im WEP steht …“')
  pruefe(await abgleichDialog.getByText('KGA Testgarten').isVisible() && (await abgleichDialog.getByText('KGA Musterwiese').isVisible()), 'Bau-Excel: Anlage Bau-Excel gegen WEP')
  pruefe(
    (await abgleichDialog.getByRole('radio', { checked: true }).count()) === (await abgleichDialog.getByRole('radio').count()) / 2,
    'Bau-Excel: Vorauswahl überall der Wert im WEP (nichts wird still überschrieben)',
  )
  await seite.screenshot({ path: 'dist-e2e/bau-abgleich.png' })
  // Nur die Fläche aus der Bau-Excel nehmen
  await abgleichDialog.locator('fieldset', { hasText: 'Parzellenfläche' }).getByRole('radio').first().check()
  await abgleichDialog.getByRole('button', { name: 'Übernehmen' }).click()
  await seite.getByText(/1 Feld aus der Bau-Excel übernommen/).waitFor()
  pruefe((await seite.getByLabel('Parzellenfläche (m²)').inputValue()) === '380', 'Bau-Excel: gewählte Fläche übernommen (350 → 380)')
  pruefe((await seite.getByLabel(/Kleingartenanlage/).first().inputValue()) === 'KGA Musterwiese', 'Bau-Excel: nicht gewähltes Feld bleibt im WEP')
  pruefe((await seite.getByLabel(/^Weg/).inputValue()) === 'Rosenweg', 'Bau-Excel: leeres Feld „Weg“ wurde aus der Bau-Excel ergänzt')
  pruefe(await seite.getByText(/WEP Bau Testgarten\.xlsx/).first().isVisible(), 'Bau-Excel: Name und Stand am WEP sichtbar')
  // Neustart: die Bau-Excel bleibt am WEP
  await seite.reload()
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
  // Austauschen mit Rückfrage; die neue Fassung wird erneut abgeglichen
  pruefe(await seite.getByText(/WEP Bau Testgarten\.xlsx/).first().isVisible(), 'Bau-Excel: nach dem Neustart noch am WEP')
  await seite.getByRole('button', { name: 'Austauschen' }).click()
  pruefe(await seite.getByRole('alertdialog').getByText(/wird durch die neue Datei ersetzt/).isVisible(), 'Bau-Excel: Austauschen fragt zurück')
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
  await seite.getByRole('button', { name: 'Austauschen' }).click()
  const wahlEvent = seite.waitForEvent('filechooser')
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Datei wählen' }).click()
  await (await wahlEvent).setFiles(bauDateiNeu)
  await seite.getByRole('heading', { name: 'Formalien abgleichen' }).waitFor()
  pruefe(await seite.getByRole('dialog').getByText('Max Beispielmann').isVisible(), 'Bau-Excel: ausgetauschte Datei wird erneut abgeglichen')
  await seite.getByRole('dialog').getByRole('button', { name: 'Später' }).click()
  pruefe(await seite.getByText(/Angaben für die Formalien, die noch nicht abgeglichen sind/).isVisible(), 'Bau-Excel: „Später“ lässt einen Hinweis stehen')
  await seite.getByRole('button', { name: 'Formalien abgleichen' }).click()
  await seite.getByRole('dialog').getByRole('button', { name: 'Alle im WEP lassen' }).click()
  await seite.getByRole('dialog').getByRole('button', { name: 'Übernehmen' }).click()
  await seite.getByText(/Formalien im WEP bleiben unverändert/).waitFor()
  pruefe((await seite.getByLabel('Parzelle', { exact: true }).inputValue()) === 'Parzelle 42', 'Bau-Excel: „Alle im WEP lassen“ ändert nichts')

  // Export nimmt die gemerkte Bau-Excel – ohne dass sie noch einmal gewählt wird
  await seite.getByRole('button', { name: 'Export', exact: true }).click()
  await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
  pruefe(await seite.getByText(/WEP Bau neu\.xlsx/).first().isVisible(), 'Export: zeigt die am WEP gemerkte Bau-Excel')
  const exportDownload = seite.waitForEvent('download')
  await seite.getByRole('button', { name: 'Excel exportieren' }).click()
  await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
  const exportPfad = await (await exportDownload).path()
  const exportZip = await JSZip.loadAsync(readFileSync(exportPfad))
  const exportBlatt = await exportZip.file('xl/worksheets/sheet1.xml').async('string')
  const exportGeteilt = await exportZip.file('xl/sharedStrings.xml').async('string')
  pruefe(exportGeteilt.includes('Bert Bauer'), 'Export: Angaben des Bau-Wertermittlers aus der gemerkten Bau-Excel sind enthalten')
  pruefe(exportBlatt.includes('Parzelle 42') && !exportBlatt.includes('Parzelle 17'), 'Export: nach dem Abgleich gelten die Werte aus dem WEP')
  pruefe((await seite.getByText(/Folgende Formalien-Felder waren in der Bau-Excel bereits gefüllt/).count()) === 0, 'Export: keine Konflikt-Meldung nach dem Abgleich')
  const skizzeBlatt = await exportZip.file('xl/worksheets/sheet19.xml').async('string')
  pruefe(skizzeBlatt.includes('Skizze – Außenanlagen und Aufwuchs') && !/Skizze – Baulichkeiten/.test(skizzeBlatt), 'Export: Überschrift im Skizzen-Blatt Außenanlage-Aufwuchs korrigiert')
  pruefe((await exportZip.file('xl/worksheets/sheet18.xml').async('string')).length > 0, 'Export: Blatt „Skizze Bau“ vorhanden')
  pruefe(exportGeteilt.includes('Skizze – Baulichkeiten'), 'Export: „Skizze Bau“ behält seine Überschrift')

  // Entfernen mit Rückfrage; danach nimmt der Export die leere Vorlage
  await seite.getByRole('button', { name: 'Entfernen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
  pruefe(await seite.getByText(/WEP Bau neu\.xlsx/).first().isVisible(), 'Bau-Excel: „Abbrechen“ entfernt nichts')
  await seite.getByRole('button', { name: 'Entfernen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Entfernen' }).click()
  await seite.getByRole('button', { name: /Bau-Excel auswählen/ }).waitFor()
  pruefe(await seite.getByRole('button', { name: /Bau-Excel auswählen/ }).isVisible(), 'Bau-Excel: entfernt, „Bau-Excel auswählen“ wieder da')
  const leerDownload = seite.waitForEvent('download')
  await seite.getByRole('button', { name: 'Excel exportieren' }).click()
  await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
  const leerZip = await JSZip.loadAsync(readFileSync(await (await leerDownload).path()))
  pruefe(!(await leerZip.file('xl/sharedStrings.xml').async('string')).includes('Bert Bauer'), 'Export ohne Bau-Excel: leere Vorlage')
  pruefe(await seite.getByText('KGA Musterwiese · Grün · exportiert').isVisible(), 'Status: nach dem Export automatisch „exportiert“')

  // 10e. Skizze: Werkzeugleiste mit Icons (≥ 48 px), Dialoge im neuen Stil
  await nav.getByRole('button', { name: 'Skizze' }).click()
  await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
  const kleinste = await seite.getByRole('toolbar').getByRole('button').evaluateAll((knoepfe) =>
    Math.min(...knoepfe.map((k) => Math.min(k.getBoundingClientRect().width, k.getBoundingClientRect().height))),
  )
  pruefe(kleinste >= 48, `Skizze: Werkzeug-Knöpfe mindestens 48 px (kleinster: ${kleinste} px)`)
  pruefe((await seite.getByRole('toolbar').locator('svg.lucide').count()) >= 10, 'Skizze: Werkzeuge sind lucide-Icons')
  let flaeche = await seite.locator('.skizze-flaeche svg').boundingBox()
  const zeichne = async (x1, y1, x2, y2) => {
    await seite.locator('.skizze-flaeche svg').evaluate((e) => e.scrollIntoView({ block: 'center' })); 
    flaeche = await seite.locator('.skizze-flaeche svg').boundingBox() // Lage kann sich mit der Werkzeug-Leiste ändern
    await seite.mouse.move(flaeche.x + x1, flaeche.y + y1)
    await seite.mouse.down()
    await seite.mouse.move(flaeche.x + x2, flaeche.y + y2, { steps: 5 })
    await seite.mouse.up()
  }
  await seite.getByRole('button', { name: 'Rechteck', exact: true }).click()
  await zeichne(40, 40, 160, 120)
  pruefe((await seite.locator('.skizze-flaeche svg rect[stroke]').count()) >= 1, 'Skizze: Rechteck gezeichnet')
  await seite.getByRole('button', { name: 'Text', exact: true }).click()
  await seite.mouse.click(flaeche.x + 200, flaeche.y + 60)
  await seite.getByRole('dialog', { name: 'Text einfügen' }).waitFor()
  await seite.getByRole('textbox', { name: 'Text', exact: true }).fill('Laube')
  await seite.getByRole('button', { name: 'Einfügen' }).click()
  pruefe(await seite.locator('.skizze-flaeche svg text', { hasText: 'Laube' }).isVisible(), 'Skizze: Text-Dialog fügt Text ein')
  await seite.getByRole('button', { name: 'Maßangabe', exact: true }).click()
  await zeichne(40, 160, 200, 160)
  await seite.getByRole('dialog', { name: 'Maß eintragen' }).waitFor()
  await seite.getByLabel('Maß (in m)').fill('3,5 m')
  await seite.getByRole('button', { name: 'Übernehmen' }).click()
  pruefe(await seite.locator('.skizze-flaeche svg text', { hasText: '3,5 m' }).isVisible(), 'Skizze: Maß-Dialog')
  await seite.getByRole('button', { name: 'Symbol', exact: true }).click()
  await seite.getByRole('combobox', { name: 'Symbol' }).waitFor()
  await seite.locator('.skizze-flaeche svg').evaluate((e) => e.scrollIntoView({ block: 'center' })); 
  flaeche = await seite.locator('.skizze-flaeche svg').boundingBox()
  await seite.mouse.click(flaeche.x + 260, flaeche.y + 200)
  await seite.getByRole('dialog', { name: 'Beschriftung' }).waitFor()
  await seite.getByLabel(/^Baumart oder Name/).fill('Apfel')
  await seite.getByRole('button', { name: 'Übernehmen' }).click()
  pruefe(await seite.locator('.skizze-flaeche svg text', { hasText: 'Apfel' }).first().isVisible(), 'Skizze: Beschriftungs-Dialog (Baumart)')
  await seite.getByRole('button', { name: 'Text', exact: true }).click()
  await seite.locator('.skizze-flaeche svg').evaluate((e) => e.scrollIntoView({ block: 'center' })); 
  const flaecheNeu = await seite.locator('.skizze-flaeche svg').boundingBox() // Symbol-Auswahl ist weg, Fläche ist verrutscht
  await seite.mouse.click(flaecheNeu.x + 300, flaecheNeu.y + 200)
  await seite.getByRole('dialog', { name: 'Text einfügen' }).waitFor()
  await seite.keyboard.press('Escape')
  pruefe((await seite.getByRole('dialog').count()) === 0, 'Skizze: Escape schließt den Dialog')
  await seite.getByRole('button', { name: 'Rückgängig' }).click()
  pruefe((await seite.getByRole('main').getByText('Apfel').count()) === 0, 'Skizze: Rückgängig nimmt das Symbol zurück')

  // 10f. Skizze bedienen (Paket 7): Zoomen/Verschieben mit Knöpfen, Mausrad, Maus und zwei Fingern, Einrasten, Auswählen
  const svgOrt = seite.locator('.skizze-flaeche svg')
  const viewBox = async () => (await svgOrt.getAttribute('viewBox')).split(' ').map(Number)
  const zoomFaktor = async () => 800 / (await viewBox())[2]
  const kasten = async () => {
    await svgOrt.evaluate((e) => e.scrollIntoView({ block: 'center' }))
    return svgOrt.boundingBox()
  }
  pruefe((await viewBox()).join(' ') === '0 0 800 600', 'Zoom: Start zeigt die ganze Skizze')
  pruefe(await seite.getByRole('button', { name: 'Ganze Skizze' }).isDisabled(), 'Zoom: „Ganze Skizze“ ist bei ganzer Skizze aus')
  const elementeAnzahl = () => seite.locator('.skizze-flaeche svg rect[stroke], .skizze-flaeche svg circle').count()
  const vorher = await elementeAnzahl()

  await seite.getByRole('button', { name: 'Hineinzoomen' }).click()
  pruefe(Math.abs((await zoomFaktor()) - 1.5) < 0.01, 'Zoom: Plus-Knopf vergrößert um das Eineinhalbfache')
  pruefe(await seite.getByText('Zoom 150 %').isVisible(), 'Zoom: Anzeige „Zoom 150 %“')
  await seite.getByRole('button', { name: 'Ganze Skizze' }).click()
  pruefe((await viewBox()).join(' ') === '0 0 800 600', 'Zoom: „Ganze Skizze“ stellt alles wieder her')

  // Mausrad zoomt um den Mauszeiger; Mittelpunkt-Skizzenpunkt unter dem Zeiger bleibt
  let k = await kasten()
  await seite.mouse.move(k.x + k.width * 0.25, k.y + k.height * 0.25)
  await seite.mouse.wheel(0, -400)
  await seite.waitForTimeout(100)
  let vb = await viewBox()
  pruefe((await zoomFaktor()) > 1.2, `Zoom: Mausrad vergrößert (Faktor ${(await zoomFaktor()).toFixed(2)})`)
  const skizzeUnterZeiger = ((k.width * 0.25) / k.width) * vb[2] + vb[0]
  pruefe(Math.abs(skizzeUnterZeiger - 200) < 2, `Zoom: Mausrad hält den Punkt unter dem Zeiger (${skizzeUnterZeiger.toFixed(1)} ≈ 200)`)

  // Verschieben: Auswählen-Werkzeug, auf leere Stelle ziehen; mittlere Maustaste geht ebenfalls
  await seite.getByRole('button', { name: 'Auswählen' }).click()
  const vbVorPan = await viewBox()
  await seite.mouse.move(k.x + k.width * 0.92, k.y + k.height * 0.1)
  await seite.mouse.down()
  await seite.mouse.move(k.x + k.width * 0.62, k.y + k.height * 0.3, { steps: 6 })
  await seite.mouse.up()
  const vbNachPan = await viewBox()
  pruefe(vbNachPan[0] > vbVorPan[0] && vbNachPan[1] < vbVorPan[1], 'Verschieben: Ziehen auf leerer Stelle verschiebt den Ausschnitt (Inhalt folgt der Maus)')
  pruefe(Math.abs(vbNachPan[2] - vbVorPan[2]) < 0.001, 'Verschieben: Zoom bleibt dabei gleich')
  await seite.getByRole('button', { name: 'Ganze Skizze' }).click()

  // Zwei Finger (Chromium-Touch über CDP): zoomen, verschieben; dabei darf nichts gezeichnet werden
  const cdp = await kontext.newCDPSession(seite)
  const beruehrung = (type, punkte) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punkte.map(([x, y], i) => ({ x, y, id: i + 1 })) })
  await seite.getByRole('button', { name: 'Rechteck', exact: true }).click()
  k = await kasten()
  const mx = k.x + k.width / 2
  const my = k.y + k.height / 2
  await beruehrung('touchStart', [[mx - 40, my], [mx + 40, my]])
  for (let i = 1; i <= 6; i++) await beruehrung('touchMove', [[mx - 40 - i * 15, my], [mx + 40 + i * 15, my]])
  await beruehrung('touchEnd', [])
  await seite.waitForTimeout(100)
  const faktorFinger = await zoomFaktor()
  pruefe(faktorFinger > 2.5 && faktorFinger < 3.7, `Gesten: zwei Finger auseinander zoomen (Faktor ${faktorFinger.toFixed(2)}, erwartet ≈ 3)`)
  pruefe((await elementeAnzahl()) === vorher, 'Gesten: Zwei-Finger-Zoom zeichnet nichts (Rechteck-Werkzeug aktiv)')
  const vbGeste = await viewBox()
  await beruehrung('touchStart', [[mx - 40, my], [mx + 40, my]])
  for (let i = 1; i <= 6; i++) await beruehrung('touchMove', [[mx - 40 + i * 10, my + i * 5], [mx + 40 + i * 10, my + i * 5]])
  await beruehrung('touchEnd', [])
  await seite.waitForTimeout(100)
  const vbGeschoben = await viewBox()
  pruefe(vbGeschoben[0] < vbGeste[0] && vbGeschoben[1] < vbGeste[1], 'Gesten: zwei Finger gemeinsam verschieben den Ausschnitt')
  pruefe(Math.abs(vbGeschoben[2] - vbGeste[2]) < 0.5, 'Gesten: gleichmäßiges Verschieben ändert den Zoom nicht')
  pruefe((await elementeAnzahl()) === vorher, 'Gesten: Zwei-Finger-Verschieben zeichnet nichts')
  await beruehrung('touchStart', [[mx - 60, my], [mx + 60, my]])
  for (let i = 1; i <= 6; i++) await beruehrung('touchMove', [[mx - 60 + i * 8, my], [mx + 60 - i * 8, my]])
  await beruehrung('touchEnd', [])
  await seite.waitForTimeout(100)
  pruefe((await zoomFaktor()) < faktorFinger, 'Gesten: zwei Finger zusammen zoomen heraus')
  if (await seite.getByRole('button', { name: 'Ganze Skizze' }).isEnabled()) await seite.getByRole('button', { name: 'Ganze Skizze' }).click()

  // Einrasten: neues Rechteck beginnt knapp neben der rechten unteren Ecke des ersten (160/120 in Pixeln) und rastet ein
  const rechtecke = () =>
    seite.locator('.skizze-flaeche svg rect[stroke]').evaluateAll((r) =>
      r.map((x) => ({ x: +x.getAttribute('x'), y: +x.getAttribute('y'), b: +x.getAttribute('width'), h: +x.getAttribute('height') })),
    )
  const ersteR = (await rechtecke())[0]
  pruefe(await seite.getByRole('button', { name: 'Einrasten' }).getAttribute('aria-pressed') === 'true', 'Einrasten: ist standardmäßig an')
  k = await kasten()
  const px = k.width / 800
  const ecke = { x: k.x + (ersteR.x + ersteR.b) * px, y: k.y + (ersteR.y + ersteR.h) * px }
  await seite.mouse.move(ecke.x + 4, ecke.y + 3)
  await seite.mouse.down()
  await seite.mouse.move(ecke.x + 100, ecke.y + 60, { steps: 5 })
  pruefe((await seite.locator('.skizze-hilfslinie').count()) >= 1, 'Einrasten: Hilfslinie erscheint beim Zeichnen')
  await seite.mouse.up()
  let alle = await rechtecke()
  let neuR = alle[alle.length - 1]
  pruefe(Math.abs(neuR.x - (ersteR.x + ersteR.b)) < 0.001 && Math.abs(neuR.y - (ersteR.y + ersteR.h)) < 0.001, 'Einrasten: Anfang des neuen Rechtecks sitzt genau auf der Ecke des ersten')
  // aus: gleiche Bewegung ohne Einrasten landet daneben
  await seite.getByRole('button', { name: 'Einrasten' }).click()
  pruefe(await seite.getByRole('button', { name: 'Einrasten' }).getAttribute('aria-pressed') === 'false', 'Einrasten: lässt sich abschalten')
  await seite.mouse.move(ecke.x + 4, ecke.y + 3)
  await seite.mouse.down()
  await seite.mouse.move(ecke.x + 100, ecke.y + 150, { steps: 5 })
  await seite.mouse.up()
  alle = await rechtecke()
  neuR = alle[alle.length - 1]
  pruefe(Math.abs(neuR.x - (ersteR.x + ersteR.b)) > 1, 'Einrasten aus: Anfang bleibt dort, wo gesetzt')
  await nav.getByRole('button', { name: 'Aufwuchs' }).click()
  await nav.getByRole('button', { name: 'Skizze' }).click()
  await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
  pruefe(await seite.getByRole('button', { name: 'Einrasten' }).getAttribute('aria-pressed') === 'false', 'Einrasten: Einstellung bleibt beim erneuten Öffnen der Skizze')
  await seite.getByRole('button', { name: 'Einrasten' }).click()

  // Linie: fast waagerecht wird gerade
  await seite.getByRole('button', { name: 'Linie', exact: true }).click()
  k = await kasten()
  await seite.mouse.move(k.x + 30, k.y + 20)
  await seite.mouse.down()
  await seite.mouse.move(k.x + 200, k.y + 25, { steps: 5 })
  await seite.mouse.up()
  const linien = await seite.locator('.skizze-flaeche svg line[stroke]').evaluateAll((l) =>
    l.map((x) => [+x.getAttribute('y1'), +x.getAttribute('y2')]),
  )
  pruefe(linien.some(([a, b]) => Math.abs(a - b) < 0.001 && a > 0), 'Einrasten: fast waagerechte Linie wird genau waagerecht')

  // Auswählen: kleiner Kreis unter einem großen Rechteck wird zuerst gewählt, Antippen wechselt durch
  await seite.getByRole('button', { name: 'Kreis', exact: true }).click()
  k = await kasten()
  const cx = k.x + 250
  const cy = k.y + 150
  await seite.mouse.move(cx, cy)
  await seite.mouse.down()
  await seite.mouse.move(cx + 9, cy, { steps: 3 })
  await seite.mouse.up()
  await seite.getByRole('dialog', { name: 'Beschriftung' }).getByRole('button', { name: 'Überspringen' }).click()
  await seite.getByRole('button', { name: 'Rechteck', exact: true }).click()
  await seite.getByRole('button', { name: 'Einrasten' }).click() // ohne Einrasten, damit der Kreis nicht verschoben wird
  await seite.mouse.move(cx - 60, cy - 50)
  await seite.mouse.down()
  await seite.mouse.move(cx + 80, cy + 70, { steps: 5 })
  await seite.mouse.up()
  await seite.getByRole('button', { name: 'Auswählen' }).click()
  const auswahlZeile = seite.locator('.skizze-auswahl')
  await seite.mouse.click(k.x + k.width - 8, k.y + 8) // leere Stelle: nichts gewählt
  pruefe(/Nichts ausgewählt/.test(await auswahlZeile.innerText()), 'Auswahl: leere Stelle wählt nichts')
  await seite.mouse.click(cx, cy)
  pruefe(/Ausgewählt: Kreis/.test(await auswahlZeile.innerText()), 'Auswahl: kleiner Kreis unter dem großen Rechteck wird zuerst gewählt')
  const stapelText = await auswahlZeile.innerText()
  const stapelAnzahl = +(/1 von (\d+) hier/.exec(stapelText)?.[1] ?? 0)
  pruefe(stapelAnzahl >= 3, `Auswahl: Zeile nennt die Zahl der Formen an der Stelle (${stapelAnzahl})`)
  await seite.mouse.click(cx, cy)
  pruefe(/Ausgewählt: Rechteck/.test(await auswahlZeile.innerText()) && /2 von \d+/.test(await auswahlZeile.innerText()), 'Auswahl: erneutes Antippen wechselt zur Form darunter')
  for (let i = 2; i <= stapelAnzahl; i++) await seite.mouse.click(cx, cy)
  pruefe(/Ausgewählt: Kreis/.test(await auswahlZeile.innerText()), 'Auswahl: nach der letzten Form beginnt es von vorn')
  // Greiffläche: 20 px neben dem kleinen Kreis (Radius ≈ 9 px) trifft ihn mit dem Finger, mit der Maus nicht
  await seite.mouse.click(k.x + k.width - 8, k.y + 8)
  await seite.mouse.click(cx + 20, cy)
  pruefe(/Ausgewählt: Rechteck/.test(await auswahlZeile.innerText()), 'Auswahl: Maus 20 px neben dem kleinen Kreis trifft ihn nicht')
  await seite.mouse.click(k.x + k.width - 8, k.y + 8)
  await beruehrung('touchStart', [[cx + 20, cy]])
  await beruehrung('touchEnd', [])
  pruefe(/Ausgewählt: Kreis/.test(await auswahlZeile.innerText()), 'Auswahl: Fingerberührung 20 px daneben trifft den kleinen Kreis (größere Greiffläche)')
  // Ziehen nach Auswahl: ein einziger Rückgängig-Schritt, Form wandert
  const kreisX = () => seite.locator('.skizze-flaeche svg > g > circle[r]').first().getAttribute('cx')
  const kreisVorher = +(await kreisX())
  await seite.mouse.move(cx, cy)
  await seite.mouse.down()
  await seite.mouse.move(cx + 30, cy + 10, { steps: 8 })
  await seite.mouse.up()
  pruefe(Math.abs(+(await kreisX()) - kreisVorher) > 30, 'Auswahl: gewählte Form lässt sich verschieben')
  await seite.getByRole('button', { name: 'Rückgängig' }).click()
  pruefe(Math.abs(+(await kreisX()) - kreisVorher) < 0.001, 'Auswahl: Verschieben ist ein einziger Rückgängig-Schritt')

  // 11. WEP-Liste hat keinen Löschen-Knopf; Status sichtbar
  const liste = seite.getByRole('list', { name: 'Protokolle' })
  await seite.getByRole('button', { name: 'Protokolle' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe((await seite.getByRole('button', { name: /löschen/i }).count()) === 0, 'WEP-Liste ohne Löschen-Knopf')
  await anzahlEintraege(liste, 1)
  pruefe(await liste.getByText('Exportiert', { exact: true }).isVisible(), 'Liste zeigt den Status „Exportiert“')

  // 11b. Status zurücksetzen und manuell auf „fertig“ setzen
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  pruefe((await seite.getByRole('menuitem', { name: /Duplizieren/ }).count()) === 1, 'Menü „⋯“ bietet „Duplizieren“')
  await seite.getByRole('menuitem', { name: /Zurück auf „In Arbeit“/ }).click()
  pruefe(await seite.getByText('KGA Musterwiese · Grün · in Arbeit').isVisible(), 'Status lässt sich auf „in Arbeit“ zurücksetzen')
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /Als fertig markieren/ }).click()
  pruefe(await seite.getByText('KGA Musterwiese · Grün · fertig').isVisible(), 'Status lässt sich manuell auf „fertig“ setzen')

  // 11c. Duplizieren: öffnet die Kopie mit allen Daten, neuer Vorgangs-Nr., Status „in Arbeit“
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /Duplizieren/ }).click()
  await seite.getByText('KGA Musterwiese · Grün · in Arbeit').waitFor()
  const jahr = new Date().getFullYear()
  pruefe((await seite.getByLabel('Vorgangs-Nr.').inputValue()) === `${jahr}-002`, 'Kopie hat neue Vorgangs-Nr.')
  pruefe((await seite.getByLabel('Parzelle', { exact: true }).inputValue()) === 'Parzelle 42', 'Kopie enthält die Formalien')
  await nav.getByRole('button', { name: 'Aufwuchs' }).click()
  pruefe(await seite.getByText('2 Positionen').isVisible(), 'Kopie enthält die Positionen')

  // 11d. Liste nach Status filtern
  await seite.getByRole('button', { name: 'Protokolle' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await anzahlEintraege(liste, 2), 'Liste zeigt Original und Kopie')
  const filter = seite.getByRole('group', { name: 'Nach Status filtern' })
  await filter.getByRole('button', { name: 'Fertig' }).click()
  pruefe((await anzahlEintraege(liste, 1)) && (await liste.getByText('Fertig', { exact: true }).isVisible()), 'Filter „Fertig“ zeigt nur das Original')
  await filter.getByRole('button', { name: 'In Arbeit' }).click()
  pruefe((await anzahlEintraege(liste, 1)) && (await liste.getByText(`${jahr}-002`).count()) === 1, 'Filter „In Arbeit“ zeigt nur die Kopie')
  await filter.getByRole('button', { name: 'Exportiert' }).click()
  pruefe(await seite.getByText(/Kein Protokoll „exportiert“/).isVisible(), 'Filter ohne Treffer zeigt einen Hinweis')
  await filter.getByRole('button', { name: 'Alle' }).click()

  // 11e. Löschen über „⋯“ mit Rückfrage: das WEP kommt in den Papierkorb (Kopie und Original)
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).first().click()
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /In den Papierkorb/ }).click()
  await seite.getByRole('alertdialog').waitFor()
  pruefe(await seite.getByRole('alertdialog').getByText(/30 Tage lang im Papierkorb/).isVisible(), 'Rückfrage erklärt den Papierkorb')
  await seite.getByRole('button', { name: 'Abbrechen' }).click()
  pruefe((await seite.getByRole('alertdialog').count()) === 0, 'Rückfrage „Abbrechen“ löscht nicht')
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /In den Papierkorb/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'In den Papierkorb' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await anzahlEintraege(liste, 1), 'gelöschtes WEP ist aus der Liste verschwunden')
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /In den Papierkorb/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'In den Papierkorb' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await seite.getByText(/Noch kein Protokoll/).isVisible(), 'WEPs nach Rückfrage in den Papierkorb gelegt')
  pruefe(await seite.getByText('2 gelöschte Protokolle').isVisible(), 'Liste zeigt „2 gelöschte Protokolle“')

  // 11f. Papierkorb: Liste, Wiederherstellen, Endgültig löschen mit Rückfrage
  await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button', { name: /Papierkorb/ }).click()
  await seite.locator('.kopf-titel', { hasText: 'Papierkorb' }).waitFor()
  const korb = seite.getByRole('list', { name: 'Papierkorb' })
  pruefe(await anzahlEintraege(korb, 2), 'Papierkorb zeigt beide gelöschten WEPs')
  pruefe(await korb.getByText(/noch 30 Tage/).first().isVisible(), 'Papierkorb nennt die verbleibende Frist')
  await seite.screenshot({ path: 'dist-e2e/papierkorb.png' })
  await korb.getByRole('listitem').first().getByRole('button', { name: 'Endgültig löschen' }).click()
  await seite.getByRole('alertdialog').waitFor()
  await seite.getByRole('button', { name: 'Abbrechen' }).click()
  pruefe(await anzahlEintraege(korb, 2), '„Endgültig löschen“ ohne Bestätigung löscht nichts')
  await korb.getByRole('listitem').first().getByRole('button', { name: 'Endgültig löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Endgültig löschen' }).click()
  pruefe(await anzahlEintraege(korb, 1), '„Endgültig löschen“ entfernt den Eintrag')
  await korb.getByRole('button', { name: 'Wiederherstellen' }).click()
  await seite.getByLabel('Vorgangs-Nr.').waitFor()
  pruefe(/^\d{4}-00[12]$/.test(await seite.getByLabel('Vorgangs-Nr.').inputValue()), 'Wiederhergestelltes WEP öffnet sich')
  await seite.getByRole('button', { name: 'Protokolle' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await anzahlEintraege(liste, 1), 'wiederhergestelltes WEP steht wieder in der Liste')
  pruefe(await seite.getByText('leer', { exact: true }).isVisible(), 'Papierkorb ist danach leer (eins endgültig gelöscht, eins wiederhergestellt)')

  // 11f3. Fotos (Paket 4): selbst erzeugte Testbilder, Verkleinern, Standortdaten, Position, Löschen, Export, Papierkorb
  const idbLies = (store) =>
    seite.evaluate(
      (name) =>
        new Promise((ok, fehler) => {
          const a = indexedDB.open('wep-db')
          a.onerror = fehler
          a.onsuccess = () => {
            const r = a.result.transaction(name).objectStore(name).getAll()
            r.onsuccess = () => {
              a.result.close()
              ok(r.result.map((x) => ({ key: x.key, wepId: x.wepId, id: x.id, hatDatei: x.hatDatei, hochgeladen: x.hochgeladen, geloescht: x.geloescht, vorschau: !!x.vorschau })))
            }
          }
        }),
      store,
    )
  /** Prüft die Datei eines Fotos in IndexedDB: Größe, Maße, JPEG, keine Metadaten. */
  const fotoDatei = (key, marker) =>
    seite.evaluate(
      async ({ key, marker }) => {
        const db = await new Promise((ok, fehler) => {
          const a = indexedDB.open('wep-db')
          a.onsuccess = () => ok(a.result)
          a.onerror = fehler
        })
        const eintrag = await new Promise((ok) => {
          const r = db.transaction('fotoDaten').objectStore('fotoDaten').get(key)
          r.onsuccess = () => ok(r.result)
        })
        db.close()
        const bytes = new Uint8Array(await eintrag.blob.arrayBuffer())
        const text = new TextDecoder('latin1').decode(bytes)
        const bild = await createImageBitmap(eintrag.blob)
        return {
          groesse: bytes.length,
          jpeg: bytes[0] === 0xff && bytes[1] === 0xd8,
          exif: text.includes('Exif') || marker.some((m) => text.includes(m)),
          breite: bild.width,
          hoehe: bild.height,
        }
      },
      { key, marker },
    )

  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await nav.getByRole('button', { name: 'Fotos' }).click()
  await seite.getByRole('heading', { name: 'Fotos', exact: true }).waitFor()
  pruefe(await seite.getByText('0 Fotos').isVisible(), 'Fotos: noch keine Fotos')
  pruefe(await seite.getByRole('heading', { name: 'Gesamtansicht' }).isVisible(), 'Fotos: Gruppe „Gesamtansicht“')
  const gesamt = seite.getByRole('region', { name: /Gesamtansicht/ })
  // Hochformat-Foto (Ausrichtung 6, mit Kameramodell und GPS) aus der Galerie
  await seite.locator('input[type=file][aria-label="Fotos aus der Galerie wählen: Gesamtansicht"]').setInputFiles({
    name: 'IMG_0001.jpg',
    mimeType: 'image/jpeg',
    buffer: testFoto({ breite: 3000, hoehe: 2000, orientierung: 6, gps: true, variante: 0 }),
  })
  await gesamt.locator('.foto-kachel').first().waitFor({ timeout: 30000 })
  pruefe(await seite.getByText('1 Foto', { exact: true }).isVisible(), 'Fotos: Foto wird gezählt')
  const f1 = (await idbLies('fotos'))[0]
  const d1 = await fotoDatei(f1.key, [EXIF_GPS, EXIF_KAMERA])
  pruefe(d1.jpeg && d1.groesse <= 500 * 1024, `Foto ist JPEG und unter 500 KB (${Math.round(d1.groesse / 1024)} KB)`)
  pruefe(d1.hoehe === 2000 && d1.breite === 1333, `Ausrichtung korrigiert (Hochformat 1333 × 2000, ist ${d1.breite} × ${d1.hoehe})`)
  pruefe(!d1.exif, 'Standortdaten und Kameramodell sind entfernt')
  pruefe(f1.vorschau && f1.hatDatei && f1.hochgeladen === false, 'Vorschaubild gespeichert, Foto wartet auf den Upload')

  // Kamera: ein Querformat-Foto zu einer Position (Aufwuchs → Position antippen → Fotos zu dieser Position)
  await nav.getByRole('button', { name: 'Aufwuchs' }).click()
  await seite.getByRole('row', { name: /Apfel, Halbstamm/ }).click()
  await seite.getByRole('heading', { name: 'Fotos zu dieser Position' }).waitFor()
  await seite.locator('input[type=file][capture]').setInputFiles({
    name: 'IMG_0002.jpg',
    mimeType: 'image/jpeg',
    buffer: testFoto({ breite: 2400, hoehe: 1600, variante: 1 }),
  })
  await seite.locator('.foto-kachel').first().waitFor({ timeout: 30000 })
  pruefe((await seite.locator('.foto-kachel').count()) === 1, 'Position: Foto aufgenommen')
  await seite.getByRole('button', { name: 'Abbrechen' }).filter({ visible: true }).first().click()
  await nav.getByRole('button', { name: 'Fotos' }).click()
  await seite.getByRole('heading', { name: /^01 Apfel, Halbstamm/ }).waitFor()
  pruefe(await seite.getByText('2 Fotos', { exact: true }).isVisible(), 'Fotos: Gesamtansicht + Position = 2 Fotos')
  pruefe(await seite.getByRole('heading', { name: /^01 Apfel, Halbstamm/ }).isVisible(), 'Fotos: Gruppe mit Positionsnummer')
  await seite.screenshot({ path: 'dist-e2e/fotos.png' })

  // Zweite Position über die Auswahl, mehrere Fotos auf einmal
  await seite.getByLabel('Position wählen').selectOption({ label: '02 Rasen' })
  await seite.locator('input[type=file][aria-label="Fotos aus der Galerie wählen: 02 Rasen"]').setInputFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: testFoto({ breite: 1800, hoehe: 1200, variante: 2 }) },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: testFoto({ breite: 1800, hoehe: 1200, variante: 0 }) },
  ])
  await seite.getByRole('region', { name: /02 Rasen/ }).locator('.foto-kachel').nth(1).waitFor({ timeout: 30000 })
  pruefe(await seite.getByText('4 Fotos', { exact: true }).isVisible(), 'Fotos: mehrere Fotos auf einmal')

  // Großansicht: Text zum Foto, Schließen; Löschen mit Rückfrage
  await gesamt.locator('.foto-kachel').first().click()
  await seite.getByRole('dialog', { name: /Foto 1 von 1/ }).waitFor()
  await seite.getByLabel('Text zum Foto (optional)').fill('Gesamtansicht Süd')
  await seite.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click()
  pruefe(await gesamt.getByText('Gesamtansicht Süd').isVisible(), 'Text zum Foto steht unter der Vorschau')
  await seite.getByRole('region', { name: /02 Rasen/ }).locator('.foto-kachel').first().click()
  await seite.getByRole('dialog', { name: /Foto 1 von 2/ }).waitFor()
  await seite.getByRole('button', { name: 'Foto löschen' }).click()
  await seite.getByRole('alertdialog').waitFor()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
  pruefe(await seite.getByText('4 Fotos', { exact: true }).isVisible(), 'Foto löschen: „Abbrechen“ löscht nicht')
  await seite.getByRole('button', { name: 'Foto löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Foto löschen' }).click()
  await seite.getByText('3 Fotos', { exact: true }).waitFor()
  for (let i = 0; i < 30 && (await idbLies('fotos')).length !== 3; i++) await new Promise((r) => setTimeout(r, 100))
  pruefe((await idbLies('fotos')).length === 3, 'Gelöschtes Foto ist auch aus dem lokalen Speicher weg')
  await seite.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click()

  // Export: ohne Konto kommen die Fotos als ZIP neben der Excel-Datei
  const downloads = []
  seite.on('download', (d) => downloads.push(d))
  await seite.getByRole('button', { name: 'Export', exact: true }).click()
  await seite.getByRole('button', { name: 'Excel exportieren' }).click()
  await seite.getByText(/als ZIP heruntergeladen/).waitFor({ timeout: 30000 })
  const zipDatei = downloads.find((d) => d.suggestedFilename().endsWith('_Fotos.zip'))
  pruefe(!!zipDatei && downloads.some((d) => d.suggestedFilename().endsWith('_WEP.xlsx')), 'Export: Excel und Foto-ZIP werden heruntergeladen')
  const zip = await JSZip.loadAsync(readFileSync(await zipDatei.path()))
  const namen = Object.keys(zip.files).sort()
  pruefe(
    namen.length === 3 &&
      namen[0] === '00 Gesamtansicht 1.jpg' &&
      namen[1] === '01 Apfel, Halbstamm, 5–30 J.jpg' &&
      namen[2].startsWith('02 Rasen'),
    `Export: sprechende Dateinamen mit Positionsnummer (${namen.join(' | ')})`,
  )

  // Papierkorb nimmt die Fotos mit; Wiederherstellen bringt sie zurück
  await seite.getByRole('button', { name: 'Protokolle' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /In den Papierkorb/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'In den Papierkorb' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe((await idbLies('fotos')).length === 3, 'Papierkorb: die Fotos bleiben erhalten (30 Tage)')
  await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button', { name: /Papierkorb/ }).click()
  await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button', { name: 'Wiederherstellen' }).click()
  await seite.getByLabel('Vorgangs-Nr.').waitFor()
  await nav.getByRole('button', { name: 'Fotos' }).click()
  await seite.getByText('3 Fotos', { exact: true }).waitFor()
  // Die Vorschaubilder kommen asynchron aus IndexedDB, nach dem Text „3 Fotos“ (auf main schon so: Wettlauf)
  await seite.waitForFunction(() => document.querySelectorAll('.foto-kachel img').length === 3, undefined, { timeout: 10000 }).catch(() => undefined)
  pruefe((await seite.locator('.foto-kachel img').count()) === 3, 'Wiederherstellen: alle Fotos mit Vorschau wieder da')

  // Duplizieren kopiert die Fotos nicht
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /Duplizieren/ }).click()
  await seite.getByText('KGA Musterwiese · Grün · in Arbeit').waitFor()
  await nav.getByRole('button', { name: 'Fotos' }).click()
  await seite.getByText('0 Fotos', { exact: true }).waitFor()
  pruefe(true, 'Duplizieren: die Kopie hat keine Fotos')
  await seite.locator('input[type=file][aria-label="Fotos aus der Galerie wählen: Gesamtansicht"]').setInputFiles({
    name: 'kopie.jpg',
    mimeType: 'image/jpeg',
    buffer: testFoto({ breite: 1600, hoehe: 1000, variante: 1 }),
  })
  await seite.getByText('1 Foto', { exact: true }).waitFor({ timeout: 30000 })
  pruefe((await idbLies('fotos')).length === 4, 'Kopie hat ein eigenes Foto, das Original behält seine drei')

  // Endgültig löschen entfernt die Fotos der Kopie, die des Originals bleiben
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /In den Papierkorb/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'In den Papierkorb' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button', { name: /Papierkorb/ }).click()
  await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button', { name: 'Endgültig löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Endgültig löschen' }).click()
  await seite.getByText('Der Papierkorb ist leer').waitFor()
  const uebrig = await idbLies('fotos')
  pruefe(uebrig.length === 3 && uebrig.every((r) => r.wepId === f1.wepId), 'Endgültig löschen: Fotos der Kopie weg, die des Originals bleiben')
  pruefe((await idbLies('fotoDaten')).length === 3, 'Endgültig löschen: auch die Bilddateien sind weg')
  await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()

  // 11f2. Profil: eigene Positionen ändern und löschen
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  await seite.getByRole('heading', { name: 'Eigene Positionen' }).waitFor()
  pruefe(await seite.getByText(/Aufwuchs · Stück · 40,00/).isVisible(), 'Profil listet die gemerkte Position mit Abschnitt, Einheit und Preis')
  pruefe((await seite.getByText('Einmalpflanze').count()) === 0, 'Profil: nicht gemerkte Position fehlt')
  await seite.getByRole('button', { name: 'Zaubernuss ändern' }).click()
  await seite.getByRole('dialog', { name: 'Eigene Position ändern' }).waitFor()
  await seite.getByRole('dialog').getByLabel('Bezeichnung').fill('Zaubernuss, jung')
  await seite.getByRole('dialog').getByLabel(/^Einzelpreis/).fill('48,50')
  await seite.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click()
  pruefe(await seite.getByText(/Zaubernuss, jung/).isVisible() && (await seite.getByText(/48,50/).count()) > 0, 'Profil: geänderte Position mit neuem Preis')
  await seite.reload()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  pruefe(await seite.getByRole('button', { name: 'Zaubernuss, jung ändern' }).isVisible(), 'Eigene Positionen bleiben nach Neuladen erhalten')
  await seite.getByRole('button', { name: 'Zaubernuss, jung löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
  pruefe(await seite.getByRole('button', { name: 'Zaubernuss, jung ändern' }).isVisible(), 'Löschen: „Abbrechen“ löscht nicht')
  await seite.getByRole('button', { name: 'Zaubernuss, jung löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
  pruefe(await seite.getByText(/Noch keine/).isVisible(), 'Profil: gelöschte eigene Position ist weg')
  await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()

  // 11g. Zustand der Datenbank (Version 6)
  const verspaetet = await seite.evaluate(async () => {
    const db = await new Promise((ok, fehler) => {
      const a = indexedDB.open('wep-db')
      a.onsuccess = () => ok(a.result)
      a.onerror = fehler
    })
    const lies = (store) =>
      new Promise((ok) => {
        const r = db.transaction(store).objectStore(store).getAll()
        r.onsuccess = () => ok(r.result)
      })
    return { weps: (await lies('weps')).length, korb: (await lies('papierkorb')).length, version: db.version }
  })
  pruefe(verspaetet.weps === 1 && verspaetet.korb === 0 && verspaetet.version === 6, 'Datenbank Version 6: 1 WEP, Papierkorb leer')

  // 11h. Umstieg der Datenbank (Version 3 → 6): die Beta-Marke „gelöscht“ bekommt einen Löschzeitpunkt, Stores für Fotos und Bau-Excel entstehen
  const alt = await kontext.browser().newContext({ serviceWorkers: 'block' })
  const altSeite = await alt.newPage()
  // Eine Seite ohne App-Code (keine offene Datenbankverbindung): nur der gleiche Ursprung
  await altSeite.goto(`${URL}favicon.svg`)
  await altSeite.evaluate(
    () =>
      new Promise((ok, fehler) => {
        // Datenbank wie in Version 3 (ohne Papierkorb) neu aufbauen
        const l = indexedDB.deleteDatabase('wep-db')
        l.onerror = fehler
        l.onblocked = () => undefined
        l.onsuccess = () => {
          const a = indexedDB.open('wep-db', 3)
          a.onupgradeneeded = () => {
            a.result.createObjectStore('weps', { keyPath: 'id' })
            a.result.createObjectStore('syncMeta', { keyPath: 'id' })
            a.result.createObjectStore('exporte', { keyPath: 'name' })
          }
          a.onerror = fehler
          a.onsuccess = () => {
            const tx = a.result.transaction('syncMeta', 'readwrite')
            tx.objectStore('syncMeta').put({ id: '2026-009', lokalGeaendertAm: '2026-10-01T10:00:00.000Z', geloescht: true })
            tx.objectStore('syncMeta').put({ id: '2026-010', lokalGeaendertAm: '2026-10-01T10:00:00.000Z', geloescht: false })
            tx.oncomplete = () => {
              a.result.close()
              ok(undefined)
            }
            tx.onerror = fehler
          }
        }
      }),
  )
  // „Ohne Konto“ vorgeben und die App starten: Die Datenbank wird auf Version 6 umgestellt
  await altSeite.evaluate(() => localStorage.setItem('wep-start-wahl', 'ohne-konto'))
  await altSeite.goto(URL)
  await altSeite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  const migriert = await altSeite.evaluate(
    () =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const r = a.result.transaction('syncMeta').objectStore('syncMeta').getAll()
          r.onsuccess = () => ok({ version: a.result.version, stores: [...a.result.objectStoreNames], meta: r.result })
        }
      }),
  )
  const m9 = migriert.meta.find((m) => m.id === '2026-009')
  const m10 = migriert.meta.find((m) => m.id === '2026-010')
  pruefe(
    migriert.version === 6 &&
      ['papierkorb', 'fotos', 'fotoDaten', 'bauExcel', 'bauExcelDaten'].every((n) => migriert.stores.includes(n)),
    'Umstieg: Datenbank hat Version 6 mit Papierkorb, Fotos und Bau-Excel',
  )
  pruefe(m9?.geloescht === true && typeof m9.geloeschtAm === 'string', 'Umstieg: alte „gelöscht“-Marke bekommt einen Löschzeitpunkt')
  pruefe(m10?.geloeschtAm === undefined, 'Umstieg: andere Einträge bleiben unverändert')
  await alt.close()

  // 11i. Neues WEP aus Bau-Excel: Datei prüfen, WEP anlegen, Formalien vorbefüllen
  const neuEingabe = seite.getByTestId('neu-bau-excel-eingabe')
  const keinExcel = join(bauOrdner, 'kein-excel.xlsx')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(keinExcel, 'das ist kein Excel')
  await neuEingabe.setInputFiles(keinExcel)
  await seite.getByText(/nicht als Excel-Datei/).waitFor()
  pruefe(await anzahlEintraege(seite.getByRole('list', { name: 'Protokolle' }), 1), 'Neues WEP aus Bau-Excel: unbrauchbare Datei legt kein WEP an')
  await neuEingabe.setInputFiles(bauDatei)
  await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
  pruefe((await seite.getByLabel('Parzelle', { exact: true }).inputValue()) === 'Parzelle 42', 'Neues WEP aus Bau-Excel: Parzelle aus der Datei')
  pruefe((await seite.getByLabel(/^Weg/).inputValue()) === 'Rosenweg', 'Neues WEP aus Bau-Excel: Weg aus der Datei')
  pruefe(await seite.getByText(/WEP Bau Testgarten\.xlsx/).first().isVisible(), 'Neues WEP aus Bau-Excel: Datei bleibt am WEP')
  pruefe(await seite.getByText(/Angaben für die Formalien, die noch nicht abgeglichen sind/).isVisible(), 'Neues WEP aus Bau-Excel: Abweichung zum Profil wird zum Abgleich angeboten')

  // Papierkorb nimmt die Bau-Excel mit; endgültig löschen entfernt sie von diesem Gerät
  pruefe((await idbLies('bauExcel')).length === 1 && (await idbLies('bauExcel'))[0].hatDatei === true, 'Bau-Excel: Datei liegt lokal (IndexedDB)')
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /In den Papierkorb/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'In den Papierkorb' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe((await idbLies('bauExcel')).length === 1, 'Papierkorb: die Bau-Excel bleibt erhalten (30 Tage)')
  await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button', { name: /Papierkorb/ }).click()
  await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button', { name: 'Endgültig löschen' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Endgültig löschen' }).click()
  for (let i = 0; i < 50 && (await idbLies('bauExcel')).length > 0; i++) await new Promise((r) => setTimeout(r, 100))
  pruefe((await idbLies('bauExcel')).length === 0, 'Endgültig löschen: die Bau-Excel ist von diesem Gerät weg')

  // 13. Paket 6: Suche und Sortierung in der Liste, Problempflanzen, Sicherung als Datei, Sonnen-Kontrast
  await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  const liste6 = seite.getByRole('list', { name: 'Protokolle' })
  pruefe(await anzahlEintraege(liste6, 1), 'Paket 6: ein älteres Protokoll ist vorhanden')
  const vorhanden6 = 1
  async function neuesWep6(anlage, parzelle, paechter) {
    await seite.getByRole('button', { name: 'Neues WEP', exact: true }).click()
    await seite.getByLabel(/Kleingartenanlage/).first().waitFor()
    await seite.getByLabel(/Kleingartenanlage/).first().fill(anlage)
    await seite.getByLabel('Parzelle', { exact: true }).fill(parzelle)
    await seite.getByLabel('Unterpächter', { exact: true }).fill(paechter)
    await seite.waitForTimeout(700) // Speichern ist entprellt, beim Verlassen sofort
    await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  }
  await neuesWep6('KGA Seeblick', 'Parzelle 7', 'Hans Beispiel')
  await neuesWep6('KGA Hügelblick', 'Parzelle 31', 'Familie Probe')
  pruefe(await anzahlEintraege(liste6, vorhanden6 + 2), 'Suche: Liste mit den Testprotokollen')
  const suche = seite.getByRole('searchbox', { name: 'Protokolle durchsuchen' })
  await suche.fill('seeblick')
  pruefe(await anzahlEintraege(liste6, 1), 'Suche nach Anlage findet genau ein Protokoll')
  pruefe((await seite.getByTestId('listen-anzahl').innerText()).includes('1 von'), 'Suche: Zähler „1 von n Protokollen“')
  await suche.fill('HUEGELBLICK')
  pruefe((await anzahlEintraege(liste6, 1)) && (await liste6.getByText(/Hügelblick/).count()) === 1, 'Suche ignoriert Groß-/Kleinschreibung und Umlaute')
  await suche.fill('familie probe')
  pruefe(await anzahlEintraege(liste6, 1), 'Suche nach Pächter, mehrere Wörter')
  await suche.fill('parzelle')
  pruefe(await anzahlEintraege(liste6, vorhanden6 + 2), 'Suche nach „Parzelle“ findet alle drei Protokolle')
  await seite.getByRole('group', { name: 'Nach Status filtern' }).getByRole('button', { name: 'Fertig' }).click()
  pruefe(await seite.getByText(/Kein Protokoll zu „parzelle“/).isVisible(), 'Suche zusammen mit Status-Filter: ohne Treffer ein Hinweis')
  await seite.getByRole('group', { name: 'Nach Status filtern' }).getByRole('button', { name: 'Alle' }).click()
  await suche.fill('nirgendwo')
  pruefe(await seite.getByText(/Kein Protokoll zu „nirgendwo“/).isVisible(), 'Suche ohne Treffer zeigt einen Hinweis')
  await seite.getByRole('button', { name: 'Suche leeren' }).click()
  pruefe(await anzahlEintraege(liste6, vorhanden6 + 2), 'Suche leeren zeigt wieder alle')
  const sortierung = seite.getByRole('group', { name: 'Sortierung' })
  pruefe(await sortierung.getByRole('button', { name: 'Zuletzt geändert' }).getAttribute('aria-pressed') === 'true', 'Sortierung: Standard „Zuletzt geändert“')
  const ersterTitel = async () => (await liste6.getByRole('listitem').first().innerText()).replace(/\s+/g, ' ')
  pruefe((await ersterTitel()).includes('Hügelblick'), 'Zuletzt geändert: das zuletzt angelegte Protokoll steht oben')
  await sortierung.getByRole('button', { name: 'Nummer' }).click()
  pruefe((await ersterTitel()).includes('Hügelblick'), 'Nummer: höchste Nummer oben')

  // Problempflanzen: nur warnen, Vorschlag „Beseitigung“ vorbelegt
  await liste6.getByRole('button', { name: /Seeblick/ }).click()
  await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Aufwuchs' }).click()
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByRole('button', { name: 'Eigene Position (Freitext)' }).click()
  await seite.getByLabel(/^Bezeichnung/).fill('Japanischer Staudenknöterich')
  await seite.getByLabel('Anzahl').fill('3')
  pruefe(await seite.getByText(/Staudenknöterich.*gilt als problematisch/).isVisible(), 'Problempflanze: Warnung schon im Formular')
  pruefe((await seite.getByRole('button', { name: 'Zur Beseitigung' }).count()) === 0, 'Problempflanze: im Formular kein Knopf (noch nichts gespeichert)')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByRole('row', { name: /Staudenknöterich/ }).waitFor()
  pruefe(await seite.getByText('1 Position').isVisible(), 'Problempflanze: die Position lässt sich trotz Warnung speichern (nichts gesperrt)')
  await seite.getByRole('button', { name: 'Zur Beseitigung' }).click()
  await seite.getByLabel(/^Gegenstand/).waitFor()
  pruefe((await seite.getByLabel(/^Gegenstand/).inputValue()) === 'Japanischer Staudenknöterich', 'Problempflanze: Beseitigung mit dem Gegenstand vorbelegt')
  pruefe((await seite.getByLabel(/^Menge/).inputValue()) === '3', 'Problempflanze: Beseitigung mit der Menge vorbelegt')
  await seite.getByLabel(/^Einzelpreis/).fill('50')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByText(/Japanischer Staudenknöterich/).first().waitFor()
  await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Aufwuchs' }).click()
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByRole('button', { name: 'Eigene Position (Freitext)' }).click()
  await seite.getByLabel(/^Bezeichnung/).fill('Blaufichte')
  pruefe(await seite.getByText(/muss entfernt werden/).isVisible(), 'Nadelgehölz (Richtlinie S. 17): Warnung „muss entfernt werden“')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByRole('row', { name: /Blaufichte/ }).waitFor()
  await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()

  // Sicherung: erstellen (Download), ändern, einspielen mit Vorschau
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  await seite.getByRole('heading', { name: 'Sicherung' }).waitFor()
  pruefe(await seite.getByText(/noch keine Sicherung erstellt/).isVisible(), 'Sicherung: noch keine erstellt')
  const [download] = await Promise.all([
    seite.waitForEvent('download'),
    seite.getByRole('button', { name: 'Sicherung erstellen' }).click(),
  ])
  const sicherungsPfad = join(bauOrdner, 'sicherung.zip')
  await download.saveAs(sicherungsPfad)
  pruefe(/^WEP-Sicherung_\d{4}-\d{2}-\d{2}\.zip$/.test(download.suggestedFilename()), 'Sicherung: Dateiname mit Datum')
  const zip6 = await JSZip.loadAsync(readFileSync(sicherungsPfad))
  const inhalt6 = JSON.parse(await zip6.file('sicherung.json').async('string'))
  pruefe(inhalt6.format === 'wep-sicherung/1' && inhalt6.weps.length === vorhanden6 + 2, 'Sicherung: ZIP enthält alle WEPs')
  pruefe(inhalt6.profil.profil.name === 'Erika Musterfrau', 'Sicherung: Profil ist enthalten')
  await seite.getByText(/Sicherung WEP-Sicherung_.*erstellt/).waitFor()
  pruefe(await seite.getByText(/Letzte Sicherung auf diesem Gerät/).isVisible(), 'Sicherung: letzte Sicherung wird angezeigt')

  // Zustand ändern: „Hügelblick“ umbenennen, „Seeblick“ in den Papierkorb
  await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await liste6.getByRole('button', { name: /Hügelblick/ }).click()
  await seite.getByLabel('Parzelle', { exact: true }).fill('Parzelle 99')
  await seite.waitForTimeout(700)
  await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await liste6.getByRole('button', { name: /Seeblick/ }).click()
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /In den Papierkorb/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'In den Papierkorb' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await anzahlEintraege(liste6, vorhanden6 + 1), 'Sicherung: Seeblick liegt im Papierkorb')

  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  await seite.getByRole('heading', { name: 'Sicherung' }).waitFor()
  await seite.getByTestId('sicherung-eingabe').setInputFiles(sicherungsPfad)
  await seite.getByRole('region', { name: 'Vorschau der Sicherung' }).waitFor()
  const vorschau6 = seite.getByRole('region', { name: 'Vorschau der Sicherung' })
  pruefe(await vorschau6.getByText('Weicht ab', { exact: true }).count() >= 1, 'Einspielen: Vorschau zeigt „Weicht ab“ für das geänderte WEP')
  pruefe(await vorschau6.getByText('Im Papierkorb', { exact: true }).count() === 1, 'Einspielen: Vorschau zeigt das WEP im Papierkorb')
  pruefe(await vorschau6.getByRole('button', { name: /^Einspielen/ }).isDisabled(), 'Einspielen: ohne Auswahl ist „Einspielen“ gesperrt (nichts wird still überschrieben)')
  await seite.screenshot({ path: 'dist-e2e/sicherung-vorschau.png', fullPage: true })
  await vorschau6.getByLabel(/Entscheidung für .*Hügelblick/).selectOption('kopie')
  await vorschau6.getByRole('button', { name: /^Einspielen/ }).click()
  await seite.getByText(/Eingespielt: 1 WEP\./).waitFor()
  pruefe(true, 'Einspielen: als neues WEP angelegt')
  await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await anzahlEintraege(liste6, vorhanden6 + 2), 'Einspielen: Original und Kopie stehen in der Liste')
  pruefe((await liste6.getByText(/Parzelle 99/).count()) === 1 && (await liste6.getByText(/Parzelle 31/).count()) === 1, 'Einspielen: der Stand hier blieb, die Sicherung kam als Kopie dazu')

  // Zweites Einspielen derselben Sicherung: das Original ersetzen (ausdrücklich gewählt)
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  await seite.getByTestId('sicherung-eingabe').setInputFiles(sicherungsPfad)
  const vorschau6b = seite.getByRole('region', { name: 'Vorschau der Sicherung' })
  await vorschau6b.waitFor()
  await vorschau6b.getByLabel(/Entscheidung für .*Hügelblick/).selectOption('uebernehmen')
  await vorschau6b.getByRole('button', { name: /^Einspielen/ }).click()
  await seite.getByText(/Eingespielt: 1 WEP\./).waitFor()
  await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await anzahlEintraege(liste6, vorhanden6 + 2)
  pruefe((await liste6.getByText(/Parzelle 99/).count()) === 0 && (await liste6.getByText(/Parzelle 31/).count()) === 2, 'Einspielen: „Aus der Sicherung übernehmen“ ersetzt das WEP')

  // Falsche Datei: verständliche Meldung, nichts passiert
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  await seite.getByTestId('sicherung-eingabe').setInputFiles(keinExcel)
  await seite.getByText(/keine Sicherung der WEP-App/).waitFor()
  pruefe(true, 'Einspielen: eine fremde Datei wird mit einer Meldung abgelehnt')

  // Sonnen-Kontrast
  const hole = () => seite.evaluate(() => ({ kontrast: document.documentElement.dataset.kontrast, schrift: getComputedStyle(document.body).fontSize, rand: getComputedStyle(document.documentElement).getPropertyValue('--linie').trim() }))
  const normal = await hole()
  pruefe(normal.kontrast === undefined, 'Sonnen-Kontrast: standardmäßig aus')
  await seite.getByRole('switch', { name: 'Sonnen-Kontrast' }).click()
  const sonne = await hole()
  pruefe(sonne.kontrast === 'sonne' && parseInt(sonne.schrift) > parseInt(normal.schrift) && sonne.rand === '2px', 'Sonnen-Kontrast: Schalter wirkt sofort (größere Schrift, 2-px-Linien)')
  await seite.screenshot({ path: 'dist-e2e/profil-sonne.png' })
  await seite.reload()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe((await hole()).kontrast === 'sonne', 'Sonnen-Kontrast: bleibt nach Neuladen an')
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  pruefe(await seite.getByRole('switch', { name: 'Sonnen-Kontrast' }).isChecked(), 'Sonnen-Kontrast: Schalter zeigt den gespeicherten Stand')
  pruefe(await seite.getByLabel('Upload nur über WLAN').isChecked(), 'Sonnen-Kontrast: „nur WLAN“ bleibt unverändert an')
  await seite.getByRole('switch', { name: 'Sonnen-Kontrast' }).click()
  pruefe((await hole()).kontrast === undefined, 'Sonnen-Kontrast: lässt sich wieder ausschalten')

  // 11g. Beta 4, Paket 1: Rolle schaltet Reiter und Export frei (das Profil ist hier noch offen)
  await seite.getByLabel('Rolle').selectOption('bau')
  await seite.getByRole('button', { name: 'Protokolle' }).click()
  await seite.locator('.status-teil').first().waitFor()
  pruefe((await seite.locator('.status-teil-bau').count()) === 0, 'Rolle: bestehende WEPs bleiben Grün, auch nach einem Rollenwechsel im Profil')
  await seite.getByRole('button', { name: 'Neues WEP', exact: true }).click()
  await seite.getByLabel(/Kleingartenanlage/).first().waitFor()
  const rnav = seite.getByRole('navigation', { name: 'Abschnitte' })
  pruefe((await rnav.getByRole('button', { name: 'Baulichkeiten' }).count()) === 1 && (await rnav.getByRole('button', { name: 'Außenanlagen' }).count()) === 0, 'Rolle Bau: Bau-Reiter da, Grün-Reiter weg')
  pruefe((await seite.getByLabel('Wertermittler Baulichkeiten').inputValue()) === 'Erika Musterfrau', 'Rolle Bau: Name steht bei „Wertermittler Baulichkeiten“')
  await rnav.getByRole('button', { name: 'Mängel' }).click()
  pruefe(await seite.getByText('Kommt mit dem Bau-Teil').isVisible(), 'Rolle Bau: Reiter ist ein Platzhalter')
  await rnav.getByRole('button', { name: 'Formalien' }).click()
  await seite.getByLabel('Dieses WEP als Grün bearbeiten').check()
  pruefe((await rnav.getByRole('button', { name: 'Außenanlagen' }).count()) === 1 && (await rnav.getByRole('button', { name: 'Skizze Grün' }).count()) === 1, 'Dieses WEP auch als Grün: Grün-Reiter erscheinen')
  await seite.getByLabel('Dieses WEP als Bau bearbeiten').uncheck()
  pruefe((await rnav.getByRole('button', { name: 'Baulichkeiten' }).count()) === 0, 'Dieses WEP nur Grün: Bau-Reiter weg (Profil bleibt Bau)')
  await seite.getByLabel('Dieses WEP als Bau bearbeiten').check()
  await seite.getByLabel('Dieses WEP als Grün bearbeiten').uncheck()
  await seite.getByRole('button', { name: 'Export', exact: true }).click()
  pruefe((await seite.getByText(/Bau-Excel auswählen/).count()) === 0, 'Export Bau: kein Feld für die Bau-Excel')
  const rolleBauDownload = seite.waitForEvent('download')
  await seite.getByRole('button', { name: 'Excel exportieren' }).click()
  await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
  const rolleBauDatei = await rolleBauDownload
  pruefe(rolleBauDatei.suggestedFilename().endsWith('_WEP_Bau.xlsx'), 'Export Bau: Dateiname endet auf _WEP_Bau.xlsx')
  const rolleBauZip = await JSZip.loadAsync(readFileSync(await rolleBauDatei.path()))
  pruefe(!(await rolleBauZip.file('xl/worksheets/sheet5.xml').async('string')).includes('<is>'), 'Export Bau: Blatt Außenanlagen bleibt leer')
  await seite.getByRole('button', { name: 'Protokolle' }).click()
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  await seite.getByLabel('Rolle').selectOption('gruen')

  // 12. Keine Skriptfehler
  pruefe(fehler.length === 0, `keine Skriptfehler im Browser ${fehler.join('; ')}`)
  console.log('Durchlauf erfolgreich')
} finally {
  await browser?.close()
  server.kill()
}
