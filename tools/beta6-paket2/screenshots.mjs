// Screenshots für Beta 6, Paket 2 nach docs/beta6-paket2/ (Handy/Tablet): weitere Dachformen (Walm, Zelt/Pyramide, Krüppelwalm, Mansard) –
// Eingaben mit Erklär-Skizze im Grundriss-Editor und im Rechner, Kubatur gegen Handrechnung, Massenberechnung, 3D-Ansicht.
// Alles läuft über die Oberfläche – zugleich ein Durchlauf mit Prüfungen. Alle Daten sind erfunden.
// Aufruf: npm run beta6-paket2:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4197
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta6-paket2'
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

const bt = (o) => ({ maengel: [], ...o })
const rechteck = (x, y, b, h) => [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }]
const BAU = {
  bauteile: [
    bt({ id: 'l1', art: 'laube', kuerzel: 'L', laenge: 8, breite: 6, flaeche: 48, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'holz-doppelwandig', wanddickeCm: 12 }),
    bt({ id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 3, breite: 3, flaeche: 9, baujahr: 2004, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 6 }),
    bt({ id: 's1', art: 'schuppen', kuerzel: 'S', laenge: 5, breite: 3.5, flaeche: 17.5, baujahr: 2010, baujahrQuelle: 'geschätzt', material: 'holz-einwandig', wanddickeCm: 2 }),
    bt({ id: 'a2', art: 'anbau', kuerzel: 'A2', laenge: 6, breite: 4, flaeche: 24, baujahr: 2012, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 8 }),
  ],
  abwasser: { art: 'keine', kanal: {}, grube: {} },
  nichtBeraeumt: { aktiv: false },
  ausstattung: {},
  beschreibung: '',
  beseitigung: [],
}
// Rechteck 8 × 6, Traufe 2,5, First 5: Walm (Firstlänge 2) = 165 m³; Zelt 3 × 3 (Traufe 2,4, Spitze 4,2) = 9 × 2,4 + 9 × 1,8 ÷ 3 = 27 m³
const GRUNDRISS = {
  raster: true,
  massketten: true,
  teile: [
    { id: 'g-l', kuerzel: 'L', bauteilId: 'l1', punkte: rechteck(3, 3, 8, 6), hoehe: 2.5, dachform: 'walm', hoeheOben: 5, firstLaenge: 2 },
    { id: 'g-a1', kuerzel: 'A1', bauteilId: 'a1', punkte: rechteck(13, 3, 3, 3), hoehe: 2.4, dachform: 'zelt', hoeheOben: 4.2 },
    { id: 'g-s', kuerzel: 'S', bauteilId: 's1', punkte: rechteck(3, 10.5, 5, 3.5), hoehe: 2.2, dachform: 'flach' },
    { id: 'g-a2', kuerzel: 'A2', bauteilId: 'a2', punkte: rechteck(11, 10, 6, 4), hoehe: 2.3, dachform: 'mansard', hoeheOben: 4.4, knickHoehe: 3.4, knickBreite: 1 },
  ],
}
const wep = {
  id: '2026-001',
  rolle: 'bau',
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle: 'Parzelle 42', weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann',
    wertermittlerAussenAufwuchs: '', wertermittlungAm: '2025-10-14', protokollerstellungAm: '', parzellenflaecheM2: 350, vorgangsNr: '2026-001',
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
  bau: BAU,
  grundriss: GRUNDRISS,
}

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
  // Software-WebGL (SwiftShader) für Rechner ohne GPU
  browser = await chromium.launch({ executablePath: chromiumPfad(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

  for (const [groesse, viewport] of GROESSEN) {
    console.log(groesse)
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE', hasTouch: groesse === 'handy' })
    const seite = await kontext.newPage()
    seite.on('pageerror', (e) => fehler.push(`${groesse}: ${e.message}`))
    seite.on('console', (m) => m.type() === 'error' && fehler.push(`${groesse}: ${m.text()}`))
    const handy = groesse === 'handy'
    const bild = async (name) => {
      await seite.waitForTimeout(500)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`  ${ZIEL}/${groesse}-${name}.png`)
    }
    const nav = handy ? seite.getByRole('navigation', { name: 'Abschnitte' }) : seite.getByLabel('Abschnitte')
    const reiter = (name) => nav.getByRole('button', { name }).first().click()
    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'bau', standardAnlage: 'KGA Musterwiese', baupreisindex: { 2026: 184.3 } } })))
    await speichern(seite, [wep])
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()

    // ---- Skizze Bau: Teil antippen → Dachform, Skizze und Felder
    await reiter('Skizze Bau')
    await seite.getByRole('heading', { name: 'Skizze Bau' }).waitFor()
    const flaeche = seite.getByTestId('grundriss-flaeche')
    const tippe = async (xm, ym) => {
      await flaeche.scrollIntoViewIfNeeded()
      const k = await flaeche.boundingBox()
      await seite.mouse.click(k.x + (xm / 20) * k.width, k.y + (ym / 15) * k.height)
    }
    const auswahl = seite.getByRole('group', { name: 'Ausgewähltes Teil' })
    const massen = async () => (await seite.getByTestId('grundriss-massen').innerText()).replace(/\s+/g, ' ')
    await bild('1-skizze-bau')

    await tippe(7, 6) // Laube: Walmdach
    await auswahl.waitFor()
    pruefe((await seite.getByLabel('Dachform').inputValue()) === 'walm', 'Laube hat Walmdach')
    pruefe(await seite.getByLabel('Firstlänge (m)').isVisible(), 'Walmdach: Feld Firstlänge')
    pruefe((await massen()).includes('Kubatur 165,00 m³'), `Walmdach 8 × 6, Traufe 2,5, First 5, Firstlänge 2 → 165 m³ (${await massen()})`)
    await seite.getByTestId('dach-felder').scrollIntoViewIfNeeded()
    await bild('2-walmdach')

    await tippe(14.5, 4.5) // Anbau: Zeltdach
    pruefe((await seite.getByLabel('Dachform').inputValue()) === 'zelt', 'Anbau hat Zeltdach')
    pruefe(await seite.getByLabel('Höhe der Spitze (m)').isVisible(), 'Zeltdach: Feld Höhe der Spitze')
    pruefe((await massen()).includes('Kubatur 27,00 m³'), `Zeltdach 3 × 3, Traufe 2,4, Spitze 4,2 → 27 m³ (${await massen()})`)
    await seite.getByTestId('dach-felder').scrollIntoViewIfNeeded()
    await bild('3-zeltdach')

    await tippe(14, 12) // Anbau A2: Mansarddach
    pruefe((await seite.getByLabel('Dachform').inputValue()) === 'mansard', 'A2 hat Mansarddach')
    // 6 × 4, Traufe 2,3, First 4,4, Knick 3,4, Einzug 1: 24 × 2,3 + 6 × ((3,4−2,3) × 3 + ½ × 2 × 1) = 55,2 + 6 × 4,3 = 81 m³
    pruefe((await massen()).includes('Kubatur 81,00 m³'), `Mansarddach 6 × 4 → 81 m³ (${await massen()})`)
    await seite.getByTestId('dach-felder').scrollIntoViewIfNeeded()
    await bild('4-mansarddach')

    // Schuppen: von Flachdach auf Krüppelwalmdach umstellen und Maße eintippen
    await tippe(5.5, 11) // über den Zoom-Knöpfen, die auf dem Handy das Teil teilweise verdecken
    pruefe((await seite.getByLabel('Dachform').inputValue()) === 'flach', `Schuppen ist noch ein Flachdach (${await seite.getByLabel('Dachform').inputValue()}, ${await auswahl.locator('legend').innerText()})`)
    await seite.getByLabel('Dachform').selectOption('krueppelwalm')
    await seite.getByLabel('Firsthöhe (m)').fill('3,8')
    pruefe(/Walmhöhe fehlt/.test(await auswahl.innerText()), 'ohne Walmmaße: Hinweis „wie beim Satteldach“, nichts gesperrt')
    await seite.getByLabel('Walmhöhe (m)').fill('0,8')
    await seite.getByLabel('Walmtiefe (m)').fill('0,9')
    // 5 × 3,5, Traufe 2,2, First 3,8 (r = 1,6): 17,5 × 2,2 + 17,5 × 1,6 ÷ 2 − 3,5 × 0,8² × 0,9 ÷ (3 × 1,6) = 38,5 + 14 − 0,42 = 52,08 m³
    pruefe((await massen()).includes('Kubatur 52,08 m³'), `Krüppelwalmdach 5 × 3,5 → 52,08 m³ (${await massen()})`)
    await seite.getByTestId('dach-felder').scrollIntoViewIfNeeded()
    await bild('5-krueppelwalmdach')

    await tippe(18.5, 1) // leere Stelle: Auswahl aufheben
    await seite.getByTestId('massenberechnung').scrollIntoViewIfNeeded()
    const tabelle = await seite.getByTestId('massenberechnung').innerText()
    pruefe(/165,00 m³/.test(tabelle) && /27,00 m³/.test(tabelle) && /81,00 m³/.test(tabelle) && /52,08 m³/.test(tabelle), 'Massenberechnung zeigt alle vier Kubaturen')
    await bild('6-massenberechnung')

    // ---- 3D-Ansicht zeigt die neuen Formen
    await seite.getByTestId('bereich3d').scrollIntoViewIfNeeded()
    await seite.getByRole('button', { name: '3D-Ansicht zeigen' }).click()
    const leinwand = seite.getByTestId('ansicht3d')
    await leinwand.waitFor({ timeout: 20000 })
    await seite.waitForFunction(() => document.querySelector('[data-testid="ansicht3d"]')?.getAttribute('data-azimut'))
    pruefe(Number(await leinwand.getAttribute('data-dreiecke')) > 50, 'Modell steht')
    await seite.getByTestId('bereich3d').scrollIntoViewIfNeeded()
    await bild('7-3d')
    await seite.getByRole('button', { name: '3D von oben' }).click()
    await bild('8-3d-von-oben')

    // ---- Rechner: Kubatur je Form
    await reiter('Rechner')
    await seite.getByRole('heading', { name: 'Rechner' }).waitFor()
    await seite.getByRole('group', { name: 'Rechner wählen' }).getByRole('button', { name: 'Kubatur' }).click()
    await seite.getByLabel('Länge (m)', { exact: true }).fill('8')
    await seite.getByLabel('Breite (m)', { exact: true }).fill('6')
    const form = (name) => seite.getByRole('group', { name: 'Dachform' }).getByRole('button', { name, exact: true }).click()
    const rechenweg = async () => (await seite.getByLabel('Rechenweg Kubatur').innerText()).replace(/\s+/g, ' ')
    await form('Satteldach')
    await seite.getByLabel('Traufhöhe (m)').fill('2,5')
    await seite.getByLabel('Firsthöhe (m)').fill('5')
    pruefe((await rechenweg()).includes('180 m³'), 'Satteldach 8 × 6 → 180 m³ (Vergleich)')
    const skizzen = [
      ['Walmdach', 'walm', async () => seite.getByLabel('Firstlänge (m)').fill('2'), '165 m³'],
      ['Zeltdach / Pyramide', 'zelt', null, '160 m³'],
      ['Krüppelwalmdach', 'krueppelwalm', async () => { await seite.getByLabel('Walmhöhe (m)').fill('1'); await seite.getByLabel('Walmtiefe (m)').fill('1') }, '179,2 m³'],
      ['Mansarddach', 'mansard', async () => { await seite.getByLabel('Knickhöhe (m)').fill('4'); await seite.getByLabel('Knick-Einzug (m)').fill('1,5') }, '186 m³'],
    ]
    for (const [name, id, fuelle, kubatur] of skizzen) {
      await form(name)
      if (id === 'zelt') await seite.getByLabel('Höhe der Spitze (m)').fill('5')
      if (fuelle) await fuelle()
      pruefe((await rechenweg()).includes(kubatur), `${name} 8 × 6 → ${kubatur} (Handrechnung)`)
      await seite.getByRole('group', { name: 'Dachform' }).scrollIntoViewIfNeeded()
      await bild(`9-rechner-${id}`)
      if (groesse === 'tablet') await seite.locator(`.dach-skizze[data-dachform="${id}"]`).screenshot({ path: `${ZIEL}/skizze-${id}.png` })
    }
    // Skizzen der übrigen Formen (nur Tablet) – zum Nachschlagen
    if (!handy) {
      for (const [name, id] of [['Flachdach', 'flach'], ['Pultdach', 'pult'], ['Satteldach', 'sattel']]) {
        await form(name)
        if (id !== 'flach') await seite.locator(`.dach-skizze[data-dachform="${id}"]`).screenshot({ path: `${ZIEL}/skizze-${id}.png` })
      }
    }
    await kontext.close()
  }
  if (fehler.length) throw new Error(`Fehler im Browser:\n${fehler.join('\n')}`)
} finally {
  await browser?.close()
  try {
    process.kill(-server.pid)
  } catch {
    server.kill()
  }
}
