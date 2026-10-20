// Durchlauf im echten Browser (Chromium): erster Start → „Ohne Konto fortfahren“ →
// WEP anlegen → Profil öffnen, Name speichern → neues WEP ist vorbelegt →
// Position über die Suche (Variante direkt im Treffer) hinzufügen, Preis überschreiben,
// Warnung und Summe → WEP über das Menü „⋯“ mit Rückfrage löschen.
//
// Start: npm run e2e  (baut mit einer Platzhalter-Client-ID nach dist-e2e/, damit der
// Login-Bildschirm erscheint; es wird nie wirklich bei Microsoft angemeldet).
// Chromium kommt aus PLAYWRIGHT_BROWSERS_PATH (vorinstalliert), nicht „playwright install“.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
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
  await seite.getByRole('button', { name: 'Überschreiben' }).click()
  await seite.getByLabel('Einzelpreis').fill('40')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  pruefe(await seite.getByText('3 Positionen').isVisible(), 'Freitext-Position gespeichert')

  // 9. Position löschen (nach Antippen)
  await seite.getByRole('row', { name: /Zaubernuss/ }).click()
  await seite.getByRole('button', { name: 'Position Zaubernuss löschen' }).click()
  pruefe(await seite.getByText('2 Positionen').isVisible(), 'Position gelöscht')

  // 10. Gespeichert: nach Neuladen noch da
  await seite.reload()
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Aufwuchs' }).click()
  pruefe(await seite.getByText('2 Positionen').isVisible(), 'Positionen nach Neuladen gespeichert')

  // 11. WEP-Liste hat keinen Löschen-Knopf; Löschen über „⋯“ mit Rückfrage
  await seite.getByRole('button', { name: 'Protokolle' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe((await seite.getByRole('button', { name: /löschen/i }).count()) === 0, 'WEP-Liste ohne Löschen-Knopf')
  await seite.getByRole('button', { name: /KGA Musterwiese/ }).click()
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /WEP löschen/ }).click()
  await seite.getByRole('alertdialog').waitFor()
  await seite.getByRole('button', { name: 'Abbrechen' }).click()
  pruefe((await seite.getByRole('alertdialog').count()) === 0, 'Rückfrage „Abbrechen“ löscht nicht')
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await seite.getByRole('menuitem', { name: /WEP löschen/ }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(await seite.getByText(/Noch kein Protokoll/).isVisible(), 'WEP nach Rückfrage gelöscht')

  // 12. Keine Skriptfehler
  pruefe(fehler.length === 0, `keine Skriptfehler im Browser ${fehler.join('; ')}`)
  console.log('Durchlauf erfolgreich')
} finally {
  await browser?.close()
  server.kill()
}
