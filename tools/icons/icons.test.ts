// Prüft die erzeugten App-Icons (Ausgabe von tools/icons/erzeuge-icons.mjs): Größen, Transparenz,
// Verweise im Manifest und die Android-Ressourcen. Läuft ohne Browser.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

/** Breite × Höhe und Farbtyp aus dem PNG-Kopf. */
function pngKopf(pfad: string) {
  const b = readFileSync(pfad)
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return { breite: b.readUInt32BE(16), hoehe: b.readUInt32BE(20), farbtyp: b[25] }
}

const RES = 'android/app/src/main/res'
const DICHTEN = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

describe('App-Icon', () => {
  it('Quelle liegt im Repo und nutzt die Akzentfarbe aus den Tokens', () => {
    const svg = readFileSync('resources/icon.svg', 'utf-8')
    const tokens = readFileSync('src/design/tokens.css', 'utf-8')
    const akzent = tokens.match(/--farbe-akzent:\s*(#[0-9a-f]{6})/i)![1].toLowerCase()
    expect(svg).toContain(`fill="${akzent}"`)
    for (const id of ['grund', 'symbol', 'details', 'adern']) expect(svg).toContain(`id="${id}"`)
  })

  it('Android: alle Dichten mit richtiger Größe, Vordergrund und Themen-Icon durchsichtig', () => {
    for (const [name, d] of Object.entries(DICHTEN)) {
      for (const datei of ['ic_launcher', 'ic_launcher_round']) {
        expect(pngKopf(`${RES}/mipmap-${name}/${datei}.png`)).toMatchObject({ breite: 48 * d, hoehe: 48 * d })
      }
      for (const datei of ['ic_launcher_foreground', 'ic_launcher_monochrome']) {
        const k = pngKopf(`${RES}/mipmap-${name}/${datei}.png`)
        expect(k).toMatchObject({ breite: 108 * d, hoehe: 108 * d })
        expect(k.farbtyp).toBe(6) // RGBA
      }
    }
  })

  it('Android: adaptives Icon (auch rund) mit Hintergrundfarbe, Vordergrund und Themen-Icon', () => {
    for (const datei of ['ic_launcher', 'ic_launcher_round']) {
      const xml = readFileSync(`${RES}/mipmap-anydpi-v26/${datei}.xml`, 'utf-8')
      expect(xml).toContain('<background android:drawable="@color/ic_launcher_background"/>')
      expect(xml).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground"/>')
      expect(xml).toContain('<monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>')
    }
    expect(readFileSync(`${RES}/values/ic_launcher_background.xml`, 'utf-8')).toContain('#2E6640')
  })

  it('Splash behält alle Größen', () => {
    expect(pngKopf(`${RES}/drawable-port-xhdpi/splash.png`)).toMatchObject({ breite: 720, hoehe: 1280 })
    expect(pngKopf(`${RES}/drawable-land-xxxhdpi/splash.png`)).toMatchObject({ breite: 1920, hoehe: 1280 })
    expect(pngKopf(`${RES}/drawable/splash.png`)).toMatchObject({ breite: 480, hoehe: 320 })
  })

  it('PWA: Manifest verweist auf vorhandene Icons richtiger Größe, Favicon vorhanden', () => {
    expect(pngKopf('public/pwa-192x192.png')).toMatchObject({ breite: 192, hoehe: 192 })
    expect(pngKopf('public/pwa-512x512.png')).toMatchObject({ breite: 512, hoehe: 512 })
    expect(pngKopf('public/maskable-512x512.png')).toMatchObject({ breite: 512, hoehe: 512 })
    expect(pngKopf('public/apple-touch-icon.png')).toMatchObject({ breite: 180, hoehe: 180 })
    expect(pngKopf('public/favicon-32x32.png')).toMatchObject({ breite: 32, hoehe: 32 })
    const vite = readFileSync('vite.config.ts', 'utf-8')
    for (const src of vite.match(/src: '[^']+\.png'/g)!) expect(existsSync(`public/${src.slice(6, -1)}`)).toBe(true)
    expect(readFileSync('public/favicon.svg', 'utf-8')).not.toContain('<text')
    expect(readFileSync('index.html', 'utf-8')).toContain('apple-touch-icon')
  })

  it('alte Standard-Vektoren sind entfernt', () => {
    expect(existsSync(`${RES}/drawable-v24/ic_launcher_foreground.xml`)).toBe(false)
    expect(existsSync(`${RES}/drawable/ic_launcher_background.xml`)).toBe(false)
  })
})
