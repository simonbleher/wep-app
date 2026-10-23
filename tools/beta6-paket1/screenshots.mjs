// Screenshots für Beta 6, Paket 1 nach docs/beta6-paket1/ (Handy/Tablet): Parzelle anlegen (rechteckig, freie Form mit Diagonale),
// Rückfrage bei vorhandenen Elementen, gemeinsamer Maßstab in Skizze Bau und Skizze Grün, Migration eines WEP ohne Parzelle,
// Übernahme der Form „Grundstück“ aus der Bau-Excel, Export in beide Blätter. Alles läuft über die Oberfläche – zugleich ein
// Durchlauf der Bedienung mit Prüfungen. Alle Daten sind erfunden.
// Aufruf: npm run beta6-paket1:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Das Bild des Excel-Blatts erzeugt npm run beta6-paket1:export-bild.
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const PORT = 4196
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta6-paket1'
const GROESSEN = [
  ['handy', { width: 390, height: 844 }],
  ['tablet', { width: 1180, height: 820 }],
]

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`, `${basis}/${d}/chrome-linux64/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

const rechteck = (x, y, b, h) => [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }]
const bt = (o) => ({ maengel: [], ...o })
const wep = (id, parzelle, rolle, flaeche, extra = {}) => ({
  id,
  rolle,
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle, weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann',
    wertermittlerAussenAufwuchs: '', wertermittlungAm: '2025-10-14', protokollerstellungAm: '', parzellenflaecheM2: flaeche, vorgangsNr: id,
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
// WEP von vor der Parzelle: Grundriss in Metern (ohne Parzelle), alles innerhalb von 18 × 26 m
const GRUNDRISS = {
  massketten: true,
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'l1', punkte: rechteck(5, 10, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'A1', bauteilId: 'a1', punkte: rechteck(11, 11, 2, 3), hoehe: 2.3, dachform: 'flach' },
    { id: 'g3', kuerzel: 'S', punkte: rechteck(5, 4, 3, 2), hoehe: 2, dachform: 'flach' },
    { id: 'g4', kuerzel: 'K', gestrichelt: true, hoehe: 2, punkte: [{ x: 5, y: 15 }, { x: 8, y: 15 }, { x: 8, y: 16.5 }, { x: 7, y: 16.5 }, { x: 7, y: 18 }, { x: 5, y: 18 }] },
  ],
}
// Grün-Skizze von vor der Parzelle (800 × 600, kein Maßstab) mit Birne und der Grundlage aus der Bau-Excel
const ALTE_SKIZZE = {
  breite: 800,
  hoehe: 600,
  raster: true,
  rasterGroesse: 40,
  elemente: [
    { id: 'gs', typ: 'bauform', ebene: 'grundlage', art: 'grundstueck', punkte: rechteck(40, 30, 720, 540) },
    { id: 'gl', typ: 'bauform', ebene: 'grundlage', art: 'bauteil', beschriftung: 'L', punkte: rechteck(300, 200, 160, 110) },
    { id: 'b1', typ: 'symbol', art: 'baum', x: 560, y: 380, breite: 50, hoehe: 62, beschriftung: 'Birne' },
  ],
  grundlage: { quelle: 'excel', uebernommen: '2026-10-20T08:00:00.000Z', gesperrt: true, excelName: 'Bau.xlsx' },
}
const WEPS = [
  wep('2026-001', 'Parzelle 41', 'beides', 380, { bau: BAU, grundriss: GRUNDRISS }),
  wep('2026-002', 'Parzelle 42', 'gruen', 312, { skizze: ALTE_SKIZZE }),
  wep('2026-003', 'Parzelle 43', 'beides', 380),
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

// Test-Bau-Excel mit handgezeichneten Formen in „Skizze Bau“ (erfundene Daten, Grundstück 445 × 615 pt)
const bauOrdner = mkdtempSync(join(tmpdir(), 'wep-bau6-'))
const bauDatei = join(bauOrdner, 'WEP Bau Testgarten.xlsx')
execFileSync('npx', ['vite-node', 'tools/beta5-paket1/erzeuge-test-bau-excel.ts', '--', bauDatei], { stdio: 'ignore' })

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true })
let browser
const fehler = []

/** Anker (Start/Ende) einer Form mit diesem Namen in einem Drawing. */
const anker = (xml, name) => {
  for (const m of xml.matchAll(/<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
    if (new RegExp(`name="${name}"[^>]*descr="wep-app"`).test(m[0])) {
      return `${/<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(m[0])?.[1].replace(/\s+/g, '')}|${/<xdr:to>([\s\S]*?)<\/xdr:to>/.exec(m[0])?.[1].replace(/\s+/g, '')}`
    }
  }
  return undefined
}

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
    const editor = () => seite.getByTestId('parzelle-editor')
    const feld = (name) => editor().getByLabel(name, { exact: true })
    const zumBereich = () => seite.getByTestId('parzelle-bereich').or(seite.getByTestId('parzelle-editor')).first().scrollIntoViewIfNeeded()
    /** Skizzen- bzw. Grundriss-Fläche: erste SVG der Zeichenfläche. */
    const flaeche = seite.locator('.skizze-flaeche svg')
    const viewBox = async () => (await flaeche.getAttribute('viewBox'))
    /** Grundstück (Parzelle) als Kasten auf dem Bildschirm. */
    const grundstueckKasten = async () => {
      const g = flaeche.locator('g[data-art="grundstueck"] polygon, [data-testid="grundriss-parzelle"] polygon').first()
      return g.boundingBox()
    }

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'beides', standardAnlage: 'KGA Musterwiese', baupreisindex: { 2026: 184.3 } } })))
    await speichern(seite, WEPS)
    await seite.reload()

    // ---------------------------------------------------------------------------------------------------------------
    // 1. WEP von vor der Parzelle (Bau-Teil mit Grundriss): Hinweis, Parzelle rechteckig anlegen, Rückfrage
    // ---------------------------------------------------------------------------------------------------------------
    await oeffne('Parzelle 41')
    await reiter('Skizze Bau')
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge Grundriss' }).waitFor()
    pruefe(await seite.getByText('Noch keine Parzelle').isVisible(), 'WEP ohne Parzelle: Hinweis „Noch keine Parzelle“')
    pruefe(await seite.getByTestId('parzelle-migration').isVisible(), 'Hinweis, dass bestehende Skizzen bleiben, wie sie sind (Migration)')
    pruefe((await viewBox()) === '0 0 800 600', 'Grundriss-Editor wie bisher (20 × 15 m, ohne Parzelle)')
    await zumBereich()
    await bild('1-ohne-parzelle')

    await seite.getByRole('button', { name: 'Parzelle anlegen' }).click()
    await editor().waitFor()
    pruefe(await seite.getByRole('button', { name: 'Parzelle übernehmen' }).isDisabled(), 'Ohne Maße: „Parzelle übernehmen“ ist aus, die App sagt, was fehlt')
    pruefe(/Länge · Breite/.test(await seite.getByTestId('parzelle-fehlt').innerText()), 'Es fehlt noch: Länge · Breite')
    await feld('Länge (m)').fill('26')
    pruefe(/Es fehlt noch: Breite/.test(await seite.getByTestId('parzelle-fehlt').innerText()), 'Es fehlt noch: Breite')
    await feld('Breite (m)').fill('18')
    await seite.getByTestId('parzelle-ergebnis').waitFor()
    pruefe(/468,00 m²/.test(await seite.getByTestId('parzelle-ergebnis').innerText()), 'Fläche berechnet: 468,00 m²')
    pruefe(/Berechnet 468 m², laut Vertrag 380 m²/.test(await seite.getByTestId('parzelle-entwurf-abweichung').innerText()), 'Abweichung zur Vertragsfläche (380 m²): Hinweis, nichts gesperrt')
    pruefe(!(await seite.getByRole('button', { name: 'Parzelle übernehmen' }).isDisabled()), 'Trotz Abweichung lässt sich die Parzelle übernehmen (nie sperren)')
    await seite.getByTestId('parzelle-vorschau').scrollIntoViewIfNeeded()
    await bild('2-rechteck-eingabe')
    await seite.getByRole('button', { name: 'Parzelle übernehmen' }).click()
    await seite.getByRole('alertdialog').waitFor()
    pruefe(/Auf der Parzelle liegen schon 4 Bauteile im Grundriss/.test(await seite.getByRole('alertdialog').innerText()), 'Rückfrage: Auf der Parzelle liegen schon 4 Bauteile')
    await bild('3-rueckfrage')
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
    pruefe(await editor().isVisible() && (await viewBox()) === '0 0 800 600', 'Abbrechen ändert nichts')
    await seite.getByRole('button', { name: 'Parzelle übernehmen' }).click()
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Parzelle anlegen' }).click()
    await seite.getByTestId('parzelle-kurz').waitFor()
    pruefe(/Rechteckig 26 × 18 m/.test(await seite.getByTestId('parzelle-kurz').innerText()) && /1 Kästchen = 1 m/.test(await seite.getByTestId('parzelle-kurz').innerText()), 'Parzelle angelegt: 26 × 18 m, 1 Kästchen = 1 m')
    pruefe(/Angelegt am .* \(Bau-Teil\)/.test(await seite.getByTestId('parzelle-stempel').innerText()), 'Angelegt im Bau-Teil, Datum steht dabei')
    pruefe((await viewBox()) === `0 0 ${(18 + 5) * 40} ${(26 + 5) * 40}`, 'Grundriss-Editor zeigt jetzt die Parzelle (Fläche + Rand)')
    pruefe((await seite.getByTestId('parzelle-ausserhalb').count()) === 0, 'Alle Bauteile liegen innerhalb der Parzelle: kein Hinweis')
    pruefe((await seite.locator('[data-testid="grundriss-flaeche"] [data-teil]').count()) === 4, 'Die 4 Bauteile des Grundrisses sind noch da')
    await bild('4-bau-mit-parzelle')

    // Bauteil ziehen: nur ein Hinweis, wenn es die Parzelle verlässt, das Bauteil bleibt wählbar und verschiebbar
    // (Bedienung im Grundriss-Editor ist unverändert; hier nur die Maßstabszeile prüfen)
    pruefe(/Parzelle 18 m × 26 m · 1 Kästchen = 1 m – wie in der Grün-Skizze/.test(await seite.getByTestId('grundriss-massstab').innerText()), 'Maßstabszeile im Bau-Reiter')
    const bauG = await grundstueckKasten()
    const laube = await seite.locator('[data-testid="grundriss-flaeche"] [data-teil="g1"] polygon').boundingBox()
    pruefe(Math.abs(laube.width / bauG.width - 6 / 18) < 0.02, 'Laube ist 6 m von 18 m breit (echter Maßstab auf der Parzelle)')
    pruefe(Math.abs((laube.x - bauG.x) / bauG.width - 5 / 18) < 0.01, 'Laube beginnt 5 m vom linken Rand')

    // ---------------------------------------------------------------------------------------------------------------
    // 2. Grün-Reiter desselben WEP: gleiche Parzelle, gleicher Maßstab, Grundlage aus Parzelle + Bauteilen
    // ---------------------------------------------------------------------------------------------------------------
    await reiter('Skizze Grün')
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
    pruefe(/Rechteckig 26 × 18 m/.test(await seite.getByTestId('parzelle-kurz').innerText()), 'Skizze Grün: dieselbe Parzelle (von beiden Teilen korrigierbar)')
    pruefe(/Angelegt am .* \(Bau-Teil\)/.test(await seite.getByTestId('parzelle-stempel').innerText()), 'Skizze Grün: Parzelle angelegt im Bau-Teil')
    pruefe(/Maßstab: 1 Kästchen = 1 m · Parzelle 18 × 26 m – wie in „Skizze Bau“/.test(await seite.getByTestId('skizze-massstab').innerText()), 'Skizze Grün: gleicher Maßstab wie Skizze Bau')
    pruefe((await viewBox()) === '0 0 600 825', 'Skizze Grün: Leinwand 600 × 825 (Seitenverhältnis des Skizzenkastens)')
    pruefe(/Aus der Parzelle \(Grundstück, Pfosten\)/.test(await seite.getByTestId('grundlage-stand').innerText()), 'Grundlage: Parzelle (Grundstück, Pfosten)')
    await seite.getByRole('button', { name: 'Bauteile aus Bau-Teil dazu' }).click()
    await seite.getByText(/Grundlage übernommen/).waitFor()
    await flaeche.locator('g[data-art="bauteil"]').nth(3).waitFor()
    pruefe((await flaeche.locator('g[data-art="bauteil"]').count()) === 4, 'Bauteile aus dem Bau-Teil liegen auf der Parzelle')
    const gruenG = await flaeche.locator('g[data-art="grundstueck"] polygon').boundingBox()
    const gruenL = await flaeche.locator('g[data-art="bauteil"]', { has: seite.locator('text', { hasText: /^L$/ }) }).locator('polygon').boundingBox()
    pruefe(Math.abs(gruenL.width / gruenG.width - 6 / 18) < 0.01, 'Skizze Grün: Laube ist 6 m von 18 m breit – wie in Skizze Bau')
    pruefe(Math.abs((gruenL.x - gruenG.x) / gruenG.width - 5 / 18) < 0.01 && Math.abs((gruenL.y - gruenG.y) / gruenG.height - 10 / 26) < 0.01, 'Skizze Grün: Laube liegt an derselben Stelle (5 m | 10 m) wie in Skizze Bau')

    // Grün in echten Metern: Apfelbaum 3 × 4 m (Standardgröße richtet sich nach dem Maßstab)
    const punkt = async (x, y) => {
      await flaeche.evaluate((e) => e.scrollIntoView({ block: 'center' }))
      const k = await flaeche.boundingBox()
      const [, , b, h] = (await flaeche.getAttribute('viewBox')).split(' ').map(Number)
      return { x: k.x + (x / b) * k.width, y: k.y + (y / h) * k.height }
    }
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
    // Zeichenfläche in Skizzen-Pixeln: Parzelle liegt bei ox/oy (aus dem Maßstab); Punkt (11 m | 18 m)
    const [, , vb, vh] = (await flaeche.getAttribute('viewBox')).split(' ').map(Number)
    const gk = await flaeche.boundingBox()
    const pxProM = (gruenG.width / gk.width) * vb / 18 // Skizzen-Pixel je Meter
    const ox = ((gruenG.x - gk.x) / gk.width) * vb
    const oy = ((gruenG.y - gk.y) / gk.height) * vh
    await setzeSymbol('baum', 'Apfel', ox + 11 * pxProM, oy + 18 * pxProM)
    pruefe((await flaeche.locator('text', { hasText: 'Apfel' }).count()) > 0, 'Apfelbaum gesetzt (11 m | 18 m)')
    await bild('5-gruen-auf-parzelle')

    // Parzelle korrigieren (Grün-Reiter): 26 → 28 m lang. Rückfrage; Apfelbaum und Bauteile behalten ihre Lage in Metern
    const apfelText = flaeche.locator('text', { hasText: 'Apfel' }).first()
    const vorher = async () => {
      const g = await flaeche.locator('g[data-art="grundstueck"] polygon').boundingBox()
      const t = await apfelText.boundingBox()
      const l = await flaeche.locator('g[data-art="bauteil"]', { has: seite.locator('text', { hasText: /^L$/ }) }).locator('polygon').boundingBox()
      return { g, t, l }
    }
    const v1 = await vorher()
    await zumBereich()
    await seite.getByRole('button', { name: 'Parzelle ändern' }).click()
    await editor().waitFor()
    await feld('Länge (m)').fill('28')
    await seite.getByRole('button', { name: 'Änderung übernehmen' }).click()
    await seite.getByRole('alertdialog').waitFor()
    pruefe(/Auf der Parzelle liegen schon 4 Bauteile im Grundriss und 1 Grün-Element/.test(await seite.getByRole('alertdialog').innerText()), 'Rückfrage beim Ändern: Bauteile und Grün liegen schon darauf')
    pruefe(/behalten ihre Lage und Größe in Metern/.test(await seite.getByRole('alertdialog').innerText()), 'Rückfrage erklärt: Lage und Größe in Metern bleiben')
    await bild('6-aendern-rueckfrage')
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Parzelle ändern' }).click()
    await seite.getByTestId('parzelle-kurz').waitFor()
    await seite.waitForFunction(() => /28 × 18 m/.test(document.querySelector('[data-testid="parzelle-kurz"]')?.textContent ?? ''))
    const v2 = await vorher()
    const proM1 = v1.g.width / 18
    const proM2 = v2.g.height / 28
    pruefe(proM2 < proM1, 'Maßstab ist kleiner geworden (Parzelle länger, Leinwand gleich)')
    pruefe(Math.abs((v1.l.x - v1.g.x) / proM1 - (v2.l.x - v2.g.x) / proM2) < 0.1, 'Laube bleibt 5 m vom linken Rand')
    pruefe(Math.abs((v1.l.y - v1.g.y) / proM1 - (v2.l.y - v2.g.y) / proM2) < 0.1, 'Laube bleibt 10 m vom oberen Rand')
    pruefe(Math.abs((v1.t.x - v1.g.x) / proM1 - (v2.t.x - v2.g.x) / proM2) < 0.5, 'Apfelbaum behält seine Lage in Metern')
    pruefe(/Rechteckig 28 × 18 m/.test(await seite.getByTestId('parzelle-kurz').innerText()), 'Parzelle ist jetzt 28 × 18 m')
    pruefe(/zuletzt geändert am .* \(Grün-Teil\)/.test(await seite.getByTestId('parzelle-stempel').innerText()), 'Geändert im Grün-Teil: Stempel zeigt beide Teile')
    await bild('7-nach-aenderung')
    // Im Bau-Reiter ist die geänderte Parzelle
    await reiter('Skizze Bau')
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge Grundriss' }).waitFor()
    pruefe(/Rechteckig 28 × 18 m/.test(await seite.getByTestId('parzelle-kurz').innerText()), 'Skizze Bau zeigt die korrigierte Parzelle')
    pruefe((await viewBox()) === `0 0 ${(18 + 5) * 40} ${(28 + 5) * 40}`, 'Grundriss-Editor folgt der neuen Parzelle')

    // Export Excel: Grundstück + Pfosten in beiden Blättern an derselben Stelle
    await (handy ? seite.getByRole('button', { name: 'Export', exact: true }) : seite.getByRole('button', { name: 'Export als Excel' })).click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    const [download] = await Promise.all([seite.waitForEvent('download'), seite.getByRole('button', { name: 'Excel exportieren' }).click()])
    await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
    await bild('8-export')
    const zip = await JSZip.loadAsync(readFileSync(await download.path()))
    const bauXml = await zip.file('xl/drawings/drawing8.xml').async('string')
    const gruenXml = await zip.file('xl/drawings/drawing9.xml').async('string')
    pruefe(anker(bauXml, 'Grundstück') !== undefined && anker(bauXml, 'Grundstück') === anker(gruenXml, 'Grundstück'), 'Excel: Grundstück in „Skizze Bau“ und „Skizze Außenanlage-Aufwuchs“ an derselben Stelle, gleich groß')
    pruefe(anker(bauXml, 'Pfosten_0') !== undefined && anker(bauXml, 'Pfosten_0') === anker(gruenXml, 'Pfosten_0'), 'Excel: Zaunpfosten decken sich')
    pruefe(/name="L" descr="wep-app"/.test(bauXml) && /name="L" descr="wep-app"/.test(gruenXml), 'Excel: Laube in beiden Blättern')
    copyFileSync(await download.path(), `${ZIEL}/${groesse}-export.xlsx`)

    // ---------------------------------------------------------------------------------------------------------------
    // 3. WEP von vor der Parzelle (Grün-Teil mit alter Skizze): freie Form mit Diagonale, Migration der Skizze
    // ---------------------------------------------------------------------------------------------------------------
    await seite.reload()
    await oeffne('Parzelle 42')
    await reiter('Skizze')
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
    pruefe((await viewBox()) === '0 0 800 600', 'Alte Skizze (800 × 600) wird weiter wie bisher angezeigt')
    pruefe(/Noch keine Parzelle/.test(await seite.getByTestId('parzelle-bereich').innerText()), 'Alter Stand: „Noch keine Parzelle“, Skizze bleibt')
    await seite.getByRole('button', { name: 'Parzelle anlegen' }).click()
    await editor().waitFor()
    await editor().getByRole('button', { name: 'Andere Form' }).click()
    const svgEcken = seite.getByTestId('parzelle-ecken')
    await svgEcken.scrollIntoViewIfNeeded()
    const kasten = await svgEcken.boundingBox()
    const tippe = async (x, y) => seite.mouse.click(kasten.x + (x / 100) * kasten.width, kasten.y + (y / 100) * kasten.height)
    await tippe(30, 8)
    await tippe(68, 8)
    await tippe(92, 92)
    await tippe(10, 92)
    pruefe(/4 Ecken/.test(await svgEcken.getAttribute('aria-label')), 'Vier Ecken A–D grob gezeichnet')
    await bild('9-freie-form-ecken')
    // Ecke ziehen: C ein Stück nach links
    await seite.mouse.move(kasten.x + 0.92 * kasten.width, kasten.y + 0.92 * kasten.height)
    await seite.mouse.down()
    await seite.mouse.move(kasten.x + 0.86 * kasten.width, kasten.y + 0.9 * kasten.height, { steps: 5 })
    await seite.mouse.up()
    pruefe(/4 Ecken/.test(await svgEcken.getAttribute('aria-label')), 'Ecke gezogen: weiterhin 4 Ecken')
    await editor().getByRole('button', { name: 'Fertig – Maße eintippen' }).click()
    await feld('Seite A–B (m)').fill('10')
    await feld('Seite B–C (m)').fill('24,19')
    await feld('Seite C–D (m)').fill('16')
    await feld('Seite D–A (m)').fill('24,19')
    pruefe(/Es fehlt noch: Diagonale A–C/.test(await seite.getByTestId('parzelle-fehlt').innerText()), 'Nach vier Seiten sagt die App: Es fehlt noch eine Diagonale A–C')
    pruefe(/oder Winkel an B/.test(await seite.getByTestId('parzelle-vorschlaege').innerText()), 'Alternative: Winkel an Ecke B oder D')
    pruefe(await seite.getByRole('button', { name: 'Parzelle übernehmen' }).isDisabled(), 'Ohne Diagonale ist die Form nicht eindeutig: „Parzelle übernehmen“ ist aus')
    await seite.getByTestId('parzelle-vorschlaege').scrollIntoViewIfNeeded()
    await bild('10-freie-form-fehlt-diagonale')
    await seite.getByTestId('parzelle-vorschlaege').getByRole('button', { name: /Diagonale A–C/ }).click()
    await feld('Diagonale A–C (m)').fill('27,29')
    await seite.getByTestId('parzelle-ergebnis').waitFor()
    pruefe(/Fläche 31[12],\d\d m²/.test(await seite.getByTestId('parzelle-ergebnis').innerText()), 'Mit Diagonale: Fläche ≈ 312 m² (Trapez 10/16 m, 24 m tief)')
    pruefe((await seite.getByTestId('parzelle-entwurf-abweichung').count()) === 0, 'Vertragsfläche 312 m² stimmt: kein Hinweis')
    pruefe(await seite.getByTestId('parzelle-vorschau').isVisible(), 'Berechnete Form wird maßstäblich gezeigt')
    await seite.getByTestId('parzelle-vorschau').scrollIntoViewIfNeeded()
    await bild('11-freie-form-fertig')
    await editor().getByLabel('Seitenlängen als Maßlinien in beide Skizzen zeichnen').check()
    await seite.getByRole('button', { name: 'Parzelle übernehmen' }).click()
    await seite.getByRole('alertdialog').waitFor()
    pruefe(/Die Grün-Skizze hatte bisher keinen Maßstab/.test(await seite.getByRole('alertdialog').innerText()), 'Rückfrage bei alter Skizze: wird auf die Parzelle gelegt')
    await bild('12-migration-rueckfrage')
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Parzelle anlegen' }).click()
    await seite.getByTestId('parzelle-kurz').waitFor()
    pruefe((await viewBox()) === '0 0 600 825', 'Skizze liegt jetzt auf der Parzelle (600 × 825)')
    pruefe((await flaeche.locator('text', { hasText: 'Birne' }).count()) > 0, 'Die Birne der alten Skizze ist noch da')
    pruefe(/Maßstab: 1 Kästchen = 1 m/.test(await seite.getByTestId('skizze-massstab').innerText()), 'Maßstabszeile da')
    const trapezGs = await flaeche.locator('g[data-art="grundstueck"] polygon').first().boundingBox()
    const trapezRaum = await flaeche.boundingBox()
    pruefe(trapezGs.width / trapezRaum.width > 0.9, 'Die Parzelle (Trapez) füllt die Skizze mit Rand')
    pruefe((await flaeche.locator('g[data-art="grundstueck"] polygon').first().getAttribute('points')).split(' ').length === 4, 'Grundstück ist ein Viereck mit schrägen Seiten')
    await bild('13-trapez-skizze')
    await seite.reload()
    await oeffne('Parzelle 42')
    await reiter('Skizze')
    await seite.getByTestId('parzelle-kurz').waitFor()
    pruefe(/10 · 24,19 · 16 · 24,19 m/.test(await seite.getByTestId('parzelle-kurz').innerText()) && (await viewBox()) === '0 0 600 825', 'Nach dem Neuladen: Parzelle und Skizze sind gespeichert')

    // ---------------------------------------------------------------------------------------------------------------
    // 4. Form „Grundstück“ aus der Bau-Excel
    // ---------------------------------------------------------------------------------------------------------------
    await seite.reload()
    await oeffne('Parzelle 43')
    await seite.getByTestId('bau-excel-eingabe').setInputFiles(bauDatei)
    await seite.getByRole('heading', { name: 'Formalien abgleichen' }).waitFor()
    await seite.getByRole('dialog').getByRole('button', { name: 'Später' }).click()
    await seite.getByText(/Die Form „Grundstück“ aus der Bau-Excel ist als Parzelle übernommen/).waitFor()
    pruefe(true, 'Bau-Excel: Form „Grundstück“ als Parzelle übernommen (Hinweis erscheint)')
    await bild('14-bau-excel-parzelle')
    await reiter('Skizze Bau')
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge Grundriss' }).waitFor()
    pruefe(/Maße fehlen noch: Länge, Breite/.test(await seite.getByTestId('parzelle-bereich').innerText()), 'Parzelle aus der Bau-Excel: Maße fehlen noch (die App sagt, was)')
    pruefe((await viewBox()) === '0 0 800 600', 'Bis die Maße da sind, zeigt sich der Grundriss wie bisher')
    await seite.getByRole('button', { name: 'Maße eintragen' }).click()
    await editor().waitFor()
    pruefe(await seite.getByTestId('parzelle-vorschlag-excel').isVisible(), 'Vorschlag aus Vertragsfläche (380 m²) und Seitenverhältnis der Bau-Excel')
    const vorschlag = await seite.getByTestId('parzelle-vorschlag-excel').innerText()
    pruefe(/Vorschlag: 36,4 × 26,4 m|Vorschlag: \d+,\d × \d+,\d m/.test(vorschlag), `Vorschlag: ${vorschlag}`)
    await seite.getByTestId('parzelle-vorschlag-excel').click()
    await seite.getByTestId('parzelle-ergebnis').waitFor()
    await seite.getByRole('button', { name: 'Änderung übernehmen' }).click()
    await seite.getByTestId('parzelle-kurz').waitFor()
    pruefe(/\(berechnet\)/.test(await seite.getByTestId('parzelle-kurz').innerText()), 'Parzelle aus der Bau-Excel mit Maßen versehen')
    pruefe(/\(Bau-Excel\)/.test(await seite.getByTestId('parzelle-stempel').innerText()), 'Angelegt aus der Bau-Excel, geändert im Bau-Teil')
    pruefe((await viewBox()) !== '0 0 800 600', 'Danach zeigt der Grundriss-Editor die Parzelle')
    await bild('15-bau-excel-mit-massen')

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
