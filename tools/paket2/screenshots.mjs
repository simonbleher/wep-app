// Screenshots der Änderungen aus Beta 3, Paket 2 (Papierkorb, sichtbare Konflikte) für docs/paket2/.
// Aufruf: npm run paket2:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Die Testdaten sind erfunden und werden direkt in die IndexedDB geschrieben.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4183
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/paket2'
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

const pos = (id, katalogId, bezeichnung, anzahl, einheit, zustand, hoechstwert, einzelpreis) => ({
  id, katalogId, bezeichnung, anzahl, einheit, zustand, hoechstwert, einzelpreis, preisManuell: false, hinweise: [],
})

function wep(id, anlage, parzelle, unterpaechter, datum, aufwuchs = [], status) {
  return {
    id,
    ...(status ? { status } : {}),
    formalien: {
      kleingartenanlage: anlage, parzelle, weg: '', unterpaechter, auftraggeber: '', vertretenDurchRA: '',
      anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: '',
      wertermittlerAussenAufwuchs: 'Max Mustermann', wertermittlungAm: datum, protokollerstellungAm: '',
      parzellenflaecheM2: 0, vorgangsNr: id,
    },
    gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs, beseitigungAA: [] },
  }
}

const apfel = pos('p1', 'aw-obstgehoelz', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 'gut', 85, 63.75)
const rasen = pos('p2', 'aw-rasen', 'Rasen', 60, 'm²', 'gut', 0.5, 0.38)
const beere = pos('p3', 'aw-beeren', 'Johannisbeere', 4, 'Stück', 'gut', 12, 9)

// Aktiv: 007 (Konflikt auf zwei Geräten), 006 (gelöscht und danach geändert), 005 normal
const AKTIV = [
  wep('2026-007', 'KGA Testgarten', 'Parzelle 42', 'Erika Musterfrau', '2026-10-14', [apfel, rasen]),
  wep('2026-006', 'KGA Testgarten', 'Parzelle 17', 'Hans Beispiel', '2026-10-09', [beere], 'fertig'),
  wep('2026-005', 'KGA Musterau', 'Parzelle 3, Weg B', 'Paula Platzhalter', '2026-10-02'),
]
// Andere Fassung von 007 (vom Tablet): ohne Rasen
const ANDERE_FASSUNG = wep('2026-007', 'KGA Testgarten', 'Parzelle 42', 'Erika Musterfrau', '2026-10-14', [apfel])

const TAG = 24 * 60 * 60 * 1000
const vor = (tage, stunden = 0) => new Date(Date.now() - tage * TAG - stunden * 3600_000).toISOString()

const KORB = [
  { wep: wep('2026-004', 'KGA Testgarten', 'Parzelle 108', 'Otto Normal', '2026-09-25', [apfel, beere]), geloeschtAm: vor(2, 3) },
  { wep: wep('2026-003', 'KGA Musterau', 'Parzelle 8', 'Berta Beispiel', '2026-09-20', [rasen]), geloeschtAm: vor(12) },
  { wep: wep('2026-002', 'KGA Musterau', 'Parzelle 21', 'Karl Muster', '2026-08-30'), geloeschtAm: vor(28, 5) },
].map((e) => ({ id: e.wep.id, wep: e.wep, geloeschtAm: e.geloeschtAm, geloeschtVon: 'Tablet' }))

const META = [
  {
    id: '2026-007',
    lokalGeaendertAm: vor(0, 1),
    letzterSyncAm: vor(0, 1),
    remoteETag: '"e1"',
    konflikt: {
      art: 'zwei-geraete',
      erkanntAm: vor(0, 1),
      geraet: 'Tablet',
      fassung: ANDERE_FASSUNG,
      fassungGeaendertAm: vor(0, 3),
      kopien: ['2026-007.konflikt-2026-10-20T09-00-00-000Z.json'],
    },
  },
  {
    id: '2026-006',
    lokalGeaendertAm: vor(0, 2),
    letzterSyncAm: vor(0, 2),
    remoteETag: '"e2"',
    konflikt: { art: 'geloescht-geaendert', erkanntAm: vor(0, 2), geraet: 'Tablet', geloeschtWo: 'anderes-geraet', kopien: [] },
  },
  { id: '2026-005', lokalGeaendertAm: vor(1), letzterSyncAm: vor(1), remoteETag: '"e3"' },
  ...KORB.map((e) => ({
    id: e.id, lokalGeaendertAm: e.geloeschtAm, letzterSyncAm: e.geloeschtAm, geloescht: true, geloeschtAm: e.geloeschtAm, papierkorbETag: '"k"',
  })),
]

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
    const bild = async (name) => {
      await seite.waitForTimeout(200)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`${ZIEL}/${groesse}-${name}.png`)
    }

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(
      ([aktiv, korb, meta]) =>
        new Promise((ok, fehler) => {
          const anfrage = indexedDB.open('wep-db')
          anfrage.onerror = fehler
          anfrage.onsuccess = () => {
            const tx = anfrage.result.transaction(['weps', 'papierkorb', 'syncMeta'], 'readwrite')
            for (const w of aktiv) tx.objectStore('weps').put(w)
            for (const e of korb) tx.objectStore('papierkorb').put(e)
            for (const m of meta) tx.objectStore('syncMeta').put(m)
            tx.oncomplete = ok
            tx.onerror = fehler
          }
        }),
      [AKTIV, KORB, META],
    )
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).waitFor()
    await bild('1-liste-konflikt')

    // Papierkorb
    if (groesse === 'handy') await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button').click()
    else await seite.getByLabel('Navigation').getByRole('button', { name: 'Papierkorb' }).click()
    await seite.getByRole('list', { name: 'Papierkorb' }).waitFor()
    await bild('2-papierkorb')

    await seite.getByRole('list', { name: 'Papierkorb' }).getByRole('button', { name: 'Endgültig löschen' }).first().click()
    await seite.getByRole('alertdialog').waitFor()
    await bild('3-endgueltig-loeschen-rueckfrage')
    await seite.getByRole('button', { name: 'Abbrechen' }).click()

    // Zurück zur Liste, Konflikt-WEPs öffnen
    if (groesse === 'handy') await seite.getByRole('button', { name: 'Protokolle' }).click()
    else await seite.getByLabel('Navigation').getByRole('button', { name: 'Protokolle' }).click()
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await seite.getByText('Auf zwei Geräten geändert').waitFor()
    await bild('4-konflikt-zwei-geraete')

    await seite.getByRole('button', { name: 'Protokolle' }).click()
    await seite.getByRole('button', { name: /Parzelle 17/ }).click()
    await seite.getByText('Gelöscht und danach geändert').waitFor()
    await bild('5-konflikt-geloescht-geaendert')

    await seite.getByRole('button', { name: 'Weitere Aktionen' }).filter({ visible: true }).first().click()
    await bild('6-menue-papierkorb')
    await seite.getByRole('menuitem', { name: /In den Papierkorb/ }).click()
    await seite.getByRole('alertdialog').waitFor()
    await bild('7-in-den-papierkorb-rueckfrage')
    await kontext.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
