// Screenshots der Änderungen aus Beta 3, Paket 6 für docs/paket6/ (Handy/Tablet, jeweils normal und mit
// Sonnen-Kontrast): Suche in der Liste, Problempflanzen-Warnung, Sicherung mit Vorschau.
// Aufruf: npm run paket6:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Alle Daten sind erfunden.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const PORT = 4187
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/paket6'
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

const pos = (id, bezeichnung, anzahl, einheit, preis, zustand = 'gut') => ({
  id, bezeichnung, anzahl, einheit, zustand, einzelpreis: preis, preisManuell: false, hinweise: [],
})
const wep = (id, anlage, parzelle, paechter, extra = {}) => ({
  id,
  formalien: {
    kleingartenanlage: anlage, parzelle, weg: '', unterpaechter: paechter, auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: '',
    wertermittlerAussenAufwuchs: 'Max Mustermann', wertermittlungAm: '2026-10-14', protokollerstellungAm: '', parzellenflaecheM2: 350,
    vorgangsNr: id,
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
  ...extra,
})
const WEPS = [
  wep('2026-001', 'KGA Musterwiese', 'Parzelle 42', 'Erika Musterfrau', { status: 'exportiert' }),
  wep('2026-002', 'KGA Hügelblick', 'Parzelle 31', 'Familie Beispiel', { status: 'fertig' }),
  wep('2026-003', 'KGA Seeblick', 'Parzelle 7', 'Hans Probe', {
    gruen: {
      beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], beseitigungAA: [],
      aufwuchs: [
        pos('w1', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 64),
        pos('w2', 'Japanischer Staudenknöterich', 3, 'm²', 1, 'schlecht'),
        pos('w3', 'Blaufichte', 1, 'Stück', 1, 'schlecht'),
      ],
    },
  }),
  wep('2026-004', 'KGA Musterwiese', 'Parzelle 108', 'Hans Beispiel'),
]
const ZEITEN = { '2026-001': '2026-10-14T09:00:00.000Z', '2026-002': '2026-10-16T09:00:00.000Z', '2026-003': '2026-10-20T08:00:00.000Z', '2026-004': '2026-10-18T09:00:00.000Z' }

const speichern = (seite, weps) =>
  seite.evaluate(
    ({ weps, zeiten }) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'syncMeta'], 'readwrite')
          for (const w of weps) {
            tx.objectStore('weps').put(w)
            tx.objectStore('syncMeta').put({ id: w.id, lokalGeaendertAm: zeiten[w.id] })
          }
          tx.oncomplete = ok
          tx.onerror = fehler
        }
      }),
    { weps, zeiten: ZEITEN },
  )

const ordner = mkdtempSync(join(tmpdir(), 'wep-paket6-'))
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
    for (const sonne of [false, true]) {
      const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE', acceptDownloads: true })
      const seite = await kontext.newPage()
      const handy = groesse === 'handy'
      const praefix = `${groesse}${sonne ? '-sonne' : ''}`
      const bild = async (name, voll = false) => {
        await seite.waitForTimeout(300)
        await seite.screenshot({ path: `${ZIEL}/${praefix}-${name}.png`, fullPage: voll })
        console.log(`${ZIEL}/${praefix}-${name}.png`)
      }
      await seite.goto(URL)
      await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
      await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
      await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'gruen', standardAnlage: 'KGA Musterwiese' } })))
      await speichern(seite, WEPS)
      if (sonne) await seite.evaluate(() => localStorage.setItem('wep-geraete-einstellungen', JSON.stringify({ nurWlan: true, sonnenKontrast: true })))
      await seite.reload()
      await seite.getByRole('button', { name: /Parzelle 42/ }).waitFor()

      // 1. Liste mit Suche, Status-Filter und Sortierung
      await bild('1-liste')
      await seite.getByRole('searchbox', { name: 'Protokolle durchsuchen' }).fill('beispiel')
      await seite.waitForTimeout(200)
      await bild('2-suche-beispiel')
      await seite.getByRole('searchbox', { name: 'Protokolle durchsuchen' }).fill('')

      // 2. Problempflanzen im Aufwuchs
      await seite.getByRole('button', { name: /Parzelle 7/ }).click()
      await (handy ? seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Aufwuchs' }) : seite.getByLabel('Abschnitte').getByRole('button', { name: /^Aufwuchs/ })).click()
      await seite.getByRole('button', { name: 'Zur Beseitigung' }).first().waitFor()
      await bild('3-problempflanzen')
      await seite.getByRole('button', { name: 'Zur Beseitigung' }).first().click()
      await seite.getByLabel(/^Gegenstand/).waitFor()
      await bild('4-beseitigung-vorbelegt')
      await seite.getByRole('button', { name: 'Abbrechen' }).filter({ visible: true }).first().click()
      await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
      await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()

      // 3. Profil: Sicherung, Sonnen-Kontrast
      await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
      await seite.getByRole('heading', { name: 'Sicherung' }).waitFor()
      await seite.getByRole('heading', { name: 'Sicherung' }).scrollIntoViewIfNeeded()
      await bild('5-profil-sicherung')
      const [download] = await Promise.all([seite.waitForEvent('download'), seite.getByRole('button', { name: 'Sicherung erstellen' }).click()])
      const pfad = join(ordner, `${praefix}.zip`)
      await download.saveAs(pfad)
      await seite.getByText(/Sicherung WEP-Sicherung_.*erstellt/).waitFor()
      await bild('6-sicherung-erstellt')

      // 4. Stand ändern, dann die Sicherung einspielen: Vorschau mit Abweichung und Papierkorb-Konflikt
      await speichern(seite, [{ ...WEPS[1], formalien: { ...WEPS[1].formalien, parzelle: 'Parzelle 99' } }])
      await seite.getByTestId('sicherung-eingabe').setInputFiles(pfad)
      await seite.getByRole('region', { name: 'Vorschau der Sicherung' }).waitFor()
      await seite.getByRole('region', { name: 'Vorschau der Sicherung' }).scrollIntoViewIfNeeded()
      await bild('7-einspielen-vorschau', true)
      await kontext.close()
    }
  }
} finally {
  await browser?.close()
  server.kill()
}
