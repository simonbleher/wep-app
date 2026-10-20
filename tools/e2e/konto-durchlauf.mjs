// Durchlauf im echten Browser (Chromium): erster Start → „Ohne Konto fortfahren“ →
// WEP anlegen → Profil öffnen, Name speichern → neues WEP ist vorbelegt.
//
// Start: npm run e2e  (baut mit einer Platzhalter-Client-ID nach dist-e2e/, damit der
// Login-Bildschirm erscheint; es wird nie wirklich bei Microsoft angemeldet).
// Chromium kommt aus PLAYWRIGHT_BROWSERS_PATH (vorinstalliert), nicht „playwright install“.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4173
const URL = `http://localhost:${PORT}/`

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(`Prüfung fehlgeschlagen: ${text}`)
  console.log(`ok  ${text}`)
}

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
let browser
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL)).ok) break
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  browser = await chromium.launch({ executablePath: chromiumPfad() })
  const kontext = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 412, height: 800 } })
  const seite = await kontext.newPage()
  const fehler = []
  seite.on('pageerror', (e) => fehler.push(e.message))

  // 1. Erster Start: Login-Bildschirm
  await seite.goto(URL)
  await seite.getByRole('button', { name: 'Mit Microsoft anmelden' }).waitFor()
  pruefe(await seite.getByText('Ohne Konto fortfahren (nur auf diesem Gerät)').isVisible(), 'erster Start zeigt den Login-Bildschirm')
  await seite.screenshot({ path: 'dist-e2e/login.png' })

  // 2. Ohne Konto fortfahren → Startseite mit schlichter Statuszeile
  await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
  await seite.getByRole('heading', { name: 'Wertermittlungsprotokolle' }).waitFor()
  pruefe(await seite.getByText('Nur auf diesem Gerät gespeichert').isVisible(), 'Statuszeile: nur auf diesem Gerät')

  // 3. Neustart: Wahl gemerkt, App startet direkt
  await seite.reload()
  await seite.getByRole('heading', { name: 'Wertermittlungsprotokolle' }).waitFor()
  pruefe((await seite.getByRole('button', { name: 'Mit Microsoft anmelden' }).count()) === 0, 'nach Neustart kein Login-Bildschirm mehr')

  // 4. Profil öffnen, Name und Anlage eintragen
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).click()
  await seite.getByRole('heading', { name: 'Profil' }).waitFor()
  await seite.getByLabel(/^Name/).fill('Erika Musterfrau')
  await seite.getByLabel(/Standard-Kleingartenanlage/).fill('KGA Musterwiese')
  await seite.getByLabel('Rolle').selectOption('beides')
  pruefe(await seite.getByLabel('Upload nur über WLAN').isChecked(), 'Upload nur über WLAN ist standardmäßig an')
  pruefe(await seite.getByText(/Wirkt in der Android-App/).isVisible(), 'Hinweis „wirkt in der Android-App“')
  pruefe(await seite.getByText(/Version/).first().isVisible(), 'App-Version wird angezeigt')
  pruefe(await seite.getByText(/Nicht angemeldet/).isVisible(), 'Konto: nicht angemeldet, Anmelden möglich')
  await seite.screenshot({ path: 'dist-e2e/profil.png' })
  await seite.getByRole('button', { name: 'Zurück' }).click()

  // 5. WEP anlegen: Name und Anlage aus dem Profil sind vorbelegt
  await seite.getByRole('button', { name: /Neues WEP/ }).click()
  await seite.getByLabel(/Kleingartenanlage/).first().waitFor()
  pruefe((await seite.getByLabel(/Kleingartenanlage/).first().inputValue()) === 'KGA Musterwiese', 'Anlage aus dem Profil vorbelegt')
  pruefe((await seite.locator('input[value="Erika Musterfrau"]').count()) > 0, 'Wertermittler aus dem Profil vorbelegt')

  // 6. Keine Skriptfehler
  pruefe(fehler.length === 0, `keine Skriptfehler im Browser ${fehler.join('; ')}`)
  console.log('Durchlauf erfolgreich')
} finally {
  await browser?.close()
  server.kill()
}
