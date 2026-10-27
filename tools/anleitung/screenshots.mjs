// Bildschirmfotos für die Anleitung (docs/anleitung/bilder/, Handy-Größe) mit einem erfundenen Beispiel-WEP.
// Aufruf: npm run anleitung (baut nach dist-e2e/, erzeugt das Beispiel, startet vite preview, danach tools/anleitung/pdf.mjs).
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { chromium } from 'playwright'

const PORT = 4197
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/anleitung/bilder'
const BEISPIEL = 'dist-e2e/anleitung-beispiel.json'

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`, `${basis}/${d}/chrome-linux64/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

execFileSync('npx', ['vite-node', '--config', 'tools/ki-test/vite.config.ts', 'tools/anleitung/beispiel.ts', '--', BEISPIEL], { stdio: 'inherit' })
const beispiel = JSON.parse(readFileSync(BEISPIEL, 'utf-8'))
// Zweites WEP ohne Vorgangs-Nr. (zeigt den Hinweis „Vorgangs-Nr. fehlt“ in der Liste)
const ohneNr = {
  ...beispiel,
  id: '3d5f7a9b-1c2e-4f60-9a8b-7c6d5e4f3a2b',
  formalien: { ...beispiel.formalien, vorgangsNr: '', parzelle: '17', kleingartenanlage: 'Pankegrund', unterpaechter: 'Max Mustermann' },
  gruen: { ...beispiel.gruen, aufwuchs: [], aussenanlagen: [], beseitigungAA: [] },
  skizze: undefined,
  bau: undefined,
  grundriss: undefined,
  rolle: 'gruen',
}

const speichern = (seite, weps) =>
  seite.evaluate(
    (weps) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'syncMeta'], 'readwrite')
          weps.forEach((w, i) => {
            tx.objectStore('weps').put(w)
            tx.objectStore('syncMeta').put({ id: w.id, lokalGeaendertAm: `2026-10-2${4 - i}T08:00:00.000Z` })
          })
          tx.oncomplete = ok
          tx.onerror = fehler
        }
      }),
    weps,
  )

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true })
let browser
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(URL)).ok) break
    } catch {
      /* Server startet noch */
    }
    if (i > 100) throw new Error('vite preview startet nicht')
    await new Promise((r) => setTimeout(r, 200))
  }
  mkdirSync(ZIEL, { recursive: true })
  browser = await chromium.launch({ executablePath: chromiumPfad() })
  const kontext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE', acceptDownloads: true })
  const seite = await kontext.newPage()
  const fehler = []
  seite.on('pageerror', (e) => fehler.push(e.message))
  const bild = async (name, ganz = false) => {
    await seite.waitForTimeout(400)
    await seite.screenshot({ path: `${ZIEL}/${name}.png`, fullPage: ganz })
    console.log(`  ${ZIEL}/${name}.png`)
  }
  /** Zeichenfläche (Skizze/Grundriss) mit Werkzeugleiste: ins Bild scrollen, dann den Bildschirm fotografieren. */
  const flaecheBild = async (name) => {
    const f = seite.locator('.skizze-flaeche').first()
    await f.waitFor()
    await f.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await bild(name)
  }
  const nav = seite.getByRole('navigation', { name: 'Abschnitte' })
  const reiter = async (name) => {
    await nav.getByRole('button', { name, exact: true }).first().click()
    await seite.waitForTimeout(300)
  }

  // 1. Anmelden
  await seite.goto(URL)
  await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).waitFor()
  await bild('01-anmelden')
  await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()

  // 2. Profil
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()
  await seite.getByLabel(/^Name/).fill('Hans Beispiel')
  await seite.getByLabel('Rolle').selectOption('gruen')
  await seite.getByLabel(/Standard-Kleingartenanlage/).first().selectOption({ label: 'Rosenthal-Süd' })
  await bild('02-profil')
  await seite.getByText('Dieses Gerät', { exact: true }).scrollIntoViewIfNeeded()
  await bild('03-profil-geraet')

  // 3. Liste mit Beispiel-WEPs
  await speichern(seite, [beispiel, ohneNr])
  await seite.goto(URL)
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByText('Rosenthal-Süd').first().waitFor()
  await bild('04-liste')

  // 4. Neues WEP: Vorgangs-Nr.
  await seite.getByRole('button', { name: 'Neues WEP', exact: true }).click()
  const dlg = seite.getByRole('dialog', { name: 'Neues WEP' })
  await dlg.getByLabel(/Vorgangs-Nr/).fill('2026-153')
  await bild('05-neues-wep')
  await seite.keyboard.press('Escape')

  // 5. Formalien des Beispiels
  await seite.getByRole('button', { name: /Rosenthal-Süd/ }).first().click()
  await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
  await bild('06-formalien')

  // 6. Aufwuchs, Position hinzufügen
  await reiter('Aufwuchs')
  await seite.getByRole('heading', { name: 'Aufwuchs' }).first().waitFor()
  await bild('08-aufwuchs')
  await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seite.getByLabel('Katalog durchsuchen').fill('apfel')
  await bild('09-suche')
  await seite.getByRole('button', { name: /Apfel, Halbstamm, 5–30 J\./ }).first().click()
  await seite.getByLabel('Anzahl').fill('1')
  await bild('10-position')
  await seite.getByRole('button', { name: /Suche/ }).first().click()
  await seite.getByRole('button', { name: 'Abbrechen' }).first().click()

  // 7. Außenanlagen und Beseitigung
  await reiter('Außenanlagen')
  await bild('11-aussenanlagen')
  await reiter('Beseitigung Grün')
  await bild('12-beseitigung')

  // 8. Bau
  await reiter('Baulichkeiten')
  await bild('13-baulichkeiten')
  await reiter('Mängel')
  await bild('14-maengel')
  await reiter('Skizze Bau')
  await flaecheBild('15-skizze-bau')

  // 9. Skizze Grün und Fotos
  await reiter('Skizze Grün')
  await seite.locator('.skizze-flaeche svg').first().waitFor()
  await bild('07-parzelle')
  await flaecheBild('16-skizze-gruen')
  await reiter('Fotos')
  await bild('17-fotos')

  // 10. Übersicht und An den BV senden
  await reiter('Übersicht')
  await seite.getByRole('heading', { name: 'Bewertung' }).waitFor({ timeout: 30000 })
  await seite.getByRole('heading', { name: 'Bewertung' }).scrollIntoViewIfNeeded()
  await bild('18-uebersicht')
  await seite.getByRole('button', { name: 'An den BV', exact: true }).click()
  await seite.getByRole('heading', { name: 'An den BV senden' }).waitFor()
  await seite.getByRole('button', { name: 'Paket für den BV erstellen' }).click()
  await seite.getByRole('button', { name: 'Speichern', exact: true }).waitFor({ timeout: 90000 })
  await bild('19-an-bv')
  const paketLaden = seite.waitForEvent('download')
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click()
  const paket = await (await paketLaden).path()

  // 11. Teilen (Bau → Grün)
  await seite.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await bild('20-menue')
  await seite.getByRole('menuitem', { name: /Teilen/ }).click()
  await seite.getByRole('dialog').first().waitFor()
  await bild('21-teilen')

  // 12. BV-Kontrollseite (am PC): das Paket von oben, dazu ein WEP ohne Vorgangs-Nr. und eine ältere Fassung
  const wepDatei = async (wep, stand) => {
    const z = new JSZip()
    z.file('wep.json', JSON.stringify({ format: 'wep-teilen/1', erstelltAm: stand, appVersion: '', wep, geaendertAm: stand, enthaelt: { fotos: false, bauExcel: false }, fotos: [] }))
    return z.generateAsync({ type: 'nodebuffer' })
  }
  writeFileSync('dist-e2e/ohne-nr.wep', await wepDatei(ohneNr, '2026-10-23T15:00:00.000Z'))
  writeFileSync('dist-e2e/aeltere-fassung.wep', await wepDatei(beispiel, '2026-10-20T08:00:00.000Z'))
  const bvKontext = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'de-DE', acceptDownloads: true })
  const bv = await bvKontext.newPage()
  bv.on('pageerror', (e) => fehler.push(e.message))
  await bv.goto(`${URL}bv`)
  await bv.getByRole('heading', { name: 'Kontrollseite BV' }).waitFor()
  await bv.locator('input[type=file][accept]').setInputFiles([paket, 'dist-e2e/ohne-nr.wep', 'dist-e2e/aeltere-fassung.wep'])
  await bv.getByText(/3 WEPs eingelesen/).waitFor({ timeout: 30000 })
  await bv.waitForFunction(() => ![...document.querySelectorAll('tr.bv-zeile td.zahl')].some((t) => t.textContent === '…'), null, { timeout: 60000 })
  await bv.screenshot({ path: `${ZIEL}/22-bv-liste.png` })
  console.log(`  ${ZIEL}/22-bv-liste.png`)
  await bv.getByRole('button', { name: '2026-152' }).first().click()
  await bv.getByRole('heading', { name: 'Bewertung' }).waitFor({ timeout: 30000 })
  await bv.waitForTimeout(500)
  await bv.screenshot({ path: `${ZIEL}/23-bv-detail.png` })
  console.log(`  ${ZIEL}/23-bv-detail.png`)

  if (fehler.length) throw new Error(`Skriptfehler im Browser: ${fehler.join('; ')}`)
  console.log('Bilder fertig')
} finally {
  await browser?.close()
  try {
    process.kill(-server.pid)
  } catch {
    /* schon beendet */
  }
}
