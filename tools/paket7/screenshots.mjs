// Screenshots der Änderungen aus Beta 3, Paket 7 für docs/paket7/ (Handy/Tablet): ganze Skizze, Zoom mit zwei
// Fingern, Einrasten mit Hilfslinie, Auswahl bei Überlagerung (kleiner Pfosten unter Haus und Grundstück).
// Aufruf: npm run paket7:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Alle Daten sind erfunden.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4188
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/paket7'
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


const sym = (id, art, x, y, b, h, beschriftung) => ({ id, typ: 'symbol', art, x, y, breite: b, hoehe: h, ...(beschriftung ? { beschriftung } : {}) })
const SKIZZE = {
  breite: 800, hoehe: 600, raster: true, rasterGroesse: 40,
  elemente: [
    { id: 'grund', typ: 'rechteck', x: 20, y: 20, breite: 760, hoehe: 560 },
    { id: 'laube', typ: 'rechteck', x: 60, y: 60, breite: 240, hoehe: 160 },
    { id: 'terrasse', typ: 'rechteck', x: 300, y: 100, breite: 120, hoehe: 120 },
    sym('b1', 'baum', 520, 120, 40, 50, 'Apfel'),
    sym('b2', 'baum', 620, 360, 40, 50, 'Birne'),
    sym('beet', 'beet', 80, 320, 160, 80, 'Gemüse'),
    sym('kompost', 'kompost', 340, 440, 60, 40),
    { id: 'pfosten', typ: 'rechteck', x: 130, y: 120, breite: 14, hoehe: 14 },
    { id: 'm1', typ: 'massangabe', x1: 60, y1: 240, x2: 300, y2: 240, beschriftung: '6 m' },
  ],
}
const WEP = {
  id: '2026-001',
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle: 'Parzelle 42', weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: '',
    wertermittlerAussenAufwuchs: 'Max Mustermann', wertermittlungAm: '2026-10-14', protokollerstellungAm: '', parzellenflaecheM2: 350, vorgangsNr: '2026-001',
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
  skizze: SKIZZE,
}

const speichern = (seite, wep) =>
  seite.evaluate(
    (wep) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'syncMeta'], 'readwrite')
          tx.objectStore('weps').put(wep)
          tx.objectStore('syncMeta').put({ id: wep.id, lokalGeaendertAm: '2026-10-20T08:00:00.000Z' })
          tx.oncomplete = ok
          tx.onerror = fehler
        }
      }),
    wep,
  )

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
    const handy = groesse === 'handy'
    const bild = async (name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`${ZIEL}/${groesse}-${name}.png`)
    }
    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'gruen', standardAnlage: 'KGA Musterwiese' } })))
    await speichern(seite, WEP)
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await (handy ? seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Skizze' }) : seite.getByLabel('Abschnitte').getByRole('button', { name: /^Skizze/ })).click()
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
    const svg = seite.locator('.skizze-flaeche svg')
    await svg.scrollIntoViewIfNeeded()
    const kasten = async () => svg.boundingBox()
    const cdp = await kontext.newCDPSession(seite)
    const touch = (type, punkte) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punkte.map(([x, y], i) => ({ x, y, id: i + 1 })) })
    // Skizzen-Koordinaten → Bildschirm (bei ganzer Skizze)
    const zuBild = async (x, y) => {
      const k = await kasten()
      return [k.x + (x / 800) * k.width, k.y + (y / 600) * k.height]
    }

    // 1. Ganze Skizze
    await bild('1-ganze-skizze')

    // 2. Zwei Finger auseinander um die Terrasse: gezoomt, Anzeige „Zoom …“
    const [fx, fy] = await zuBild(300, 160)
    await touch('touchStart', [[fx - 25, fy], [fx + 25, fy]])
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[fx - 25 - i * 12, fy], [fx + 25 + i * 12, fy]])
    await touch('touchEnd', [])
    await bild('2-zwei-finger-zoom')

    // 3. Ganze Skizze: ein Pfosten (14 × 14) unter Laube und Grundstück antippen → kleinste Form zuerst, nochmal tippen wechselt
    await seite.getByRole('button', { name: 'Ganze Skizze' }).click()
    await seite.getByRole('button', { name: 'Auswählen' }).click()
    const [px, py] = await zuBild(137, 127)
    await seite.mouse.click(px, py)
    await bild('3-auswahl-kleiner-pfosten')
    await seite.mouse.click(px, py)
    await bild('4-auswahl-wechselt-zur-laube')

    // 4. Einrasten: Terrasse an die Laube heranziehen, Hilfslinie sichtbar
    await seite.mouse.click(...(await zuBild(770, 30))) // abwählen
    const [tx, ty] = await zuBild(400, 200)
    await seite.mouse.click(tx, ty) // wählt die Terrasse (kleiner als Laube/Grundstück an dieser Stelle)
    await seite.mouse.move(tx, ty)
    await seite.mouse.down()
    const [zx, zy] = await zuBild(400 - 120 + 4, 200 + 33)
    await seite.mouse.move(zx, zy, { steps: 8 })
    await bild('5-einrasten-hilfslinie')
    await seite.mouse.up()

    // 5. Eingerastet aus: Schalter aus
    await seite.getByRole('button', { name: 'Einrasten' }).click()
    await bild('6-einrasten-aus')
    await kontext.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
