// Erzeugt die Icons des Windows-Programms (src-tauri/icons/) aus resources/icon.svg:
// PNG in den Größen, die Tauri braucht, und icon.ico (mehrere Größen, PNG-Einträge).
// Aufruf: npm run icons:windows  (Chromium kommt aus PLAYWRIGHT_BROWSERS_PATH, wie bei npm run icons).
// Getrennt von erzeuge-icons.mjs, damit Android-Dateien dabei nie angefasst werden.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const AKZENT = '#2e6640' // --farbe-akzent
const quelle = readFileSync('resources/icon.svg', 'utf-8')

function gruppe(id) {
  const m = quelle.match(new RegExp(`<g id="${id}"[^>]*>[\\s\\S]*?</g>`))
  if (!m) throw new Error(`Gruppe „${id}“ fehlt in resources/icon.svg`)
  return m[0]
}
const symbol = gruppe('symbol') + gruppe('details') + gruppe('adern')
/** Abgerundetes Quadrat mit durchsichtigen Ecken, Symbol etwas größer (wie das PWA-Icon). */
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${AKZENT}" />` +
  `<g transform="translate(256 256) scale(1.2) translate(-256 -256)">${symbol}</g></svg>`

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

const browser = await chromium.launch({ executablePath: chromiumPfad() })
const seite = await browser.newPage()

async function png(groesse) {
  await seite.setViewportSize({ width: groesse, height: groesse })
  await seite.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg.replace('<svg ', `<svg width="${groesse}" height="${groesse}" `)}`,
  )
  return seite.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: groesse, height: groesse } })
}

/** ICO-Datei mit PNG-Einträgen (ab Windows Vista üblich). 256 wird als 0 geschrieben. */
function ico(bilder) {
  const kopf = Buffer.alloc(6)
  kopf.writeUInt16LE(1, 2) // Typ: Icon
  kopf.writeUInt16LE(bilder.length, 4)
  let offset = 6 + 16 * bilder.length
  const eintraege = bilder.map(({ groesse, daten }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(groesse >= 256 ? 0 : groesse, 0)
    e.writeUInt8(groesse >= 256 ? 0 : groesse, 1)
    e.writeUInt16LE(1, 4) // Farbebenen
    e.writeUInt16LE(32, 6) // Bit pro Pixel
    e.writeUInt32LE(daten.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += daten.length
    return e
  })
  return Buffer.concat([kopf, ...eintraege, ...bilder.map((b) => b.daten)])
}

const ziel = 'src-tauri/icons'
mkdirSync(ziel, { recursive: true })
const groessen = [16, 24, 32, 48, 64, 128, 256, 512]
const bilder = {}
for (const g of groessen) bilder[g] = await png(g)
writeFileSync(`${ziel}/32x32.png`, bilder[32])
writeFileSync(`${ziel}/128x128.png`, bilder[128])
writeFileSync(`${ziel}/128x128@2x.png`, bilder[256])
writeFileSync(`${ziel}/icon.png`, bilder[512])
writeFileSync(`${ziel}/icon.ico`, ico([16, 24, 32, 48, 64, 128, 256].map((g) => ({ groesse: g, daten: bilder[g] }))))
await browser.close()
console.log('Windows-Icons erzeugt (src-tauri/icons/).')
