// Screenshots der Änderungen aus Beta 3, Paket 4 (Fotos) für docs/paket4/.
// Aufruf: npm run paket4:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Alle Daten sind erfunden; die Fotos sind selbst gemalte Testbilder (tools/fotos/testbild.mjs) und gehen
// durch die echte Foto-Verarbeitung der App (Verkleinern, Vorschaubild).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { testFoto } from '../fotos/testbild.mjs'

const PORT = 4185
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/paket4'
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

const pos = (id, bezeichnung, anzahl, einheit, preis) => ({
  id, bezeichnung, anzahl, einheit, zustand: 'gut', einzelpreis: preis, preisManuell: false, hinweise: [],
})
const formalien = (nr, parzelle) => ({
  kleingartenanlage: 'KGA Testgarten', parzelle, weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '',
  vertretenDurchRA: '', anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: '',
  wertermittlerAussenAufwuchs: 'Max Mustermann', wertermittlungAm: '2026-10-14', protokollerstellungAm: '', parzellenflaecheM2: 380,
  vorgangsNr: nr,
})
const WEP = {
  id: '2026-007',
  formalien: formalien('2026-007', 'Parzelle 42'),
  gruen: {
    beschreibungAussen: '', beschreibungAufwuchs: '',
    aussenanlagen: [pos('a1', 'Gartenweg, Betonplatten', 18, 'm²', 12)],
    aufwuchs: [pos('w1', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 60), pos('w2', 'Kirschlorbeer-Hecke', 12, 'm', 15)],
    beseitigungAA: [],
  },
}
// Zweites WEP: Fotos wurden auf einem anderen Gerät aufgenommen und sind hier noch nicht geladen
const FREMD = {
  id: '2026-008',
  formalien: formalien('2026-008', 'Parzelle 17'),
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [pos('w9', 'Birne, Halbstamm, 5–30 J.', 1, 'Stück', 60)], beseitigungAA: [] },
  fotos: [
    { id: 'fremd1', aufgenommenAm: '2026-10-19T09:00:00.000Z', breite: 2000, hoehe: 1333, groesse: 330000, text: 'Gesamtansicht vom Tablet' },
    { id: 'fremd2', positionId: 'w9', aufgenommenAm: '2026-10-19T09:05:00.000Z', breite: 2000, hoehe: 1333, groesse: 310000 },
  ],
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
    const galerie = (titel, dateien) =>
      seite.locator(`input[type=file][aria-label="Fotos aus der Galerie wählen: ${titel}"]`).setInputFiles(
        dateien.map((variante, i) => ({
          name: `IMG_${i}.jpg`,
          mimeType: 'image/jpeg',
          buffer: testFoto({ breite: 1800, hoehe: 1200, variante, orientierung: i % 2 ? 6 : undefined, gps: true }),
        })),
      )

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(
      (weps) =>
        new Promise((ok, fehler) => {
          const anfrage = indexedDB.open('wep-db')
          anfrage.onerror = fehler
          anfrage.onsuccess = () => {
            const tx = anfrage.result.transaction('weps', 'readwrite')
            for (const w of weps) tx.objectStore('weps').put(w)
            tx.oncomplete = ok
            tx.onerror = fehler
          }
        }),
      [WEP, FREMD],
    )
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await abschnitt('Fotos').click()
    await seite.getByRole('heading', { name: 'Fotos', exact: true }).waitFor()

    // 1. Noch keine Fotos
    await bild('1-fotos-leer')

    // 2. Fotos aufnehmen: Gesamtansicht und Positionen
    await galerie('Gesamtansicht', [0, 1])
    await seite.getByRole('region', { name: /Gesamtansicht/ }).locator('.foto-kachel').nth(1).waitFor({ timeout: 30000 })
    await seite.getByLabel('Position wählen').selectOption({ label: '02 Apfel, Halbstamm, 5–30 J.' })
    await galerie('02 Apfel, Halbstamm, 5–30 J.', [2, 1, 0])
    await seite.getByRole('region', { name: /02 Apfel/ }).locator('.foto-kachel').nth(2).waitFor({ timeout: 30000 })
    await seite.getByLabel('Position wählen').selectOption({ label: '03 Kirschlorbeer-Hecke' })
    await galerie('03 Kirschlorbeer-Hecke', [1])
    await seite.getByRole('region', { name: /03 Kirschlorbeer/ }).locator('.foto-kachel').first().waitFor({ timeout: 30000 })
    await seite.getByRole('region', { name: /Gesamtansicht/ }).locator('.foto-kachel').first().click()
    await seite.getByLabel('Text zum Foto (optional)').fill('Gesamtansicht von der Laube')
    await seite.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click()
    await seite.evaluate(() => window.scrollTo(0, 0))
    await bild('2-fotos-gruppen')

    // 3. Großansicht mit Text
    await seite.getByRole('region', { name: /02 Apfel/ }).locator('.foto-kachel').first().click()
    await seite.getByRole('dialog').waitFor()
    await seite.getByLabel('Text zum Foto (optional)').fill('Astbruch am Stamm')
    await bild('3-grossansicht')

    // 4. Löschen mit Rückfrage
    await seite.getByRole('button', { name: 'Foto löschen' }).click()
    await seite.getByRole('alertdialog').waitFor()
    await bild('4-foto-loeschen-rueckfrage')
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
    await seite.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click()

    // 5. Fotos an der Position (im Formular „Position ändern“)
    await abschnitt('Aufwuchs').click()
    await seite.getByRole('row', { name: /Apfel, Halbstamm/ }).click()
    await seite.getByRole('heading', { name: 'Fotos zu dieser Position' }).scrollIntoViewIfNeeded()
    await bild('5-position-mit-fotos')
    await seite.getByRole('button', { name: 'Abbrechen' }).filter({ visible: true }).first().click()

    // 6. Fotos von einem anderen Gerät, noch nicht geladen
    await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.getByRole('button', { name: /Parzelle 17/ }).click()
    await abschnitt('Fotos').click()
    await seite.getByText('Noch nicht geladen').first().waitFor()
    await bild('6-fotos-noch-nicht-geladen')

    // 7. Export: Fotos als ZIP (ohne Konto)
    await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await seite.getByRole('button', { name: handy ? 'Export' : /Export als Excel/, exact: false }).filter({ visible: true }).first().click()
    await seite.getByRole('button', { name: 'Excel exportieren' }).click()
    await seite.getByText(/als ZIP heruntergeladen/).waitFor({ timeout: 30000 })
    await seite.getByText(/als ZIP heruntergeladen/).scrollIntoViewIfNeeded()
    await bild('7-export-fotos-zip')
    await kontext.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
