// Erzeugt aus resources/icon.svg alle App-Icons (Android, PWA, Favicon, Splash) und eine
// Vorschau. Aufruf: npm run icons  (Chromium kommt aus PLAYWRIGHT_BROWSERS_PATH, wie beim e2e-Test).
// Die erzeugten Dateien liegen im Repo; das Skript muss nur bei Änderung der Quelle laufen.
//
// Aufbau der Quelle: siehe Kommentar in resources/icon.svg (grund, symbol, details, adern).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright'

const AKZENT = '#2e6640' // --farbe-akzent
const quelle = readFileSync('resources/icon.svg', 'utf-8')

// ---------------------------------------------------------------------------
// Varianten der Quelle als SVG-Text
// ---------------------------------------------------------------------------

function gruppe(id) {
  const m = quelle.match(new RegExp(`<g id="${id}"[^>]*>[\\s\\S]*?</g>`))
  if (!m) throw new Error(`Gruppe „${id}“ fehlt in resources/icon.svg`)
  return m[0]
}
const GRUND = quelle.match(/<rect id="grund"[^>]*\/>/)[0]
const SYMBOL = gruppe('symbol')
const DETAILS = gruppe('details')
const ADERN = gruppe('adern')

const svg = (inhalt, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}${inhalt}</svg>`
/** Symbol um die Mitte vergrößern (für Icons ohne Sicherheitszone). */
const gross = (inhalt, faktor) => `<g transform="translate(256 256) scale(${faktor}) translate(-256 -256)">${inhalt}</g>`
const symbolKomplett = SYMBOL + DETAILS + ADERN

/** Vollflächiges Icon (Quadrat), Symbol etwas größer. */
const vollflaechig = (faktor = 1.2) => svg(GRUND + gross(symbolKomplett, faktor))
/** Abgerundetes Quadrat mit durchsichtigen Ecken (PWA „any“, Favicon). */
const abgerundet = (faktor = 1.2) =>
  svg(
    `<rect width="512" height="512" rx="112" fill="${AKZENT}" />` + gross(symbolKomplett, faktor),
  )
/** Runde Fläche (Legacy-Launcher „round“). */
const rund = (faktor = 1.2) => svg(`<circle cx="256" cy="256" r="256" fill="${AKZENT}" />` + gross(symbolKomplett, faktor))
/** Vordergrund des adaptiven Icons: nur das Symbol, durchsichtig, in der Sicherheitszone. */
const vordergrund = () => svg(symbolKomplett)
/** Themen-Icon (Android 13+): einfarbige Form; Details sind ausgespart, die Ader bleibt stehen. */
function monochrom() {
  const aus = DETAILS.replace(/#2e6640/g, '#000000')
  const defs = `<defs><mask id="aus" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff" />${aus}</mask></defs>`
  return svg(`<g mask="url(#aus)">${SYMBOL}</g>${ADERN}`, defs)
}
/** Splash: Akzentfläche beliebigen Formats, Symbol mittig (ohne Kachel). */
const splash = (b, h) => {
  const kante = Math.min(b, h) * 0.38
  const k = kante / 512
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b} ${h}" width="${b}" height="${h}">` +
    `<rect width="${b}" height="${h}" fill="${AKZENT}" />` +
    `<g transform="translate(${b / 2} ${h / 2}) scale(${k * 1.3}) translate(-256 -256)">${symbolKomplett}</g></svg>`
  )
}

// ---------------------------------------------------------------------------
// Rendern (Chromium)
// ---------------------------------------------------------------------------

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

async function png(pfad, svgText, breite, hoehe = breite) {
  mkdirSync(dirname(pfad), { recursive: true })
  const mitGroesse = svgText.includes('width="') && /<svg[^>]*\swidth=/.test(svgText)
    ? svgText
    : svgText.replace('<svg ', `<svg width="${breite}" height="${hoehe}" `)
  await seite.setViewportSize({ width: breite, height: hoehe })
  await seite.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${mitGroesse}`)
  await seite.screenshot({ path: pfad, omitBackground: true, clip: { x: 0, y: 0, width: breite, height: hoehe } })
}

const schreibe = (pfad, text) => {
  mkdirSync(dirname(pfad), { recursive: true })
  writeFileSync(pfad, text)
}

// --- Android: Launcher-Icons je Dichte -------------------------------------
const RES = 'android/app/src/main/res'
const DICHTEN = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [name, d] of Object.entries(DICHTEN)) {
  const dir = `${RES}/mipmap-${name}`
  await png(`${dir}/ic_launcher.png`, abgerundet(), 48 * d)
  await png(`${dir}/ic_launcher_round.png`, rund(), 48 * d)
  await png(`${dir}/ic_launcher_foreground.png`, vordergrund(), 108 * d)
  await png(`${dir}/ic_launcher_monochrome.png`, monochrom(), 108 * d)
}
const adaptiv = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`
schreibe(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, adaptiv)
schreibe(`${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptiv)
schreibe(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${AKZENT.toUpperCase()}</color>
</resources>
`,
)

// --- Android: Splash (gleiche Größen wie bisher) ----------------------------
const SPLASH = {
  'drawable/splash.png': [480, 320],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
}
for (const [pfad, [b, h]] of Object.entries(SPLASH)) await png(`${RES}/${pfad}`, splash(b, h), b, h)

// --- PWA, Favicon -----------------------------------------------------------
await png('public/pwa-192x192.png', abgerundet(), 192)
await png('public/pwa-512x512.png', abgerundet(), 512)
await png('public/maskable-512x512.png', vollflaechig(1.2), 512)
await png('public/apple-touch-icon.png', vollflaechig(1.2), 180)
await png('public/favicon-32x32.png', abgerundet(1.3), 32)
schreibe('public/icon.svg', abgerundet() + '\n')
schreibe('public/favicon.svg', abgerundet(1.3) + '\n')

// --- Vorschau ----------------------------------------------------------------
const kachel = (inhalt, titel, hintergrund = '#f3f3f2') =>
  `<figure style="margin:0;text-align:center"><div style="background:${hintergrund};border-radius:16px;box-sizing:border-box;padding:20px;display:flex;align-items:center;justify-content:center;width:200px;height:200px">${inhalt}</div><figcaption style="margin-top:8px;font:15px system-ui,sans-serif;color:#4d4d4d">${titel}</figcaption></figure>`
const gross2 = (s, px = 160) => s.replace('<svg ', `<svg width="${px}" height="${px}" `)
const maskeKreis = (s) => `<div style="width:160px;height:160px;border-radius:50%;overflow:hidden">${gross2(s)}</div>`
const adaptivKachel = svg(GRUND + symbolKomplett) // 108-dp-Fläche, Vordergrund ohne Skalierung
const monoAuf = (s) => gross2(s.replace('<g mask', '<g fill="#ffffff" mask'))
const vorschau = `<body style="margin:0;padding:24px;background:#fff;display:grid;grid-template-columns:repeat(4,200px);gap:24px 24px">
${kachel(gross2(abgerundet()), 'Icon (PWA, Favicon)')}
${kachel(maskeKreis(adaptivKachel), 'Adaptiv, rund beschnitten')}
${kachel(gross2(svg(GRUND + symbolKomplett), 160).replace('<svg ', '<svg style="border-radius:28%" '), 'Adaptiv, abgerundet')}
${kachel(gross2(vollflaechig(1.2)) , 'Maskable (Vollfläche)')}
${kachel(`<div style="width:160px;height:160px;border-radius:50%;background:#d3e3d8;display:flex;align-items:center;justify-content:center">${gross2(monochrom().replace(/<g mask="url\(#aus\)">/, '<g mask="url(#aus)" style="">').replace(/fill="#ffffff"/g, `fill="${AKZENT}"`).replace(/stroke="#ffffff"/g, `stroke="${AKZENT}"`), 120)}</div>`, 'Themen-Icon (einfarbig)', '#ffffff')}
${kachel(`<div style="width:160px;height:160px;border-radius:18px;overflow:hidden">${splash(160, 160).replace('<svg ', '<svg style="display:block" ')}</div>`, 'Splash (Ausschnitt)')}
${kachel(gross2(abgerundet(1.3), 32), 'Favicon 32 px')}
${kachel(gross2(abgerundet(), 48), 'Launcher 48 dp')}
</body>`
await seite.setViewportSize({ width: 944, height: 600 })
await seite.setContent(vorschau)
mkdirSync('docs/icon', { recursive: true })
await seite.screenshot({ path: 'docs/icon/vorschau.png' })

await browser.close()
console.log('Icons erzeugt.')
