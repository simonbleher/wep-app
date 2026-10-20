// Screenshots der Änderungen aus Beta 3, Paket 5 (Bau-Excel am WEP) für docs/paket5/.
// Aufruf: npm run paket5:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Alle Daten sind erfunden; die Bau-Excel ist eine Test-Datei aus der Vorlage mit erfundenen Werten
// (src/bauexcel/testBauExcel.ts), keine echte Datei.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const PORT = 4186
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/paket5'
const GROESSEN = [
  ['handy', { width: 390, height: 844 }],
  ['tablet', { width: 1180, height: 820 }],
]

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

const ordner = mkdtempSync(join(tmpdir(), 'wep-paket5-'))
const bauDatei = join(ordner, 'WEP Bau Testgarten.xlsx')
const bauDateiNeu = join(ordner, 'WEP Bau Testgarten (neu).xlsx')
execFileSync('npx', ['vite-node', 'tools/paket5/erzeuge-test-bau-excel.ts', '--', bauDatei], { stdio: 'ignore' })
execFileSync('npx', ['vite-node', 'tools/paket5/erzeuge-test-bau-excel.ts', '--', bauDateiNeu, 'abweichend'], { stdio: 'ignore' })

const pos = (id, bezeichnung, anzahl, einheit, preis) => ({
  id, bezeichnung, anzahl, einheit, zustand: 'gut', einzelpreis: preis, preisManuell: false, hinweise: [],
})
// Absichtlich anders als die Test-Bau-Excel: Anlage, Unterpächter und Fläche weichen ab
const WEP = {
  id: '2026-007',
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle: 'Parzelle 42', weg: '', unterpaechter: 'Familie Beispiel', auftraggeber: '',
    vertretenDurchRA: '', anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: '',
    wertermittlerAussenAufwuchs: 'Max Mustermann', wertermittlungAm: '', protokollerstellungAm: '', parzellenflaecheM2: 350,
    vorgangsNr: '2026-007',
  },
  gruen: {
    beschreibungAussen: '', beschreibungAufwuchs: '',
    aussenanlagen: [pos('a1', 'Gartenweg, Betonplatten', 18, 'm²', 12)],
    aufwuchs: [pos('w1', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 60)],
    beseitigungAA: [],
  },
}

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let browser
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(URL)).ok) break
    } catch {
      /* Server startet noch */
    }
    if (i > 50) throw new Error('vite preview startet nicht')
    await new Promise((r) => setTimeout(r, 200))
  }
  mkdirSync(ZIEL, { recursive: true })
  browser = await chromium.launch({ executablePath: chromiumPfad() })

  for (const [groesse, viewport] of GROESSEN) {
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE' })
    const seite = await kontext.newPage()
    const bild = async (name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`${ZIEL}/${groesse}-${name}.png`)
    }
    const handy = groesse === 'handy'
    const abschnitt = (name) =>
      handy
        ? seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name })
        : seite.getByLabel('Abschnitte').getByRole('button', { name: new RegExp(`^${name}`) })

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(
      (w) =>
        new Promise((ok, fehler) => {
          const anfrage = indexedDB.open('wep-db')
          anfrage.onerror = fehler
          anfrage.onsuccess = () => {
            const tx = anfrage.result.transaction('weps', 'readwrite')
            tx.objectStore('weps').put(w)
            tx.oncomplete = ok
            tx.onerror = fehler
          }
        }),
      WEP,
    )
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).waitFor()

    // 1. Startseite mit „Neues WEP aus Bau-Excel“
    await bild('1-startseite')

    // 2. Formalien ohne Bau-Excel
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
    await bild('2-formalien-ohne-bau-excel')

    // 3. Bau-Excel gewählt: Abgleich, je Feld wählen (Fläche aus der Bau-Excel, der Rest bleibt)
    await seite.getByTestId('bau-excel-eingabe').setInputFiles(bauDatei)
    await seite.getByRole('heading', { name: 'Formalien abgleichen' }).waitFor()
    await seite.getByRole('dialog').locator('fieldset', { hasText: 'Parzellenfläche' }).getByRole('radio').first().check()
    await bild('3-abgleich')

    // 4. Übernommen: Karte mit Datei, Hinweis, vorbefüllte Formalien
    await seite.getByRole('dialog').getByRole('button', { name: 'Übernehmen' }).click()
    await seite.getByText(/aus der Bau-Excel übernommen/).first().waitFor()
    await seite.evaluate(() => window.scrollTo(0, 0))
    await bild('4-formalien-mit-bau-excel')

    // 5. Austauschen fragt zurück
    await seite.getByRole('button', { name: 'Austauschen' }).click()
    await seite.getByRole('alertdialog').waitFor()
    await bild('5-austauschen-rueckfrage')
    const wahl = seite.waitForEvent('filechooser')
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Datei wählen' }).click()
    await (await wahl).setFiles(bauDateiNeu)

    // 6. Neue Fassung: derselbe Abgleich
    await seite.getByRole('heading', { name: 'Formalien abgleichen' }).waitFor()
    await bild('6-abgleich-nach-austausch')
    await seite.getByRole('dialog').getByRole('button', { name: 'Später' }).click()
    await seite.evaluate(() => window.scrollTo(0, 0))
    await bild('7-hinweis-noch-nicht-abgeglichen')

    // 8. Export nimmt die gemerkte Bau-Excel
    await seite.getByRole('button', { name: handy ? 'Export' : /Export als Excel/, exact: false }).filter({ visible: true }).first().click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    await seite.getByRole('button', { name: 'Excel exportieren' }).click()
    await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
    await seite.evaluate(() => window.scrollTo(0, 0))
    await bild('8-export-gemerkte-bau-excel')

    // 9. Neues WEP aus Bau-Excel
    await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.getByTestId('neu-bau-excel-eingabe').setInputFiles(bauDatei)
    await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
    await seite.getByText(/WEP Bau Testgarten\.xlsx/).first().waitFor()
    await seite.evaluate(() => window.scrollTo(0, 0))
    await bild('9-neues-wep-aus-bau-excel')
    await kontext.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
