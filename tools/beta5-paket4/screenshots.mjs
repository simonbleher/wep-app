// Screenshots für Beta 5, Paket 4 nach docs/beta5-paket4/ (Handy/Tablet): Export-Reiter mit „Export als PDF“ – Fotos als
// Anhang, Unterschrift, offline erzeugen, Rolle Grün/Beides. Alles läuft über die Oberfläche – zugleich ein Durchlauf der
// Bedienung mit Prüfungen am heruntergeladenen PDF (pdfinfo, pdftotext, pdfimages). Alle Daten sind erfunden; die
// „Unterschrift“ ist ein selbst erzeugter Kritzel, die Fotos sind selbst gemalte Bilder.
// Aufruf: npm run beta5-paket4:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Der Vergleich mit dem LibreOffice-PDF der Excel steht in docs/beta5-paket4/vergleich/ (npm run beta5-paket4:vergleich).
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import { chromium } from 'playwright'

const PORT = 4197
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta5-paket4'
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

const kritzel = () => {
  const c = createCanvas(360, 120)
  const g = c.getContext('2d')
  g.strokeStyle = '#1b3f9c'
  g.lineWidth = 5
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(10, 90)
  g.bezierCurveTo(70, 0, 110, 120, 180, 40)
  g.bezierCurveTo(230, 0, 290, 110, 350, 50)
  g.stroke()
  return 'data:image/png;base64,' + c.toBuffer('image/png').toString('base64')
}

const foto = (farbe) => {
  const c = createCanvas(960, 720)
  const g = c.getContext('2d')
  g.fillStyle = farbe
  g.fillRect(0, 0, 960, 720)
  g.fillStyle = '#2f6b2a'
  g.beginPath()
  g.arc(480, 300, 170, 0, 7)
  g.fill()
  g.fillStyle = '#6b4a2a'
  g.fillRect(455, 440, 50, 200)
  return c.toBuffer('image/jpeg').toString('base64')
}

const rechteck = (x, y, b, h) => [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }]
const pos = (id, bezeichnung, anzahl, einheit, einzelpreis) => ({ id, bezeichnung, anzahl, einheit, einzelpreis, preisManuell: true, hinweise: [] })
const formalien = (id, parzelle) => ({
  kleingartenanlage: 'KGA Musterwiese', parzelle, weg: 'Rosenweg', unterpaechter: 'Erika Musterfrau', auftraggeber: 'Bezirksverband Beispielstadt', vertretenDurchRA: '',
  anwesendVerein: 'Hans Vorstand', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann', wertermittlerAussenAufwuchs: 'Max Mustermann',
  wertermittlungAm: '2026-10-14', protokollerstellungAm: '2026-10-20', parzellenflaecheM2: 380, vorgangsNr: id,
})
const symbol = (id, art, x, y, b, h, t) => ({ id, typ: 'symbol', art, x, y, breite: b, hoehe: h, beschriftung: t })
const GRUEN = {
  beschreibungAussen: 'Terrasse und Gartenweg in gutem Zustand.',
  beschreibungAufwuchs: 'Obstbäume und Beerensträucher.',
  aussenanlagen: [pos('a1', 'Terrasse, Betonplatten', 12, 'm²', 18.5), pos('a2', 'Weg, Kies', 14.5, 'm²', 7.25)],
  aufwuchs: [pos('f1', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 60), pos('f2', 'Johannisbeere', 5, 'Stück', 8)],
  beseitigungAA: [{ id: 'b1', gegenstand: 'Thuja fällen und entsorgen', menge: 1, einheit: 'Stück', einzelpreis: 180, faktor: 1.5, begruendung: 'schwierige Zufahrt' }],
}
const SKIZZE = {
  breite: 800, hoehe: 600, raster: true, rasterGroesse: 40,
  elemente: [
    { id: 'g0', typ: 'bauform', art: 'grundstueck', ebene: 'grundlage', fest: true, punkte: rechteck(20, 20, 760, 560) },
    { id: 'g1', typ: 'bauform', art: 'bauteil', ebene: 'grundlage', fest: true, beschriftung: 'L', punkte: rechteck(300, 80, 220, 140) },
    symbol('s1', 'baum', 80, 300, 70, 84, 'Apfel'),
    symbol('s2', 'beet', 380, 330, 140, 70, 'Gemüsebeet'),
    symbol('s3', 'strauch', 200, 460, 64, 56, 'Johannisbeere'),
  ],
}
const BAU = {
  bauteile: [
    { id: 'l1', art: 'laube', kuerzel: 'L', laenge: 5, breite: 4, flaeche: 20, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'holz-doppelwandig', wanddickeCm: 12, maengel: [{ gruppe: 'dach', maengel: ['Beispiel'], abzug: 8, begruendung: 'erfundener Befund' }] },
    { id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 2.5, breite: 2, flaeche: 5, baujahr: 2004, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 6, maengel: [] },
  ],
  abwasser: { art: 'kanal', kanal: { baujahr: 2006, kosten: 1800 }, grube: {} },
  nichtBeraeumt: { aktiv: false },
  ausstattung: {},
  beschreibung: 'Laube in Holzständerbauweise mit Anbau.',
  beseitigung: [],
}
const GRUNDRISS = {
  massketten: true,
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'l1', punkte: rechteck(2, 2, 5, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'A1', bauteilId: 'a1', punkte: rechteck(7, 3, 2.5, 2), hoehe: 2.3, dachform: 'flach' },
  ],
}
const FOTOS = [
  { id: 'f-1', positionId: 'f1', text: 'Apfelbaum von Süden', aufgenommenAm: '2026-10-14T09:00:00.000Z', breite: 960, hoehe: 720, groesse: 30000, farbe: '#bcd9f2' },
  { id: 'f-2', aufgenommenAm: '2026-10-14T09:05:00.000Z', breite: 960, hoehe: 720, groesse: 30000, farbe: '#f2e3bc' },
]
const WEPS = [
  { id: '2026-001', rolle: 'beides', formalien: formalien('2026-001', 'Parzelle 41'), gruen: GRUEN, bau: BAU, grundriss: GRUNDRISS, skizze: SKIZZE, fotos: FOTOS.map(({ farbe, ...f }) => f) },
  { id: '2026-002', rolle: 'gruen', formalien: formalien('2026-002', 'Parzelle 42'), gruen: GRUEN, skizze: SKIZZE },
]

const speichern = (seite, weps, fotos) =>
  seite.evaluate(
    ({ weps, fotos }) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'syncMeta', 'fotos', 'fotoDaten'], 'readwrite')
          for (const w of weps) {
            tx.objectStore('weps').put(w)
            tx.objectStore('syncMeta').put({ id: w.id, lokalGeaendertAm: '2026-10-20T08:00:00.000Z' })
          }
          for (const f of fotos) {
            const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))
            const key = `2026-001/${f.id}`
            tx.objectStore('fotos').put({ key, wepId: '2026-001', id: f.id, hatDatei: true, hochgeladen: true, erstelltAm: '2026-10-14T09:00:00.000Z' })
            tx.objectStore('fotoDaten').put({ key, blob: new Blob([bytes], { type: 'image/jpeg' }) })
          }
          tx.oncomplete = ok
          tx.onerror = fehler
        }
      }),
    { weps, fotos },
  )

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
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'de-DE', acceptDownloads: true })
    const seite = await kontext.newPage()
    seite.on('pageerror', (e) => fehler.push(`${groesse}: ${e.message}`))
    const handy = groesse === 'handy'
    const bild = async (name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`  ${ZIEL}/${groesse}-${name}.png`)
    }
    const oeffneExport = async (parzelle) => {
      await seite.getByRole('button', { name: new RegExp(parzelle) }).click()
      await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
      await (handy ? seite.getByRole('button', { name: 'Export', exact: true }) : seite.getByRole('button', { name: 'Export als Excel' })).click()
      await seite.getByRole('heading', { name: 'Export als PDF' }).waitFor()
    }
    const erzeuge = async (datei) => {
      const [download] = await Promise.all([seite.waitForEvent('download', { timeout: 60000 }), seite.getByRole('button', { name: 'PDF exportieren' }).click()])
      await seite.getByText(/PDF erstellt:/).waitFor({ timeout: 60000 })
      await download.saveAs(datei)
      return download.suggestedFilename()
    }
    const text = (datei) => execFileSync('pdftotext', ['-layout', datei, '-']).toString()
    const seiten = (datei) => Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [datei]).toString())?.[1] ?? 0)
    const bilder = (datei) => Math.max(0, execFileSync('pdfimages', ['-list', datei]).toString().trim().split('\n').length - 2)

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate((u) => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'beides', standardAnlage: 'KGA Musterwiese', baupreisindex: { 2026: 184.3 }, unterschrift: u } })), kritzel())
    await speichern(seite, WEPS, FOTOS.map((f) => ({ id: f.id, base64: foto(f.farbe) })))
    await seite.reload()

    // 1. Rolle „beides“: PDF-Bereich, ohne Fotos und Unterschrift
    await oeffneExport('Parzelle 41')
    pruefe(await seite.getByText(/Das PDF sieht aus wie die Blätter der BV-Vorlage/).isVisible(), 'Export-Reiter: Abschnitt „Export als PDF“ mit Erklärung')
    await seite.getByRole('heading', { name: 'Export als PDF' }).scrollIntoViewIfNeeded()
    await bild('1-pdf-bereich')
    const d1 = `/tmp/wep-pdf-${groesse}-1.pdf`
    const name1 = await erzeuge(d1)
    pruefe(name1 === '2026-001_WEP.pdf', `Dateiname ${name1}`)
    pruefe(seiten(d1) >= 10, `PDF ohne Anhang: ${seiten(d1)} Seiten (Deckblatt, Baulichkeiten ×2, Mängelliste, Außenanlagen, Aufwuchs, Beseitigung, Skizzen, Abkürzungen)`)
    pruefe(/Anlage 1 \(Blatt 1\)/.test(text(d1)) && /Anlage 2 – Bewertung Außenanlagen/.test(text(d1)), 'Beides: Bau- und Grün-Blätter im PDF')
    pruefe(!/Fotoanhang/.test(text(d1)) && bilder(d1) === 0, 'Ohne Schalter: kein Fotoanhang, keine Unterschrift')
    await bild('2-pdf-fertig')

    // 2. Mit Fotos und Unterschrift
    await seite.getByText(/Fotos als Anhang/).click()
    await seite.getByText(/Mit meiner Unterschrift versehen/).click()
    await bild('3-mit-fotos-und-unterschrift')
    const d2 = `/tmp/wep-pdf-${groesse}-2.pdf`
    await erzeuge(d2)
    pruefe(/Fotoanhang/.test(text(d2)) && /Apfelbaum von Süden/.test(text(d2)) && /Nr\. 03 – Apfel/.test(text(d2)), 'Mit Fotos: Anhang mit Positionsnummer und Text')
    pruefe(bilder(d2) === 16, `Mit Fotos und Unterschrift: ${bilder(d2)} Bildeinträge (2 Fotos, 7 Unterschriften auf Bau- und Grün-Blättern, je mit Maske)`)
    pruefe(seiten(d2) === seiten(d1) + 1, 'Ein Foto-Seite mehr')

    // 3. Offline erzeugen
    await kontext.setOffline(true)
    const d3 = `/tmp/wep-pdf-${groesse}-3.pdf`
    await erzeuge(d3)
    pruefe(seiten(d3) === seiten(d2), 'Offline erzeugt: gleiches PDF (Bibliothek und Daten sind auf dem Gerät)')
    await kontext.setOffline(false)

    // 4. Speichern unter … wiederholen
    const [nochmal] = await Promise.all([seite.waitForEvent('download'), seite.getByRole('button', { name: 'Speichern unter …' }).click()])
    pruefe(nochmal.suggestedFilename() === '2026-001_WEP.pdf', '„Speichern unter …“ lädt dieselbe Datei erneut')

    // 5. Rolle Grün: nur Grün-Blätter
    await seite.reload()
    await oeffneExport('Parzelle 42')
    await seite.getByText(/Mit meiner Unterschrift versehen/).click()
    const d4 = `/tmp/wep-pdf-${groesse}-4.pdf`
    await erzeuge(d4)
    pruefe(!/Anlage 1 \(Blatt/.test(text(d4)) && /Anlage 3 – Bewertung Aufwuchs/.test(text(d4)), 'Grün: keine Bau-Blätter')
    pruefe(bilder(d4) === 8, `Grün mit Unterschrift: ${bilder(d4)} Bildeinträge = 4 Unterschriften (Außenanlagen, Aufwuchs, Beseitigung, Skizze) mit je einer Transparenzmaske`)
    if (!handy) {
      copyFileSync(d2, `${ZIEL}/app-beides-mit-fotos-und-unterschrift.pdf`)
      copyFileSync(d4, `${ZIEL}/app-gruen-mit-unterschrift.pdf`)
      execFileSync('pdftoppm', ['-png', '-r', '70', '-f', '2', '-l', '2', '-singlefile', d4, `${ZIEL}/seite-aussenanlagen-mit-unterschrift`])
    }
    await bild('4-gruen')
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
