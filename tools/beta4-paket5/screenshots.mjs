// Screenshots für Beta 4, Paket 5 nach docs/beta4-paket5/ (Handy/Tablet): 3D-Ansicht in „Skizze Bau“ – Laube mit Satteldach, Anbau (Pultdach),
// Schuppen, Gewächshaus, Vorplatz und Keller aus einem erfundenen Grundriss; drehen (Maus bzw. Berührung), zoomen, von oben, offline.
// Zugleich ein Durchlauf mit Prüfungen (Modell steht, Drehen/Zoomen ändert die Kamera, Ansicht läuft ohne Netz). Alle Daten sind erfunden.
// Aufruf: npm run beta4-paket5:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4195
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta4-paket5'
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

const bt = (o) => ({ maengel: [], ...o })
const rechteck = (x, y, b, h) => [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }]
const BAU = {
  bauteile: [
    bt({ id: 'l1', art: 'laube', kuerzel: 'L', laenge: 6, breite: 4.5, flaeche: 27, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'holz-doppelwandig', wanddickeCm: 12 }),
    bt({ id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 2.5, breite: 2, flaeche: 5, baujahr: 2004, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 6 }),
    bt({ id: 's1', art: 'schuppen', kuerzel: 'S', laenge: 2, breite: 2, flaeche: 4, baujahr: 2010, baujahrQuelle: 'geschätzt', material: 'holz-einwandig', wanddickeCm: 2 }),
    bt({ id: 'g1', art: 'gewaechshaus', kuerzel: 'GWH', laenge: 3, breite: 2.5, flaeche: 7.5, baujahr: 2015, baujahrQuelle: 'geschätzt', material: 'blech', wanddickeCm: 1 }),
    bt({ id: 'u1', art: 'vorplatz', kuerzel: 'Ü1', laenge: 3, breite: 2, flaeche: 6, baujahr: 2001, baujahrQuelle: 'geschätzt', material: 'holz-einwandig', wanddickeCm: 2 }),
    bt({ id: 'k1', art: 'keller', kuerzel: 'K', laenge: 4, breite: 3, flaeche: 12, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'stein', wanddickeCm: 24 }),
  ],
  abwasser: { art: 'keine', kanal: {}, grube: {} },
  nichtBeraeumt: { aktiv: false },
  ausstattung: {},
  beschreibung: '',
  beseitigung: [],
}
const GRUNDRISS = {
  raster: true,
  massketten: true,
  teile: [
    { id: 'g-l', kuerzel: 'L', bauteilId: 'l1', punkte: rechteck(4, 4, 6, 4.5), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.4 },
    { id: 'g-a1', kuerzel: 'A1', bauteilId: 'a1', punkte: rechteck(10, 5, 2.5, 2), hoehe: 2.1, dachform: 'pult', hoeheOben: 2.7 },
    { id: 'g-s', kuerzel: 'S', bauteilId: 's1', punkte: rechteck(13.5, 4, 2, 2), hoehe: 2, dachform: 'flach' },
    { id: 'g-gwh', kuerzel: 'GWH', bauteilId: 'g1', punkte: rechteck(13.5, 7.5, 3, 2.5), hoehe: 1.8, dachform: 'sattel', hoeheOben: 2.2 },
    { id: 'g-u1', kuerzel: 'Ü1', bauteilId: 'u1', punkte: rechteck(4, 8.5, 3, 2), hoehe: 2.3, dachform: 'pult', hoeheOben: 2.4 },
    { id: 'g-k', kuerzel: 'K', bauteilId: 'k1', gestrichelt: true, punkte: [{ x: 4.5, y: 4.5 }, { x: 8.5, y: 4.5 }, { x: 8.5, y: 6 }, { x: 7.5, y: 6 }, { x: 7.5, y: 7.5 }, { x: 4.5, y: 7.5 }], hoehe: 2 },
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
    // Service Worker an: so zeigt der Durchlauf auch, dass die nachgeladene 3D-Ansicht offline funktioniert
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'de-DE', hasTouch: groesse === 'handy' })
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
    await reiter('Skizze Bau')
    await seite.getByRole('heading', { name: 'Skizze Bau' }).waitFor()

    // Vor dem Antippen ist three.js nicht geladen
    const bereich = seite.getByTestId('bereich3d')
    await bereich.scrollIntoViewIfNeeded()
    pruefe((await seite.getByTestId('ansicht3d').count()) === 0, '3D-Ansicht ist noch nicht geladen (App bleibt klein)')
    await bild('0-vorher')

    // Seite offline nehmen: der nachgeladene Teil muss aus dem Zwischenspeicher kommen
    await seite.evaluate(() => navigator.serviceWorker?.ready)
    await seite.waitForTimeout(2500)
    await kontext.setOffline(true)
    await seite.getByRole('button', { name: '3D-Ansicht zeigen' }).click()
    const leinwand = seite.getByTestId('ansicht3d')
    await leinwand.waitFor({ timeout: 20000 })
    await seite.waitForFunction(() => document.querySelector('[data-testid="ansicht3d"]')?.getAttribute('data-azimut'))
    pruefe(true, '3D-Ansicht lädt und läuft offline')
    const dreiecke = Number(await leinwand.getAttribute('data-dreiecke'))
    pruefe(dreiecke > 50, `Modell hat ${dreiecke} Dreiecke (Wände, Dächer, Keller)`)
    await bild('1-start')

    // Drehen mit Maus bzw. Finger (Zeigerereignisse)
    await leinwand.scrollIntoViewIfNeeded()
    const az0 = Number(await leinwand.getAttribute('data-azimut'))
    const k = await leinwand.boundingBox()
    const mx = k.x + k.width / 2
    const my = k.y + k.height / 2
    await seite.mouse.move(mx, my)
    await seite.mouse.down()
    await seite.mouse.move(mx + 60, my, { steps: 6 })
    await seite.mouse.move(mx + 140, my - 30, { steps: 6 })
    await seite.mouse.up()
    await seite.waitForTimeout(300)
    const az1 = Number(await leinwand.getAttribute('data-azimut'))
    pruefe(Math.abs(az1 - az0) > 0.5, `Ziehen dreht das Modell (Azimut ${az0} → ${az1})`)
    await bild('2-gedreht')

    // Zoomen: Mausrad und Knöpfe
    const ab0 = Number(await leinwand.getAttribute('data-abstand'))
    await seite.mouse.move(mx, my)
    await seite.mouse.wheel(0, -400)
    await seite.waitForTimeout(300)
    const ab1 = Number(await leinwand.getAttribute('data-abstand'))
    pruefe(ab1 < ab0, `Mausrad zoomt hinein (Abstand ${ab0} → ${ab1})`)
    await seite.getByRole('button', { name: '3D herauszoomen' }).click()
    await seite.getByRole('button', { name: '3D herauszoomen' }).click()
    await seite.waitForTimeout(300)
    pruefe(Number(await leinwand.getAttribute('data-abstand')) > ab1, 'Knopf Herauszoomen vergrößert den Abstand')
    await seite.getByRole('button', { name: '3D hineinzoomen' }).click()
    await bild('3-gezoomt')

    // Tastatur (barrierefrei) und von oben
    await leinwand.focus()
    const az2 = Number(await leinwand.getAttribute('data-azimut'))
    await seite.keyboard.press('ArrowLeft')
    await seite.waitForTimeout(300)
    pruefe(Number(await leinwand.getAttribute('data-azimut')) !== az2, 'Pfeiltasten drehen')
    await seite.getByRole('button', { name: '3D von oben' }).click()
    await bild('4-von-oben')
    await seite.getByRole('button', { name: '3D zurücksetzen' }).click()
    await seite.waitForTimeout(300)
    pruefe(Math.abs(Number(await leinwand.getAttribute('data-azimut')) - 0.628) < 0.01, 'Zurücksetzen stellt die Startansicht wieder her')

    // Zwei-Finger-Zoom (Zeigerereignisse direkt, wie auf dem Tablet)
    const ab2 = Number(await leinwand.getAttribute('data-abstand'))
    await seite.evaluate(() => {
      const el = document.querySelector('[data-testid="ansicht3d"]')
      const r = el.getBoundingClientRect()
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const ev = (type, id, x) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: cy, bubbles: true, pointerType: 'touch' }))
      ev('pointerdown', 1, cx - 40)
      ev('pointerdown', 2, cx + 40)
      for (let i = 1; i <= 5; i++) {
        ev('pointermove', 1, cx - 40 - i * 12)
        ev('pointermove', 2, cx + 40 + i * 12)
      }
      ev('pointerup', 1, cx - 100)
      ev('pointerup', 2, cx + 100)
    })
    await seite.waitForTimeout(300)
    pruefe(Number(await leinwand.getAttribute('data-abstand')) < ab2, 'Zwei Finger auseinander zoomen hinein')
    await seite.getByRole('button', { name: '3D zurücksetzen' }).click()
    await seite.getByTestId('bereich3d').scrollIntoViewIfNeeded()
    pruefe(await seite.getByRole('list', { name: 'Farben der Bauteile' }).getByText(/Laube \(L\)/).isVisible(), 'Legende nennt die Bauteile')
    await bild('5-legende')
    await kontext.setOffline(false)
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
