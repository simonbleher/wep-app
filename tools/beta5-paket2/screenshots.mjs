// Screenshots und Durchlauf für Beta 5, Paket 2 nach docs/beta5-paket2/ (Handy/Tablet): WEP teilen als .wep-Datei
// (Schalter Fotos/Bau-Excel mit Größe, Hinweis Personendaten, „Speichern unter…“), Öffnen in der App mit Vorschau
// (neu / gleich / unterschiedlich, Auswahl je Teil), Weg Bau → Grün → Bau, kaputte und fremde Dateien.
// Zwei Browser-Kontexte stehen für zwei Geräte; die Datei geht über die Festplatte. Alle Daten sind erfunden.
// Aufruf: npm run beta5-paket2:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const PORT = 4196
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta5-paket2'
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
const BAU = (beschreibung) => ({
  bauteile: [
    bt({ id: 'l1', art: 'laube', kuerzel: 'L', laenge: 5, breite: 4.5, flaeche: 22.5, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'holz-doppelwandig', wanddickeCm: 12 }),
    bt({ id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 2.5, breite: 1.5, flaeche: 3.75, baujahr: 2004, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 6 }),
  ],
  abwasser: { art: 'keine', kanal: {}, grube: {} },
  nichtBeraeumt: { aktiv: false },
  ausstattung: {},
  beschreibung,
  beseitigung: [],
})
const GRUNDRISS = {
  massketten: true,
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'l1', punkte: rechteck(2, 2, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'A1', bauteilId: 'a1', punkte: rechteck(8, 3, 2, 3), hoehe: 2.3, dachform: 'flach' },
  ],
}
const wepBau = () => ({
  id: '2026-001',
  rolle: 'beides',
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle: 'Parzelle 42', weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann',
    wertermittlerAussenAufwuchs: '', wertermittlungAm: '2025-10-14', protokollerstellungAm: '', parzellenflaecheM2: 380, vorgangsNr: '2026-001',
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
  bau: BAU('Laube 22,5 m² mit Anbau'),
  grundriss: GRUNDRISS,
  fotos: [
    { id: 'fa1', text: 'Laube Südseite', aufgenommenAm: '2026-10-20T08:00:00.000Z', breite: 320, hoehe: 240, groesse: 9000 },
    { id: 'fa2', text: 'Anbau', aufgenommenAm: '2026-10-20T08:01:00.000Z', breite: 320, hoehe: 240, groesse: 9000 },
  ],
})

/** Legt WEP, Fotos (echte kleine JPEGs) und Bau-Excel auf dem „Gerät“ ab. */
const seed = (seite, wep, bauExcelBase64) =>
  seite.evaluate(
    async ([wep, bauBase64]) => {
      const jpeg = async (farbe) => {
        const c = document.createElement('canvas')
        c.width = 320
        c.height = 240
        const g = c.getContext('2d')
        g.fillStyle = farbe
        g.fillRect(0, 0, 320, 240)
        return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8))
      }
      const bilder = []
      for (const [i, f] of (wep.fotos ?? []).entries()) bilder.push([f, await jpeg(['#7cb342', '#8d6e63'][i % 2])])
      const bau = bauBase64 ? Uint8Array.from(atob(bauBase64), (c) => c.charCodeAt(0)) : undefined
      if (bau) wep.bauExcel = { name: 'WEP Bau Testgarten.xlsx', groesse: bau.length, version: 'v-test-1', hinzugefuegtAm: '2026-10-20T08:00:00.000Z' }
      await new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'syncMeta', 'fotos', 'fotoDaten', 'bauExcel', 'bauExcelDaten'], 'readwrite')
          tx.objectStore('weps').put(wep)
          tx.objectStore('syncMeta').put({ id: wep.id, lokalGeaendertAm: '2026-10-20T08:00:00.000Z' })
          for (const [f, blob] of bilder) {
            const key = `${wep.id}/${f.id}`
            tx.objectStore('fotos').put({ key, wepId: wep.id, id: f.id, vorschau: blob, hatDatei: true, hochgeladen: false, erstelltAm: f.aufgenommenAm })
            tx.objectStore('fotoDaten').put({ key, blob })
          }
          if (bau) {
            tx.objectStore('bauExcel').put({ wepId: wep.id, version: 'v-test-1', hatDatei: true, hochgeladen: false, erstelltAm: '2026-10-20T08:00:00.000Z' })
            tx.objectStore('bauExcelDaten').put({ wepId: wep.id, blob: new Blob([bau]) })
          }
          tx.oncomplete = ok
          tx.onerror = fehler
        }
      })
    },
    [wep, bauExcelBase64],
  )

/** Liest ein WEP und die Anzahl der Dateien direkt aus der Datenbank des „Geräts“. */
const lies = (seite, id) =>
  seite.evaluate(
    (id) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'fotoDaten', 'bauExcelDaten'], 'readonly')
          const w = tx.objectStore('weps').get(id)
          const f = tx.objectStore('fotoDaten').getAllKeys()
          const b = tx.objectStore('bauExcelDaten').getAllKeys()
          tx.oncomplete = () => ok({ wep: w.result, fotoDateien: f.result.filter((k) => String(k).startsWith(`${id}/`)).length, bauExcelDatei: b.result.includes(id) })
          tx.onerror = fehler
        }
      }),
    id,
  )

/** Ändert ein WEP „von Hand“ in der Datenbank (wie eine Bearbeitung auf dem Gerät). */
const aendere = (seite, id, text) =>
  seite.evaluate(
    ([id, text]) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'syncMeta'], 'readwrite')
          const g = tx.objectStore('weps').get(id)
          g.onsuccess = () => {
            const w = g.result
            new Function('w', text)(w)
            tx.objectStore('weps').put(w)
            tx.objectStore('syncMeta').put({ id, lokalGeaendertAm: new Date().toISOString() })
          }
          tx.oncomplete = ok
          tx.onerror = fehler
        }
      }),
    [id, text],
  )

const pruefe = (bedingung, text) => {
  if (!bedingung) throw new Error(`Prüfung fehlgeschlagen: ${text}`)
  console.log(`  ✓ ${text}`)
}

// Test-Bau-Excel (erfundene Daten) als Anhang
const bauOrdner = mkdtempSync(join(tmpdir(), 'wep-teilen5-'))
const bauDatei = join(bauOrdner, 'WEP Bau Testgarten.xlsx')
execFileSync('npx', ['vite-node', 'tools/beta5-paket1/erzeuge-test-bau-excel.ts', '--', bauDatei], { stdio: 'ignore' })
const bauBase64 = readFileSync(bauDatei).toString('base64')

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
    const ordner = mkdtempSync(join(tmpdir(), `wep-teilen5-${groesse}-`))
    const geraet = async (name) => {
      const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE', acceptDownloads: true })
      const seite = await kontext.newPage()
      seite.on('pageerror', (e) => fehler.push(`${groesse}/${name}: ${e.message}`))
      await seite.goto(URL)
      await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
      await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
      await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'beides', standardAnlage: 'KGA Musterwiese', baupreisindex: { 2026: 184.3 } } })))
      return { kontext, seite }
    }
    const bild = async (seite, name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`  ${ZIEL}/${groesse}-${name}.png`)
    }
    const oeffneWep = async (seite, text) => {
      await seite.getByRole('button', { name: new RegExp(text) }).first().click()
      await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
    }
    /** WEP teilen → Datei auf der Festplatte */
    const teile = async (seite, { fotos, bau }, dateiname) => {
      await seite.locator('button[aria-label="Weitere Aktionen"]:visible').first().click()
      await seite.getByRole('menuitem', { name: /Teilen/ }).click()
      const dialog = seite.getByRole('dialog', { name: 'WEP teilen' })
      await dialog.waitFor()
      if (fotos) await dialog.getByLabel(/Fotos mitschicken/).check()
      if (bau) await dialog.getByLabel(/Bau-Excel mitschicken/).check()
      return { dialog, speichern: async () => {
        const [download] = await Promise.all([seite.waitForEvent('download'), dialog.getByRole('button', { name: /Speichern unter/ }).click()])
        const pfad = join(ordner, dateiname)
        await download.saveAs(pfad)
        return { pfad, name: download.suggestedFilename() }
      } }
    }

    // --- Gerät A (Bau-Wertermittler) ---------------------------------------------------------
    const a = await geraet('A')
    await seed(a.seite, wepBau(), bauBase64)
    await a.seite.reload()
    await a.seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await oeffneWep(a.seite, 'Parzelle 42')
    const t1 = await teile(a.seite, { fotos: false, bau: false }, 'leicht.wep')
    pruefe(await t1.dialog.getByText(/enthält Personendaten/).isVisible(), 'Teilen: Hinweis auf Personendaten')
    pruefe(await t1.dialog.getByText(/2 Fotos, ca\. \d+ KB/).isVisible(), 'Teilen: Fotos mit Größenangabe')
    pruefe(await t1.dialog.getByText(/WEP Bau Testgarten\.xlsx, ca\. /).isVisible(), 'Teilen: Bau-Excel mit Größenangabe')
    pruefe(await t1.dialog.getByText('2026-001_KGA_Musterwiese.wep').isVisible(), 'Teilen: Dateiname <Vorgangs-Nr>_<Anlage>.wep')
    await bild(a.seite, '1-teilen-dialog')
    const leicht = await t1.speichern()
    pruefe(leicht.name === '2026-001_KGA_Musterwiese.wep', `Datei heißt ${leicht.name}`)
    await a.seite.getByRole('dialog', { name: 'WEP teilen' }).getByText(/heruntergeladen/).waitFor()
    await bild(a.seite, '2-teilen-fertig')
    const zLeicht = await JSZip.loadAsync(readFileSync(leicht.pfad))
    pruefe(Object.keys(zLeicht.files).join() === 'wep.json', 'Ohne Schalter: nur wep.json in der Datei')
    await a.seite.getByRole('dialog', { name: 'WEP teilen' }).getByRole('button', { name: 'Schließen' }).click()

    const t2 = await teile(a.seite, { fotos: true, bau: true }, 'voll.wep')
    const voll = await t2.speichern()
    const zVoll = await JSZip.loadAsync(readFileSync(voll.pfad))
    pruefe(Object.keys(zVoll.files).sort().join() === 'bau.xlsx,fotos/fa1.jpg,fotos/fa2.jpg,wep.json', 'Mit Schaltern: Fotos und Bau-Excel liegen in der Datei')
    pruefe(JSON.parse(await zVoll.file('wep.json').async('string')).format === 'wep-teilen/1', 'Formatversion wep-teilen/1')
    await a.seite.getByRole('dialog', { name: 'WEP teilen' }).getByRole('button', { name: 'Schließen' }).click()

    // --- Gerät B (Grün-Wertermittler): öffnet die Datei ----------------------------------------
    const b = await geraet('B')
    await b.seite.getByTestId('wep-datei-eingabe').setInputFiles(voll.pfad)
    const vorschau = b.seite.getByRole('dialog', { name: 'WEP-Datei öffnen' })
    await vorschau.getByRole('region', { name: 'Vorschau der WEP-Datei' }).waitFor()
    pruefe(await vorschau.getByText('Neu', { exact: true }).isVisible(), 'Vorschau: „Neu“ auf dem leeren Gerät')
    pruefe(/2 Fotos, Bau-Excel/.test(await vorschau.innerText()), 'Vorschau nennt Fotos und Bau-Excel')
    await bild(b.seite, '3-oeffnen-neu')
    await vorschau.getByRole('button', { name: /^Einspielen/ }).click()
    const fertigB = b.seite.getByRole('dialog', { name: 'WEP-Datei geöffnet' })
    await fertigB.getByText(/WEP 2026-001 eingespielt/).waitFor()
    await bild(b.seite, '4-oeffnen-eingespielt')
    const gelandet = await lies(b.seite, '2026-001')
    pruefe(gelandet.fotoDateien === 2 && gelandet.bauExcelDatei, 'Auf Gerät B: 2 Fotos und Bau-Excel angekommen')
    pruefe(gelandet.wep.bau?.beschreibung === 'Laube 22,5 m² mit Anbau' && gelandet.wep.grundriss?.teile.length === 2, 'Auf Gerät B: Bau-Teil und Grundriss angekommen')
    await fertigB.getByRole('button', { name: 'WEP öffnen' }).click()
    await b.seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
    await bild(b.seite, '5-wep-auf-geraet-b')

    // Dieselbe Datei nochmal: gleich, nichts zu tun
    await b.seite.reload()
    await b.seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await b.seite.getByTestId('wep-datei-eingabe').setInputFiles(voll.pfad)
    const gleich = b.seite.getByRole('dialog', { name: 'WEP-Datei öffnen' })
    await gleich.getByText('Gleich', { exact: true }).waitFor()
    pruefe((await gleich.getByRole('button', { name: /^Einspielen/ }).isDisabled()), 'Gleich: „Einspielen“ ist aus, nichts zu tun')
    await bild(b.seite, '6-oeffnen-gleich')
    await gleich.getByRole('button', { name: 'Abbrechen' }).click()

    // --- B erfasst Grün und schickt es zurück; A hat inzwischen den Bau-Teil geändert -----------
    await aendere(b.seite, '2026-001', "w.gruen.beschreibungAussen = 'Rasen, Hochbeet und zwei Obstbäume'; w.gruen.aufwuchs.push({ id: 'p1', katalogId: 'x', bezeichnung: 'Apfel, Halbstamm', menge: 2, einheit: 'Stück', zustand: 1, einzelpreis: 50, hoechstwert: 50, hinweise: [] })")
    await b.seite.reload()
    await b.seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await oeffneWep(b.seite, 'Parzelle 42')
    const t3 = await teile(b.seite, { fotos: false, bau: false }, 'zurueck.wep')
    const zurueck = await t3.speichern()
    await b.seite.getByRole('dialog', { name: 'WEP teilen' }).getByRole('button', { name: 'Schließen' }).click()
    await aendere(a.seite, '2026-001', "w.bau.beschreibung = 'Laube 22,5 m² mit Anbau, Dach neu gedeckt'")
    await a.seite.reload()
    await a.seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await a.seite.getByTestId('wep-datei-eingabe').setInputFiles(zurueck.pfad)
    const abw = a.seite.getByRole('dialog', { name: 'WEP-Datei öffnen' })
    await abw.getByText('Weicht ab', { exact: true }).waitFor()
    pruefe(await abw.getByRole('combobox', { name: 'Entscheidung für Bau-Teil' }).isVisible() && await abw.getByRole('combobox', { name: 'Entscheidung für Grün-Teil' }).isVisible(), 'Vorschau: Auswahl je Teil (Bau-Teil, Grün-Teil)')
    pruefe(await abw.getByRole('button', { name: /^Einspielen/ }).isDisabled(), 'Abweichung: standardmäßig bleibt alles beim Alten, „Einspielen“ ist aus')
    await bild(a.seite, '7-oeffnen-weicht-ab')

    // Nichts still überschrieben: Abbrechen ändert nichts
    await abw.getByRole('button', { name: 'Abbrechen' }).click()
    const vorher = await lies(a.seite, '2026-001')
    pruefe(vorher.wep.bau.beschreibung.endsWith('Dach neu gedeckt') && vorher.wep.gruen.aufwuchs.length === 0, 'Abbrechen: nichts verändert')

    // Bau → Grün in der App: „Grün-Teil übernehmen, Bau-Teil behalten“
    await a.seite.getByTestId('wep-datei-eingabe').setInputFiles(zurueck.pfad)
    const abw2 = a.seite.getByRole('dialog', { name: 'WEP-Datei öffnen' })
    await abw2.getByRole('combobox', { name: 'Entscheidung für Grün-Teil' }).selectOption('uebernehmen')
    pruefe(await abw2.getByRole('button', { name: 'Einspielen (1 Teil)' }).isEnabled(), 'Nach der Wahl: „Einspielen (1 Teil)“')
    await bild(a.seite, '8-wahl-gruen-uebernehmen-bau-behalten')
    await abw2.getByRole('button', { name: /^Einspielen/ }).click()
    const fertigA = a.seite.getByRole('dialog', { name: 'WEP-Datei geöffnet' })
    await fertigA.getByText(/WEP 2026-001 eingespielt: Grün-Teil/).waitFor()
    await bild(a.seite, '9-eingespielt-gruen')
    const nachher = await lies(a.seite, '2026-001')
    pruefe(nachher.wep.gruen.beschreibungAussen.startsWith('Rasen') && nachher.wep.gruen.aufwuchs.length === 1, 'Grün-Teil von B übernommen')
    pruefe(nachher.wep.bau.beschreibung.endsWith('Dach neu gedeckt') && nachher.fotoDateien === 2 && nachher.bauExcelDatei, 'Bau-Teil, Fotos und Bau-Excel von A blieben erhalten')
    await fertigA.getByRole('button', { name: 'Schließen' }).click()

    // --- Kaputte und fremde Dateien ------------------------------------------------------------
    const text = join(ordner, 'kaputt.wep')
    writeFileSync(text, 'Das ist keine WEP-Datei')
    const fremd = join(ordner, 'fremd.wep')
    const fz = new JSZip()
    fz.file('wep.json', JSON.stringify({ format: 'wep-teilen/9', wep: {} }))
    writeFileSync(fremd, await fz.generateAsync({ type: 'uint8array' }))
    const sicherung = join(ordner, 'sicherung.wep')
    const sz = new JSZip()
    sz.file('sicherung.json', JSON.stringify({ format: 'wep-sicherung/1' }))
    writeFileSync(sicherung, await sz.generateAsync({ type: 'uint8array' }))
    for (const [pfad, muster, bildname] of [
      [text, /keine WEP-Datei/, '10-fehler-kaputt'],
      [fremd, /wep-teilen\/9.*aktualisieren/, '11-fehler-neuere-version'],
      [sicherung, /Sicherung, keine einzelne WEP-Datei/, '12-fehler-sicherung'],
    ]) {
      await a.seite.getByTestId('wep-datei-eingabe').setInputFiles(pfad)
      const d = a.seite.getByRole('dialog', { name: 'WEP-Datei öffnen' })
      await d.getByRole('alert').waitFor()
      pruefe(muster.test(await d.getByRole('alert').innerText()), `Fehlertext passt: ${muster}`)
      pruefe(await d.getByRole('button', { name: /^Einspielen/ }).count() === 0, 'Bei Fehlern gibt es nichts einzuspielen')
      await bild(a.seite, bildname)
      await d.getByRole('button', { name: 'Schließen' }).click()
    }
    pruefe(JSON.stringify((await lies(a.seite, '2026-001')).wep) === JSON.stringify(nachher.wep), 'Fehlerhafte Dateien haben nichts verändert')

    await a.kontext.close()
    await b.kontext.close()
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
