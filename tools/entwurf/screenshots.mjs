// Screenshots der Design-Vorschau (entwurf.html) für docs/entwurf/.
// Aufruf: npm run entwurf:screenshots  (baut vorher nach dist/ und startet vite preview)
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4179
const BASIS = `http://localhost:${PORT}/entwurf.html`
const GROESSEN = [
  ['handy', { width: 390, height: 844 }],
  ['tablet', { width: 1180, height: 820 }],
]
const BILDSCHIRME = [
  ['1-liste', 'liste'],
  ['2-aufwuchs', 'aufwuchs'],
  ['3a-suche', 'suche'],
  ['3b-formular', 'formular'],
]
// Vorinstalliertes Chromium nutzen (gleiche Suche wie tools/e2e/konto-durchlauf.mjs)
function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

const THEMA = process.argv.includes('--dunkel') ? 'dunkel' : 'hell'

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(BASIS)).ok) break
    } catch {
      /* Server startet noch */
    }
    if (i > 50) throw new Error('vite preview startet nicht')
    await new Promise((r) => setTimeout(r, 200))
  }

  const browser = await chromium.launch({ executablePath: chromiumPfad() })
  for (const [groesse, viewport] of GROESSEN) {
    const seite = await browser.newPage({ viewport, deviceScaleFactor: 2 })
    for (const [datei, b] of BILDSCHIRME) {
      // Auf dem Tablet zeigt „Position hinzufügen“ Suche und Formular nebeneinander
      if (groesse === 'tablet' && b === 'suche') continue
      await seite.goto(`${BASIS}?b=${b}&leiste=0&thema=${THEMA}`)
      await seite.waitForSelector('.e-rahmen')
      const name = groesse === 'tablet' && b === 'formular' ? '3-hinzufuegen' : datei
      const zusatz = THEMA === 'dunkel' ? '-dunkel' : ''
      await seite.screenshot({ path: `docs/entwurf/${groesse}-${name}${zusatz}.png` })
      console.log(`docs/entwurf/${groesse}-${name}${zusatz}.png`)
      // Handy: Erfassung zusätzlich ans Ende gescrollt (Summe des Abschnitts)
      if (groesse === 'handy' && b === 'aufwuchs') {
        await seite.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await seite.screenshot({ path: `docs/entwurf/${groesse}-${name}-unten${zusatz}.png` })
      }
    }
    await seite.close()
  }
  await browser.close()
} finally {
  server.kill()
}
