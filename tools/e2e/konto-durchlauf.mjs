// Durchlauf im echten Browser (Chromium): erster Start → „Ohne Konto fortfahren“ →
// WEP anlegen → Profil öffnen, Name speichern → neues WEP ist vorbelegt →
// Position über die Suche (Variante direkt im Treffer) hinzufügen, Preis überschreiben,
// Warnung und Summe → Position antippen, ändern und mit Rückfrage löschen (Richtlinie nur im
// Formular) → Beseitigung hinzufügen/ändern/löschen → Export mit Bau-Excel → Skizze-Werkzeugleiste
// und Dialoge → Status (exportiert nach Export, fertig, zurücksetzen, Filter in der Liste) →
// WEP duplizieren → WEPs über das Menü „⋯“ mit Rückfrage löschen.
//
// Start: npm run e2e  (baut mit einer Platzhalter-Client-ID nach dist-e2e/, damit der
// Login-Bildschirm erscheint; es wird nie wirklich bei Microsoft angemeldet).
// Chromium kommt aus PLAYWRIGHT_BROWSERS_PATH (vorinstalliert), nicht „playwright install“.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

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
  await seite.getByLabel('Rolle').selectOption('beides')
  pruefe(await seite.getByLabel('Upload nur über WLAN').isChecked(), 'Upload nur über WLAN ist standardmäßig an')
  pruefe(await seite.getByText(/Wirkt in der Android-App/).isVisible(), 'Hinweis „wirkt in der Android-App“')
  pruefe(await seite.getByText('Version', { exact: true }).isVisible(), 'App-Version wird angezeigt')
  pruefe(await seite.getByText(/Nicht angemeldet/).isVisible(), 'Konto: nicht angemeldet, Anmelden möglich')
  await seite.screenshot({ path: 'dist-e2e/profil.png' })
  await seite.getByRole('button', { name: 'Protokolle' }).click()

  // 5. WEP anlegen: Name und Anlage aus dem Profil sind vorbelegt
  await seite.getByRole('button', { name: /Neues WEP/ }).click()
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

  // 10d. Export: Bau-Excel wählen und entfernen, Export mit Ergebnis
  await seite.getByRole('button', { name: 'Export', exact: true }).click()
  await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
  await seite.locator('#bau-excel').setInputFiles('public/WEP_Vorlage.xlsx')
  pruefe(await seite.getByText('WEP_Vorlage.xlsx').isVisible(), 'Export: gewählte Bau-Excel wird angezeigt')
  await seite.getByRole('button', { name: 'Bau-Excel entfernen' }).click()
  pruefe(await seite.getByRole('button', { name: /Bau-Excel auswählen/ }).isVisible(), 'Export: Bau-Excel wieder entfernbar')
  await seite.getByRole('button', { name: 'Excel exportieren' }).click()
  await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
  pruefe(await seite.getByText(/Export erfolgreich/).isVisible(), 'Export: Ergebnis wird angezeigt')
  pruefe(await seite.getByText('KGA Musterwiese · exportiert').isVisible(), 'Status: nach dem Export automatisch „exportiert“')

  // 10e. Skizze: Werkzeugleiste mit Icons (≥ 48 px), Dialoge im neuen Stil
  await nav.getByRole('button', { name: 'Skizze' }).click()
  await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
  const kleinste = await seite.getByRole('toolbar').getByRole('button').evaluateAll((knoepfe) =>
    Math.min(...knoepfe.map((k) => Math.min(k.getBoundingClientRect().width, k.getBoundingClientRect().height))),
  )
  pruefe(kleinste >= 48, `Skizze: Werkzeug-Knöpfe mindestens 48 px (kleinster: ${kleinste} px)`)
  pruefe((await seite.getByRole('toolbar').locator('svg.lucide').count()) >= 10, 'Skizze: Werkzeuge sind lucide-Icons')
  const flaeche = await seite.locator('.skizze-flaeche svg').boundingBox()
  const zeichne = async (x1, y1, x2, y2) => {
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
  await seite.mouse.click(flaeche.x + 260, flaeche.y + 200)
  await seite.getByRole('dialog', { name: 'Beschriftung' }).waitFor()
  await seite.getByLabel(/^Baumart oder Name/).fill('Apfel')
  await seite.getByRole('button', { name: 'Übernehmen' }).click()
  pruefe(await seite.locator('.skizze-flaeche svg text', { hasText: 'Apfel' }).first().isVisible(), 'Skizze: Beschriftungs-Dialog (Baumart)')
  await seite.getByRole('button', { name: 'Text', exact: true }).click()
  await seite.mouse.click(flaeche.x + 300, flaeche.y + 300)
  await seite.getByRole('dialog', { name: 'Text einfügen' }).waitFor()
  await seite.keyboard.press('Escape')
  pruefe((await seite.getByRole('dialog').count()) === 0, 'Skizze: Escape schließt den Dialog')
  await seite.getByRole('button', { name: 'Rückgängig' }).click()
  pruefe((await seite.getByRole('main').getByText('Apfel').count()) === 0, 'Skizze: Rückgängig nimmt das Symbol zurück')

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
  pruefe(await seite.getByText('KGA Musterwiese · in Arbeit').isVisible(), 'Status lässt sich auf „in Arbeit“ zurücksetzen')
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /Als fertig markieren/ }).click()
  pruefe(await seite.getByText('KGA Musterwiese · fertig').isVisible(), 'Status lässt sich manuell auf „fertig“ setzen')

  // 11c. Duplizieren: öffnet die Kopie mit allen Daten, neuer Vorgangs-Nr., Status „in Arbeit“
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /Duplizieren/ }).click()
  await seite.getByText('KGA Musterwiese · in Arbeit').waitFor()
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

  // 11e. Löschen über „⋯“ mit Rückfrage (Kopie und Original)
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).first().click()
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /WEP löschen/ }).click()
  await seite.getByRole('alertdialog').waitFor()
  await seite.getByRole('button', { name: 'Abbrechen' }).click()
  pruefe((await seite.getByRole('alertdialog').count()) === 0, 'Rückfrage „Abbrechen“ löscht nicht')
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /WEP löschen/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /WEP löschen/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await seite.getByText(/Noch kein Protokoll/).isVisible(), 'WEPs nach Rückfrage gelöscht')

  // 12. Keine Skriptfehler
  pruefe(fehler.length === 0, `keine Skriptfehler im Browser ${fehler.join('; ')}`)
  console.log('Durchlauf erfolgreich')
} finally {
  await browser?.close()
  server.kill()
}
