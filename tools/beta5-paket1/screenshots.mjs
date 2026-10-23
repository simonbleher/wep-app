// Screenshots für Beta 5, Paket 1 nach docs/beta5-paket1/ (Handy/Tablet): Grün-Skizze mit Grundlage aus dem Bau-Teil
// (Grundriss) und aus der Bau-Excel, Sperre/Entsperren, „Grundlage neu übernehmen“ mit Rückfrage, Hinweis ohne Bau-Daten,
// Export. Alles läuft über die Oberfläche – zugleich ein Durchlauf der Bedienung mit Prüfungen. Alle Daten sind erfunden.
// Aufruf: npm run beta5-paket1:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Das Bild des Excel-Blatts erzeugt npm run beta5-paket1:export-bild.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const PORT = 4195
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta5-paket1'
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

const rechteck = (x, y, b, h) => [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }]
const bt = (o) => ({ maengel: [], ...o })
const wep = (id, parzelle, rolle, extra = {}) => ({
  id,
  rolle,
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle, weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann',
    wertermittlerAussenAufwuchs: '', wertermittlungAm: '2025-10-14', protokollerstellungAm: '', parzellenflaecheM2: 380, vorgangsNr: id,
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
  ...extra,
})
const BAU = {
  bauteile: [
    bt({ id: 'l1', art: 'laube', kuerzel: 'L', laenge: 5, breite: 4.5, flaeche: 22.5, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'holz-doppelwandig', wanddickeCm: 12 }),
    bt({ id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 2.5, breite: 1.5, flaeche: 3.75, baujahr: 2004, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 6 }),
  ],
  abwasser: { art: 'keine', kanal: {}, grube: {} },
  nichtBeraeumt: { aktiv: false },
  ausstattung: {},
  beschreibung: '',
  beseitigung: [],
}
const GRUNDRISS = {
  massketten: true,
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'l1', punkte: rechteck(2, 2, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'A1', bauteilId: 'a1', punkte: rechteck(8, 3, 2, 3), hoehe: 2.3, dachform: 'flach' },
    { id: 'g3', kuerzel: 'S', punkte: rechteck(12, 2, 2.5, 2), hoehe: 2, dachform: 'flach' },
    { id: 'g4', kuerzel: 'K', gestrichelt: true, hoehe: 2, punkte: [{ x: 2, y: 7 }, { x: 6, y: 7 }, { x: 6, y: 8.5 }, { x: 4, y: 8.5 }, { x: 4, y: 10 }, { x: 2, y: 10 }] },
  ],
}
const WEPS = [
  wep('2026-001', 'Parzelle 41', 'gruen'),
  wep('2026-002', 'Parzelle 42', 'beides', { bau: BAU, grundriss: GRUNDRISS }),
  wep('2026-003', 'Parzelle 43', 'gruen'),
]

const speichern = (seite, weps) =>
  seite.evaluate(
    (weps) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'syncMeta'], 'readwrite')
          for (const w of weps) {
            tx.objectStore('weps').put(w)
            tx.objectStore('syncMeta').put({ id: w.id, lokalGeaendertAm: '2026-10-20T08:00:00.000Z' })
          }
          tx.oncomplete = ok
          tx.onerror = fehler
        }
      }),
    weps,
  )

const pruefe = (bedingung, text) => {
  if (!bedingung) throw new Error(`Prüfung fehlgeschlagen: ${text}`)
  console.log(`  ✓ ${text}`)
}

// Test-Bau-Excel mit handgezeichneten Formen in „Skizze Bau“ (erfundene Daten)
const bauOrdner = mkdtempSync(join(tmpdir(), 'wep-bau5-'))
const bauDatei = join(bauOrdner, 'WEP Bau Testgarten.xlsx')
execFileSync('npx', ['vite-node', 'tools/beta5-paket1/erzeuge-test-bau-excel.ts', '--', bauDatei], { stdio: 'ignore' })

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true })
let browser
const fehler = []
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

  for (const [groesse, viewport] of GROESSEN) {
    console.log(groesse)
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE', acceptDownloads: true })
    const seite = await kontext.newPage()
    seite.on('pageerror', (e) => fehler.push(`${groesse}: ${e.message}`))
    const handy = groesse === 'handy'
    const bild = async (name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`  ${ZIEL}/${groesse}-${name}.png`)
    }
    const nav = handy ? seite.getByRole('navigation', { name: 'Abschnitte' }) : seite.getByLabel('Abschnitte')
    const reiter = (name) => nav.getByRole('button', { name, exact: true }).first().click()
    const oeffne = async (parzelle) => {
      await seite.getByRole('button', { name: new RegExp(parzelle) }).click()
      await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
    }
    const flaeche = seite.locator('.skizze-flaeche svg')
    /** Skizzen-Pixel (Fläche 600 × 825 bzw. 800 × 600) → Bildschirmpunkt. */
    const punkt = async (x, y) => {
      await flaeche.evaluate((e) => e.scrollIntoView({ block: 'center' }))
      const k = await flaeche.boundingBox()
      const [, , b, h] = (await flaeche.getAttribute('viewBox')).split(' ').map(Number)
      return { x: k.x + (x / b) * k.width, y: k.y + (y / h) * k.height }
    }
    const grundlageFormen = () => flaeche.locator('[data-grundlage]').count()
    const stand = () => seite.getByTestId('grundlage-stand').innerText()
    const setzeSymbol = async (art, name, x, y) => {
      await seite.getByRole('button', { name: 'Symbol', exact: true }).click()
      await seite.getByRole('combobox', { name: 'Symbol' }).selectOption(art)
      const p = await punkt(x, y)
      await seite.mouse.click(p.x, p.y)
      await seite.getByRole('dialog', { name: 'Beschriftung' }).waitFor()
      await seite.getByLabel(/^Baumart oder Name/).fill(name)
      await seite.getByRole('button', { name: 'Übernehmen', exact: true }).click()
      await seite.getByRole('button', { name: 'Auswählen', exact: true }).click()
    }

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'beides', standardAnlage: 'KGA Musterwiese', baupreisindex: { 2026: 184.3 } } })))
    await speichern(seite, WEPS)
    await seite.reload()

    // 1. Ohne Bau-Daten: Hinweis, nichts gesperrt – freies Zeichnen geht
    await oeffne('Parzelle 41')
    await reiter('Skizze')
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
    pruefe(await seite.getByText('Erst Bau-Skizze übernehmen').isVisible(), 'Ohne Bau-Daten: Hinweis „Erst Bau-Skizze übernehmen“')
    pruefe((await seite.getByRole('button', { name: /übernehmen/ }).count()) === 0, 'Ohne Bau-Daten: kein Übernehmen-Knopf, aber auch keine Sperre')
    await setzeSymbol('baum', 'Birne', 300, 250)
    pruefe((await flaeche.locator('text', { hasText: 'Birne' }).count()) > 0, 'Ohne Bau-Daten: freies Zeichnen bleibt möglich')
    await bild('1-ohne-bau-daten')

    // 2. Grundlage aus dem Bau-Teil (Grundriss)
    await seite.reload()
    await oeffne('Parzelle 42')
    await reiter('Skizze Grün') // Rolle „beides“: Grün- und Bau-Skizze sind getrennte Reiter
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
    pruefe(await seite.getByRole('button', { name: 'Aus Bau-Teil übernehmen' }).isVisible(), 'Mit Grundriss: „Aus Bau-Teil übernehmen“')
    pruefe((await seite.getByRole('button', { name: 'Aus Bau-Excel übernehmen' }).count()) === 0, 'Ohne Bau-Excel: kein Excel-Knopf')
    await bild('2-vor-uebernahme')
    await seite.getByRole('button', { name: 'Aus Bau-Teil übernehmen' }).click()
    await seite.getByTestId('grundlage-stand').waitFor()
    const anzahl = await grundlageFormen()
    pruefe(anzahl >= 12, `Grundlage übernommen: ${anzahl} Formen (Grundstück, Pfosten, 4 Bauteile)`)
    pruefe(/Aus dem Bau-Teil/.test(await stand()) && /gesperrt/.test(await stand()), 'Grundlage ist gesperrt')
    pruefe((await flaeche.getAttribute('viewBox')) === '0 0 600 825', 'Leere Skizze bekommt das Seitenverhältnis des Excel-Blatts (600 × 825)')
    for (const k of ['L', 'A1', 'K']) pruefe((await flaeche.locator('g[data-art="bauteil"] text', { hasText: new RegExp(`^${k}$`) }).count()) === 1, `Bauteil ${k} ist beschriftet`)
    await bild('3-grundlage-gesperrt')

    // Gesperrt: Antippen wählt nichts aus
    const laubenPunkt = async () => {
      await flaeche.evaluate((e) => e.scrollIntoView({ block: 'center' }))
      const t = await flaeche.locator('g[data-art="bauteil"] text', { hasText: /^L$/ }).boundingBox()
      return { x: t.x + t.width / 2 + 20, y: t.y + t.height / 2 + 20 }
    }
    let l = await laubenPunkt()
    await seite.mouse.click(l.x, l.y)
    pruefe(await seite.getByText('Nichts ausgewählt').isVisible(), 'Gesperrt: Antippen der Laube wählt nichts aus')
    // Entsperren: einzeln korrigierbar (verschieben, Rückgängig)
    await seite.getByRole('button', { name: 'Entsperren' }).click()
    pruefe(/entsperrt/.test(await stand()), 'Entsperrt')
    const kasten = async () => flaeche.locator('g[data-art="bauteil"] polygon').nth(0).boundingBox()
    const vor = await kasten()
    l = await laubenPunkt() // der längere Text verschiebt die Fläche
    await seite.mouse.click(l.x, l.y)
    pruefe(await seite.getByText(/Ausgewählt: Bau-Form der Grundlage/).isVisible(), 'Entsperrt: Antippen wählt die Bau-Form der Grundlage aus')
    await bild('4-grundlage-entsperrt-ausgewaehlt')
    await seite.mouse.move(l.x, l.y)
    await seite.mouse.down()
    await seite.mouse.move(l.x + 20, l.y + 20, { steps: 6 })
    await seite.mouse.up()
    const nach = await kasten()
    pruefe(Math.abs(nach.x - vor.x) > 5, 'Entsperrt: Bau-Form lässt sich einzeln verschieben')
    await seite.getByRole('button', { name: 'Rückgängig' }).click()
    pruefe(Math.abs((await kasten()).x - vor.x) < 0.5, 'Rückgängig stellt die Bau-Form wieder her')
    await seite.getByRole('button', { name: 'Sperren' }).click()
    pruefe(/gesperrt/.test(await stand()), 'Wieder gesperrt')

    // 3. Grün darüber zeichnen
    await setzeSymbol('baum', 'Apfel', 440, 560)
    await setzeSymbol('hecke', 'Fliederhecke', 30, 380)
    await setzeSymbol('kompost', 'Kompost', 450, 360)
    pruefe((await flaeche.locator('text', { hasText: 'Apfel' }).count()) > 0, 'Grün: Apfelbaum auf der Grundlage')
    await bild('5-gruen-auf-grundlage')
    const gruenVorher = await flaeche.locator('text', { hasText: /Apfel|Fliederhecke|Kompost/ }).count()

    // 4. Grundlage neu übernehmen: Rückfrage, Grün bleibt
    await seite.getByRole('button', { name: 'Grundlage neu übernehmen' }).click()
    await seite.getByRole('alertdialog').waitFor()
    pruefe(/Dein Grün.*bleibt unverändert/.test(await seite.getByRole('alertdialog').innerText()), 'Neu übernehmen: Rückfrage nennt, dass das Grün bleibt')
    await bild('6-neu-uebernehmen-rueckfrage')
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
    pruefe((await grundlageFormen()) === anzahl, 'Abbrechen ändert nichts')
    await seite.getByRole('button', { name: 'Grundlage neu übernehmen' }).click()
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Aus Bau-Teil' }).click()
    await seite.getByText(/Grundlage übernommen/).waitFor()
    pruefe((await grundlageFormen()) === anzahl, 'Neu übernommen: dieselbe Anzahl Formen')
    pruefe((await flaeche.locator('text', { hasText: /Apfel|Fliederhecke|Kompost/ }).count()) === gruenVorher, 'Neu übernommen: Grün-Elemente bleiben erhalten')
    pruefe((await flaeche.getAttribute('viewBox')) === '0 0 600 825', 'Neu übernommen: Fläche bleibt')

    // Nach Neuladen noch da
    await seite.reload()
    await oeffne('Parzelle 42')
    await reiter('Skizze Grün')
    await seite.getByTestId('grundlage-stand').waitFor()
    pruefe((await grundlageFormen()) === anzahl && /gesperrt/.test(await stand()), 'Nach dem Neuladen: Grundlage und Sperre sind gespeichert')

    // 5. Export: Grundlage + Grün im Blatt „Skizze Außenanlage-Aufwuchs“, „Skizze Bau“ unverändert
    await (handy ? seite.getByRole('button', { name: 'Export', exact: true }) : seite.getByRole('button', { name: 'Export als Excel' })).click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    const [download] = await Promise.all([seite.waitForEvent('download'), seite.getByRole('button', { name: 'Excel exportieren' }).click()])
    await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
    await seite.getByText(/Grundlage \(Bau-Skizze\) und Wiese im Blatt/).waitFor()
    await bild('7-export')
    const zip = await JSZip.loadAsync(readFileSync(await download.path()))
    const aa = await zip.file('xl/drawings/drawing9.xml').async('string')
    pruefe(/name="Grundstück" descr="wep-app"/.test(aa) && /name="L" descr="wep-app"/.test(aa) && /name="K" descr="wep-app"/.test(aa), 'Excel: Grundstück, L und Keller im Blatt Außenanlage-Aufwuchs')
    pruefe(/name="Apfel[^"]*" descr="wep-app"/.test(aa) && /name="Gras/.test(aa), 'Excel: Grün und Gras liegen dabei')
    pruefe(/<a:srgbClr val="C5E0B4"\/>/.test(aa), 'Excel: Wiese grün')
    // Rolle „beides“: „Skizze Bau“ bekommt den Grundriss vom Bau-Export (Beta 4) – die Grundlage landet dort nie
    const bauZeichnung = await zip.file('xl/drawings/drawing8.xml').async('string')
    pruefe(/name="L" descr="wep-app"/.test(bauZeichnung) && !/name="Grundstück"|name="Pfosten/.test(bauZeichnung), 'Excel: Grundlage (Wiese, Pfosten) steht nicht in „Skizze Bau“')

    // 6. Grundlage aus der Bau-Excel
    await seite.reload()
    await oeffne('Parzelle 43')
    await seite.getByTestId('bau-excel-eingabe').setInputFiles(bauDatei)
    await seite.getByRole('heading', { name: 'Formalien abgleichen' }).waitFor()
    await seite.getByRole('dialog').getByRole('button', { name: 'Später' }).click()
    await reiter('Skizze')
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
    pruefe((await seite.getByRole('button', { name: 'Aus Bau-Teil übernehmen' }).count()) === 0, 'Ohne Grundriss: kein Bau-Teil-Knopf')
    await seite.getByRole('button', { name: 'Aus Bau-Excel übernehmen' }).click()
    await seite.getByTestId('grundlage-stand').waitFor()
    pruefe(/Aus der Bau-Excel „WEP Bau Testgarten\.xlsx“/.test(await stand()), 'Grundlage aus der Bau-Excel (Name genannt)')
    pruefe(/17 Formen/.test(await stand()) && (await grundlageFormen()) === 14, 'Bau-Excel: 17 Formen umgerechnet (14 Bau-Formen, Maßlinie und 2 Beschriftungen)')
    for (const k of ['L', 'S1', 'LVP', 'A1', 'K1 HW']) pruefe((await flaeche.locator('g[data-art="bauteil"] text', { hasText: new RegExp(`^${k}$`) }).count()) === 1, `Bau-Excel: ${k} übernommen`)
    pruefe((await flaeche.locator('g[data-art="pfosten"]').count()) === 8, 'Bau-Excel: 8 Pfosten übernommen')
    await seite.getByTestId('grundlage-stand').scrollIntoViewIfNeeded()
    await bild('8-aus-bau-excel')
    await setzeSymbol('baum', 'Bergahorn', 60, 60)
    await setzeSymbol('hecke', 'Fliederhecke', 30, 380)
    await bild('9-bau-excel-mit-gruen')

    // Export: „Skizze Bau“ der Bau-Excel bleibt byte-gleich, Grundlage + Grün stehen im anderen Blatt
    await (handy ? seite.getByRole('button', { name: 'Export', exact: true }) : seite.getByRole('button', { name: 'Export als Excel' })).click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    const [download2] = await Promise.all([seite.waitForEvent('download'), seite.getByRole('button', { name: 'Excel exportieren' }).click()])
    await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
    const zip2 = await JSZip.loadAsync(readFileSync(await download2.path()))
    const quelle = await JSZip.loadAsync(readFileSync(bauDatei))
    pruefe((await zip2.file('xl/drawings/drawing8.xml').async('string')) === (await quelle.file('xl/drawings/drawing8.xml').async('string')), 'Excel: „Skizze Bau“ der Bau-Excel byte-gleich (unangetastet)')
    const aa2 = await zip2.file('xl/drawings/drawing9.xml').async('string')
    pruefe(/name="K1_HW" descr="wep-app"/.test(aa2) && /name="Bergahorn[^"]*" descr="wep-app"/.test(aa2) && /name="Grundstück" descr="wep-app"/.test(aa2), 'Excel: Grundlage aus der Bau-Excel und Grün im Blatt Außenanlage-Aufwuchs')

    await kontext.close()
  }
  if (fehler.length) throw new Error(`Skriptfehler im Browser:\n${fehler.join('\n')}`)
} finally {
  await browser?.close()
  try {
    process.kill(-server.pid)
  } catch {
    server.kill()
  }
}
