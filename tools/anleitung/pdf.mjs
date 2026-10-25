// Baut die Anleitung aus docs/anleitung/anleitung.html und den Bildschirmfotos (docs/anleitung/bilder/*.png):
// - public/anleitung/index.html + bilder/*.jpg (in der App unter Profil → Anleitung, auch offline),
// - docs/anleitung/Anleitung_WEP-App.pdf (A4, zum Verteilen und Drucken).
// Aufruf: node tools/anleitung/pdf.mjs (nach tools/anleitung/screenshots.mjs; npm run anleitung macht beides).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const QUELLE = 'docs/anleitung'
const APP = 'public/anleitung'

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`, `${basis}/${d}/chrome-linux64/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

// Bilder: PNG (2× Handy) → JPEG mit 560 px Breite, reicht für Bildschirm und Druck (48 mm breit) und hält die App klein
rmSync(APP, { recursive: true, force: true })
mkdirSync(join(APP, 'bilder'), { recursive: true })
for (const png of readdirSync(join(QUELLE, 'bilder')).filter((n) => n.endsWith('.png'))) {
  execFileSync('convert', [join(QUELLE, 'bilder', png), '-resize', '560x', '-strip', '-quality', '82', join(APP, 'bilder', png.replace(/\.png$/, '.jpg'))])
}
copyFileSync(join(QUELLE, 'anleitung.html'), join(APP, 'index.html'))

const browser = await chromium.launch({ executablePath: chromiumPfad() })
try {
  const seite = await browser.newPage()
  await seite.goto(pathToFileURL(resolve(APP, 'index.html')).href, { waitUntil: 'networkidle' })
  await seite.pdf({
    path: join(QUELLE, 'Anleitung_WEP-App.pdf'),
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font:8pt system-ui,sans-serif;color:#777;padding:0 14mm;display:flex;justify-content:space-between"><span>Anleitung WEP-App</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>',
    margin: { top: '14mm', bottom: '16mm', left: '0', right: '0' },
  })
  console.log(`${QUELLE}/Anleitung_WEP-App.pdf, ${APP}/`)
} finally {
  await browser.close()
}
