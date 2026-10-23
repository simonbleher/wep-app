// Screenshots für Beta 5, Paket 3 nach docs/beta5-paket3/ (Handy/Tablet): Profil → „Meine Unterschrift“ – zeichnen
// (Rückgängig, Alles löschen), Bild hochladen (zuschneiden, Hintergrund entfernen), speichern, nach dem Neuladen noch da,
// ersetzen, löschen mit Rückfrage. Alles läuft über die Oberfläche – zugleich ein Durchlauf der Bedienung mit
// Prüfungen. Die „Unterschriften“ sind selbst erzeugte Kritzel und ein selbst gemaltes Foto auf grauem Papier –
// keine echten Unterschriften.
// Aufruf: npm run beta5-paket3:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { chromium } from 'playwright'

const PORT = 4196
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta5-paket3'
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

const pruefe = (bedingung, text) => {
  if (!bedingung) throw new Error(`Prüfung fehlgeschlagen: ${text}`)
  console.log(`  ✓ ${text}`)
}

/** Selbst gemaltes „Foto“: graues Papier mit Lichtverlauf und Schatten, blaue Kritzel, Tischkante rechts. */
function testFoto() {
  const c = createCanvas(1600, 1000)
  const ctx = c.getContext('2d')
  const verlauf = ctx.createLinearGradient(0, 0, 1600, 300)
  verlauf.addColorStop(0, '#8d8c86')
  verlauf.addColorStop(1, '#ecebe2')
  ctx.fillStyle = verlauf
  ctx.fillRect(0, 0, 1600, 1000)
  ctx.fillStyle = '#5a4630' // Tischkante
  ctx.fillRect(1400, 0, 200, 1000)
  ctx.strokeStyle = '#1b3f9c'
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(300, 560)
  ctx.bezierCurveTo(380, 300, 520, 700, 640, 470)
  ctx.bezierCurveTo(720, 330, 820, 640, 920, 440)
  ctx.bezierCurveTo(1000, 300, 1080, 620, 1200, 520)
  ctx.moveTo(330, 700)
  ctx.lineTo(1150, 640)
  ctx.stroke()
  return c.toBuffer('image/png')
}

const bildOrdner = mkdtempSync(join(tmpdir(), 'wep-unt-'))
const fotoDatei = join(bildOrdner, 'unterschrift-testfoto.png')
writeFileSync(fotoDatei, testFoto())

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
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE', hasTouch: groesse === 'handy' })
    const seite = await kontext.newPage()
    seite.on('pageerror', (e) => fehler.push(`${groesse}: ${e.message}`))
    const bild = async (name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`  ${ZIEL}/${groesse}-${name}.png`)
    }
    const profil = () => seite.evaluate(() => JSON.parse(localStorage.getItem('wep-profil') ?? '{}'))
    const abschnitt = seite.locator('section', { has: seite.getByRole('heading', { name: 'Meine Unterschrift' }) })
    const zumAbschnitt = () => abschnitt.evaluate((e) => e.scrollIntoView({ block: 'start' }))
    /** Kritzel auf der Zeichenfläche (Maus; auf dem Handy dieselben Zeigerereignisse). */
    const kritzeln = async (versatz = 0) => {
      const flaeche = seite.getByTestId('unterschrift-leinwand')
      const k = await flaeche.boundingBox()
      const px = (x, y) => [k.x + x * k.width, k.y + y * k.width]
      let [x, y] = px(0.1, 0.18 + versatz)
      await seite.mouse.move(x, y)
      await seite.mouse.down()
      for (let i = 1; i <= 60; i++) {
        const t = i / 60
        ;[x, y] = px(0.1 + t * 0.7, 0.17 + versatz + Math.sin(t * Math.PI * 4) * 0.06)
        await seite.mouse.move(x, y)
      }
      await seite.mouse.up()
      ;[x, y] = px(0.14, 0.27 + versatz)
      await seite.mouse.move(x, y)
      await seite.mouse.down()
      for (let i = 1; i <= 20; i++) await seite.mouse.move(...px(0.14 + (i / 20) * 0.68, 0.27 + versatz + Math.sin(i / 3) * 0.008))
      await seite.mouse.up()
    }
    /** Pixel des gespeicherten PNG im Browser prüfen: Größe, durchsichtige Ecke, deckende Tinte. */
    const pngPruefung = (url) =>
      seite.evaluate(async (u) => {
        const img = new Image()
        img.src = u
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, c.width, c.height).data
        let tinte = 0
        for (let i = 3; i < d.length; i += 4) if (d[i] > 200) tinte++
        return { breite: img.width, hoehe: img.height, eckeAlpha: d[3], tinte }
      }, url)

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Erika Musterfrau', rolle: 'gruen', standardAnlage: 'KGA Musterwiese' } })))
    await seite.reload()
    await seite.getByRole('button', { name: 'Profil und Einstellungen' }).first().click()
    await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()

    // 1. Noch keine Unterschrift
    await zumAbschnitt()
    pruefe(await seite.getByText('Keine Unterschrift hinterlegt.').isVisible(), 'Zu Beginn: keine Unterschrift')
    pruefe((await abschnitt.getByRole('button', { name: 'Löschen' }).count()) === 0, 'Ohne Unterschrift: kein Löschen-Knopf')
    await bild('1-leer')

    // 2. Zeichnen: Rückgängig, Alles löschen, Übernehmen
    await abschnitt.getByRole('button', { name: 'Zeichnen' }).click()
    await seite.getByTestId('unterschrift-leinwand').waitFor()
    pruefe(await abschnitt.getByRole('button', { name: 'Übernehmen' }).isDisabled(), 'Leere Fläche: Übernehmen gesperrt')
    await zumAbschnitt()
    await kritzeln()
    pruefe(await abschnitt.getByRole('button', { name: 'Übernehmen' }).isEnabled(), 'Nach dem Zeichnen: Übernehmen möglich')
    await bild('2-zeichnen')
    await abschnitt.getByRole('button', { name: 'Rückgängig' }).click()
    pruefe(await abschnitt.getByRole('button', { name: 'Rückgängig' }).isEnabled(), 'Rückgängig nimmt nur den letzten Strich weg (einer bleibt)')
    await abschnitt.getByRole('button', { name: 'Rückgängig' }).click()
    pruefe(await abschnitt.getByRole('button', { name: 'Rückgängig' }).isDisabled() && (await abschnitt.getByRole('button', { name: 'Übernehmen' }).isDisabled()), 'Alles zurückgenommen: leer, Übernehmen gesperrt')
    await kritzeln()
    await abschnitt.getByRole('button', { name: 'Alles löschen' }).click()
    pruefe(await abschnitt.getByRole('button', { name: 'Übernehmen' }).isDisabled(), 'Alles löschen leert die Fläche')
    await kritzeln()
    await abschnitt.getByRole('button', { name: 'Übernehmen' }).click()
    await seite.getByTestId('unterschrift-vorschau').waitFor()
    pruefe(await seite.getByText('Unterschrift gespeichert.').isVisible(), 'Gespeichert: Meldung')
    let p = await profil()
    pruefe(typeof p.profil.unterschrift === 'string' && p.profil.unterschrift.startsWith('data:image/png;base64,'), 'Lokal im Profil als PNG gespeichert')
    pruefe(typeof p.geaendertAm === 'string', 'Änderung fürs OneDrive-Abgleichen vorgemerkt (geaendertAm)')
    let png = await pngPruefung(p.profil.unterschrift)
    pruefe(png.breite <= 600 && png.hoehe <= 240 && png.breite > 200, `PNG ${png.breite} × ${png.hoehe} (höchstens 600 × 240)`)
    pruefe(png.eckeAlpha === 0 && png.tinte > 300, 'PNG: Hintergrund durchsichtig, Tinte deckend')
    pruefe(p.profil.name === 'Erika Musterfrau', 'Übrige Profildaten bleiben')
    await zumAbschnitt()
    await bild('3-gespeichert')

    // 3. Nach dem Neuladen noch da
    await seite.reload()
    await seite.getByRole('button', { name: 'Profil und Einstellungen' }).first().click()
    await seite.getByTestId('unterschrift-vorschau').waitFor()
    pruefe(true, 'Nach dem Neuladen noch da')
    const erste = (await profil()).profil.unterschrift

    // 4. Bild hochladen: zuschneiden, Hintergrund entfernen
    await seite.getByTestId('unterschrift-datei').setInputFiles(fotoDatei)
    await seite.getByTestId('unterschrift-quelle').waitFor()
    await zumAbschnitt()
    const ergebnisSrc = () => seite.getByTestId('unterschrift-ergebnis').locator('img').getAttribute('src')
    await seite.getByTestId('unterschrift-ergebnis').locator('img').waitFor()
    await bild('4-bild-vor-zuschnitt')
    const vorher = await pngPruefung(await ergebnisSrc())
    pruefe(vorher.eckeAlpha === 0, 'Foto: grauer Papierhintergrund und Schatten werden durchsichtig')
    await seite.getByLabel(/^Rechts abschneiden/).fill('20')
    await seite.getByLabel(/^Rechts abschneiden/).dispatchEvent('input')
    await seite.getByLabel(/^Unten abschneiden/).fill('15')
    await seite.getByLabel(/^Unten abschneiden/).dispatchEvent('input')
    await seite.waitForTimeout(500)
    await bild('5-bild-zugeschnitten')
    const nachher = await pngPruefung(await ergebnisSrc())
    pruefe(nachher.eckeAlpha === 0 && nachher.tinte > 300, 'Foto: zugeschnitten, Tinte bleibt')
    pruefe(nachher.breite !== vorher.breite || nachher.hoehe !== vorher.hoehe, 'Zuschnitt aktualisiert die Vorschau')
    await seite.getByLabel(/^Hintergrund entfernen/).fill('80')
    await seite.getByLabel(/^Hintergrund entfernen/).dispatchEvent('input')
    await seite.getByRole('switch', { name: 'Einheitlich dunkel färben' }).check()
    await seite.waitForTimeout(500)
    await abschnitt.getByRole('button', { name: 'Übernehmen' }).click()
    await seite.getByTestId('unterschrift-vorschau').waitFor()
    p = await profil()
    pruefe(p.profil.unterschrift !== erste, 'Foto-Unterschrift ersetzt die gezeichnete')
    png = await pngPruefung(p.profil.unterschrift)
    pruefe(png.breite <= 600 && png.hoehe <= 240 && png.eckeAlpha === 0, `Foto-PNG ${png.breite} × ${png.hoehe}, durchsichtiger Rand`)
    await zumAbschnitt()
    await bild('6-bild-gespeichert')

    // 5. Abbrechen ändert nichts
    const vorAbbruch = (await profil()).profil.unterschrift
    await abschnitt.getByRole('button', { name: 'Neu zeichnen' }).click()
    await seite.getByTestId('unterschrift-leinwand').waitFor()
    await kritzeln()
    await abschnitt.getByRole('button', { name: 'Abbrechen' }).click()
    pruefe((await profil()).profil.unterschrift === vorAbbruch, 'Abbrechen lässt die gespeicherte Unterschrift unverändert')

    // 6. Löschen mit Rückfrage
    await abschnitt.getByRole('button', { name: 'Löschen' }).click()
    await seite.getByRole('alertdialog').waitFor()
    await bild('7-loeschen-rueckfrage')
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
    pruefe((await profil()).profil.unterschrift === vorAbbruch, 'Rückfrage abgebrochen: bleibt')
    await abschnitt.getByRole('button', { name: 'Löschen' }).click()
    await seite.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
    await seite.getByText('Keine Unterschrift hinterlegt.').waitFor()
    p = await profil()
    pruefe(p.profil.unterschrift === undefined && p.profil.name === 'Erika Musterfrau', 'Gelöscht, Profil sonst unverändert')

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
