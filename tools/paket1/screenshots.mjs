// Screenshots der Änderungen aus Beta 3, Paket 1 (Status je WEP, Duplizieren, „schlecht“ ohne Höchstwert,
// Suche „Rasen“) für docs/paket1/. Aufruf: npm run paket1:screenshots (baut wie npm run e2e nach
// dist-e2e/, startet vite preview). Testdaten sind erfunden.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4182
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/paket1'
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

const pos = (id, katalogId, bezeichnung, anzahl, einheit, zustand, hoechstwert, einzelpreis, preisManuell = false) => ({
  id, katalogId, bezeichnung, anzahl, einheit, zustand, hoechstwert, einzelpreis, preisManuell, hinweise: [],
})

function wep(id, anlage, parzelle, unterpaechter, datum, status, aufwuchs = []) {
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

const WEPS = [
  wep('2026-007', 'KGA Testgarten', 'Parzelle 42', 'Erika Musterfrau', '2026-10-14', 'exportiert', [
    pos('p1', 'aw-obstgehoelz', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 'gut', 85, 63.75),
    pos('p5', 'aw-rasen', 'Rasen', 60, 'm²', 'gut', 0.5, 0.38),
  ]),
  wep('2026-006', 'KGA Testgarten', 'Parzelle 17', 'Hans Beispiel', '2026-10-09', 'fertig'),
  wep('2026-005', 'KGA Musterau', 'Parzelle 3, Weg B', 'Paula Platzhalter', '2026-10-02'),
  wep('2026-004', 'KGA Testgarten', 'Parzelle 108', 'Otto Normal', '2026-09-25', 'fertig'),
  wep('2026-003', 'KGA Musterau', 'Parzelle 8', 'Berta Beispiel', '2026-09-20', 'in Arbeit'),
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
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block' })
    const seite = await kontext.newPage()
    const bild = async (name) => {
      await seite.waitForTimeout(150)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`${ZIEL}/${groesse}-${name}.png`)
    }
    const menue = () => seite.getByRole('button', { name: 'Weitere Aktionen' }).filter({ visible: true }).first()

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(
      (weps) =>
        new Promise((ok, fehler) => {
          const anfrage = indexedDB.open('wep-db')
          anfrage.onerror = fehler
          anfrage.onsuccess = () => {
            const tx = anfrage.result.transaction('weps', 'readwrite')
            for (const w of weps) tx.objectStore('weps').put(w)
            tx.oncomplete = ok
            tx.onerror = fehler
          }
        }),
      WEPS,
    )
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).waitFor()
    await bild('1-liste-status')

    const filter = seite.getByRole('group', { name: 'Nach Status filtern' })
    await filter.getByRole('button', { name: 'Fertig' }).click()
    await bild('2-liste-filter-fertig')
    await filter.getByRole('button', { name: 'Alle' }).click()

    // Menü „⋯“ mit Status und „Duplizieren“
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await menue().waitFor()
    await menue().click()
    await bild('3-menue')
    await seite.getByRole('menuitem', { name: /Duplizieren/ }).click()
    await seite.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '2026-008'))
    await bild('4-kopie-geoeffnet')

    // „schlecht“ bei eigener Position: 1,00 € ohne Höchstwert
    const abschnitt = (name) =>
      groesse === 'handy'
        ? seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name })
        : seite.getByLabel('Abschnitte').getByRole('button', { name: new RegExp(`^${name}`) })
    await abschnitt('Aufwuchs').click()
    await seite.getByRole('heading', { name: 'Aufwuchs' }).waitFor()
    await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
    await seite.getByRole('button', { name: 'Eigene Position (Freitext)' }).click()
    await seite.getByLabel(/^Bezeichnung/).fill('Zaubernuss')
    await seite.getByRole('button', { name: 'schlecht', exact: true }).click()
    await bild('5-schlecht-ohne-hoechstwert')
    if (groesse === 'handy') await seite.getByRole('button', { name: 'Suche' }).click()

    // Suche „rasen“ behält den Positionsnamen
    await seite.getByLabel('Katalog durchsuchen').fill('rasen')
    await seite.getByRole('button', { name: /^Rasen/ }).first().click()
    await seite.getByLabel(/^Bezeichnung/).waitFor()
    await bild('6-suche-rasen')
    await kontext.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
