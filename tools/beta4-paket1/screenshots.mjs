// Screenshots für Beta 4, Paket 1 nach docs/beta4-paket1/ (Handy/Tablet): Liste mit Teil-Marken, Bau-Reiter
// (Platzhalter), Schalter „Bearbeiteter Teil“, „Grün + Bau“ mit allen Reitern, Export nur Bau.
// Aufruf: npm run beta4-paket1:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Alle Daten sind erfunden.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4189
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/beta4-paket1'
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

const wep = (id, parzelle, extra = {}) => ({
  id,
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle, weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann',
    wertermittlerAussenAufwuchs: 'Max Mustermann', wertermittlungAm: '2026-10-14', protokollerstellungAm: '', parzellenflaecheM2: 350, vorgangsNr: id,
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
  ...extra,
})
// Profil-Rolle ist „Bau“: das erste WEP folgt dem Profil, die beiden anderen weichen ab
const WEPS = [wep('2026-001', 'Parzelle 42'), wep('2026-002', 'Parzelle 17', { rolle: 'gruen' }), wep('2026-003', 'Parzelle 8', { rolle: 'beides' })]

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
    const nav = handy ? seite.getByRole('navigation', { name: 'Abschnitte' }) : seite.getByLabel('Abschnitte')
    const zurListe = () => seite.getByRole('button', { name: 'Protokolle' }).first().click()
    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'bau', standardAnlage: 'KGA Musterwiese' } })))
    await speichern(seite, WEPS)
    await seite.reload()
    await seite.locator('.status-teil').first().waitFor()
    await bild('1-liste-teil')

    // Rolle Bau (folgt dem Profil): Bau-Reiter, Platzhalter
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await nav.getByRole('button', { name: 'Mängel' }).first().click()
    await bild('2-bau-platzhalter')
    await nav.getByRole('button', { name: 'Formalien' }).first().click()
    await seite.getByText('Bearbeiteter Teil').scrollIntoViewIfNeeded()
    await bild('3-bearbeiteter-teil')
    await (handy ? seite.getByRole('button', { name: 'Export', exact: true }) : seite.getByRole('button', { name: 'Export als Excel' })).click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    await bild('4-export-bau')
    await zurListe()

    // Grün + Bau: alle Reiter
    await seite.getByRole('button', { name: /Parzelle 8/ }).click()
    await seite.getByRole('heading', { name: 'Formalien' }).waitFor()
    await bild('5-gruen-und-bau')
    await zurListe()
    await kontext.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
