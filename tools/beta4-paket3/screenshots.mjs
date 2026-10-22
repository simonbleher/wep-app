// Screenshots für Beta 4, Paket 3 nach docs/beta4-paket3/ (Handy/Tablet): Skizze Bau – leer, Rechteck gezeichnet und mit
// dem Bauteil verknüpft, Länge eintippen, zweites Teil mit Satteldach, Vieleck (L-Form, Keller), Massenberechnung, Bauteil
// mit Fläche aus dem Grundriss, Export. Alles läuft über die Oberfläche (Maus-Ereignisse auf der Zeichenfläche) – das ist
// zugleich ein Durchlauf der Bedienung mit Prüfungen. Alle Daten sind erfunden.
// Aufruf: npm run beta4-paket3:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const PORT = 4194
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta4-paket3'
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
const wep = (id, parzelle, extra = {}) => ({
  id,
  rolle: 'bau',
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle, weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann',
    wertermittlerAussenAufwuchs: '', wertermittlungAm: '2025-10-14', protokollerstellungAm: '', parzellenflaecheM2: 350, vorgangsNr: id,
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
  ...extra,
})
const BAU = {
  bauteile: [
    bt({ id: 'l1', art: 'laube', kuerzel: 'L', laenge: 4.5, breite: 5, flaeche: 22.5, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'holz-doppelwandig', wanddickeCm: 12 }),
    bt({ id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 1.5, breite: 2.5, flaeche: 3.75, baujahr: 2004, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 6 }),
  ],
  abwasser: { art: 'keine', kanal: {}, grube: {} },
  nichtBeraeumt: { aktiv: false },
  ausstattung: {},
  beschreibung: '',
  beseitigung: [],
}
const WEPS = [wep('2026-001', 'Parzelle 42', { bau: BAU })]

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
    const reiter = (name) => nav.getByRole('button', { name }).first().click()
    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'bau', standardAnlage: 'KGA Musterwiese', baupreisindex: { 2026: 184.3 } } })))
    await speichern(seite, WEPS)
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await reiter('Skizze Bau')
    await seite.getByRole('heading', { name: 'Skizze Bau' }).waitFor()
    const flaeche = seite.getByTestId('grundriss-flaeche')
    await flaeche.scrollIntoViewIfNeeded()

    /** Meter auf der Zeichenfläche → Bildschirmpunkt (die Fläche ist 20 × 15 m). */
    const pos = async (xm, ym) => {
      await flaeche.scrollIntoViewIfNeeded()
      const k = await flaeche.boundingBox()
      return { x: k.x + (xm / 20) * k.width, y: k.y + (ym / 15) * k.height }
    }
    const zieh = async (a, b) => {
      const p = await pos(...a)
      const q = await pos(...b)
      await seite.mouse.move(p.x, p.y)
      await seite.mouse.down()
      await seite.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 })
      await seite.mouse.move(q.x, q.y, { steps: 4 })
      await seite.mouse.up()
    }
    const tippe = async (xm, ym) => {
      const p = await pos(xm, ym)
      await seite.mouse.click(p.x, p.y)
    }
    const werkzeug = (name) => seite.getByRole('button', { name, exact: true }).click()
    const klicke = async (name) => seite.getByRole('button', { name, exact: true }).click()

    await seite.getByText('Noch kein Grundriss').waitFor()
    await bild('0-leer')

    // Laube: Rechteck ziehen – das Bauteil L (4,5 × 5 m, aus Paket 2) ist noch ohne Grundriss und wird verknüpft
    await werkzeug('Rechteck')
    await zieh([3, 3], [7, 7])
    await seite.getByRole('group', { name: 'Ausgewähltes Teil' }).waitFor()
    pruefe((await seite.getByLabel('Bauteil (Bewertung)').inputValue()) === 'l1', 'Rechteck ist mit dem Bauteil L verknüpft')
    pruefe((await seite.getByLabel('Länge (m)').inputValue()) === '5' && (await seite.getByLabel('Breite (m)').inputValue()) === '4,5', 'Rechteck übernimmt die Maße des Bauteils (5 × 4,5 m)')
    await bild('1-rechteck-verknuepft')

    // Länge antippen und eintippen: untere Kante (zwischen den Ecken unten links und rechts)
    await werkzeug('Auswählen')
    await tippe(5.5, 7.5) // untere Kante: y = 3 + 4,5 = 7,5
    await seite.getByLabel(/Länge der Kante 3/).waitFor()
    await seite.getByLabel(/Länge der Kante 3/).fill('6')
    pruefe((await seite.getByLabel('Länge (m)').inputValue()) === '6', 'Kante eintippen: Länge 6 m, die Form hat sich angepasst')
    await seite.getByLabel('Wandhöhe (Traufe) (m)').or(seite.getByLabel('Höhe (m)')).first().fill('2,2')
    await seite.getByLabel('Dachform').selectOption('sattel')
    await seite.getByLabel('Firsthöhe (m)').fill('3,1')
    await bild('2-laenge-getippt')
    const massen = await seite.getByTestId('grundriss-massen').innerText()
    pruefe(/Fläche 27,00 m²/.test(massen) && /Kubatur 71,55 m³/.test(massen), `Fläche 27 m², Kubatur 71,55 m³ (${massen.trim()})`)

    // Anbau rechts daneben (rastet an der Laubenkante ein); Maße des Bauteils A1 (1,5 × 2,5 m) werden übernommen
    await werkzeug('Rechteck')
    await zieh([9.02, 3.5], [11, 6])
    await seite.getByRole('group', { name: 'Ausgewähltes Teil' }).waitFor()
    pruefe((await seite.getByLabel('Bauteil (Bewertung)').inputValue()) === 'a1', 'Zweites Rechteck ist mit dem Anbau A1 verknüpft')
    await seite.getByLabel('Höhe (m)').fill('2,3')

    // Keller als L-Form (Vieleck), gestrichelt, als neues Bauteil
    await werkzeug('Vieleck')
    for (const p of [[12, 8], [16, 8], [16, 9.5], [14, 9.5], [14, 11], [12, 11]]) await tippe(...p)
    await klicke('Fertig')
    await seite.getByRole('group', { name: 'Ausgewähltes Teil' }).waitFor()
    await seite.getByLabel('Bauteil (Bewertung)').selectOption('neu:keller')
    await seite.getByLabel('Höhe (m)').fill('2')
    pruefe(await seite.getByText('6 Ecken').first().isVisible(), 'L-Form hat 6 Ecken; eine Kante antippen ändert ihr Maß')
    await werkzeug('Auswählen')
    await tippe(18, 13) // leere Stelle: Auswahl aufheben
    await seite.getByTestId('massenberechnung').scrollIntoViewIfNeeded()
    await bild('3-massenberechnung')
    const tabelle = await seite.getByTestId('massenberechnung').innerText()
    pruefe(/Summe/.test(tabelle) && /6 × 4,5 m/.test(tabelle) && /\bA1\b/.test(tabelle) && /\bK\b/.test(tabelle), 'Massenberechnung zeigt alle drei Teile')
    pruefe(/27,00 m²/.test(tabelle) && /71,55 m³/.test(tabelle), 'Massenberechnung: Laube 27,00 m², 71,55 m³')

    // Zoomen und Ausschnitt: Beta-3-Bedienung bleibt (Knopf Hineinzoomen), die Daten bleiben gleich
    await flaeche.scrollIntoViewIfNeeded()
    await seite.getByRole('button', { name: 'Hineinzoomen' }).click()
    pruefe(await seite.getByText(/Zoom 150 %/).isVisible(), 'Zoom 150 %')
    await bild('4-gezoomt')
    await seite.getByRole('button', { name: 'Ganze Skizze' }).click()

    // Bauteil im Reiter Baulichkeiten: Fläche kommt aus dem Grundriss
    await reiter('Baulichkeiten')
    await seite.getByText('Baulichkeiten insgesamt').waitFor()
    pruefe(await seite.getByText(/27 m² · Bauklasse/).first().isVisible(), 'Baulichkeiten: Laube hat 27 m² aus dem Grundriss')
    await bild('5-baulichkeiten-flaeche')
    await seite.getByRole('button', { name: /L · Laube/ }).click()
    await seite.getByText(/Aus dem Grundriss \(Skizze Bau\)/).waitFor()
    await bild('6-bauteil-aus-grundriss')
    await seite.getByRole('button', { name: 'Abbrechen' }).first().click({ force: true }).catch(() => {})

    // Export
    await (handy ? seite.getByRole('button', { name: 'Export', exact: true }) : seite.getByRole('button', { name: 'Export als Excel' })).click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    const [download] = await Promise.all([seite.waitForEvent('download'), seite.getByRole('button', { name: 'Excel exportieren' }).click()])
    await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
    await seite.getByText(/Grundriss ins Blatt „Skizze Bau“ eingefügt/).waitFor()
    await bild('7-export')
    const zip = await JSZip.loadAsync(readFileSync(await download.path()))
    const drawing = await zip.file('xl/drawings/drawing8.xml').async('string')
    pruefe(/name="L" descr="wep-app"/.test(drawing) && /name="A1" descr="wep-app"/.test(drawing) && /custGeom/.test(drawing), 'Excel: Formen L, A1 und Keller (Freiform) in „Skizze Bau“')
    pruefe(/Massenberechnung/.test(drawing) && /71,55 m³/.test(drawing), 'Excel: Massenberechnung steht in der Skizze')
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
