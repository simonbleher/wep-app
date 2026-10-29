// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { huelleKannServer, istServerModus, modusFuer } from './modus'

describe('Schalter Server-Modus', () => {
  it('nur genau "true" schaltet ein; ohne Variable bleibt alles wie v1', () => {
    expect(istServerModus({})).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: '' })).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: 'false' })).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: '1' })).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: 'TRUE' })).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: 'true' })).toBe(true)
  })
})

describe('Android- und Windows-App', () => {
  it('Build mit Schalter: im Browser Server-Modus, in alten Apps v1 mit Hinweis, in neuen Apps Server-Modus', () => {
    expect(modusFuer(true, false)).toEqual({ serverModus: true, appMitServer: false, appOhneServer: false })
    expect(modusFuer(true, true, false)).toEqual({ serverModus: false, appMitServer: false, appOhneServer: true })
    expect(modusFuer(true, true, true)).toEqual({ serverModus: true, appMitServer: true, appOhneServer: false })
  })

  it('Build ohne Schalter: überall v1 ohne Hinweis, auch mit neuer Hülle', () => {
    for (const app of [false, true]) for (const kann of [false, true]) {
      expect(modusFuer(false, app, kann)).toEqual({ serverModus: false, appMitServer: false, appOhneServer: false })
    }
  })

  it('Weiche nach nativer Version: nur Hüllen mit Anmelde-Plugin können den Server', () => {
    expect(huelleKannServer(undefined)).toBe(false)
    expect(huelleKannServer({})).toBe(false)
    // Android, native-version 7 (ohne Server-Token-Speicher)
    const alt = { Capacitor: { PluginHeaders: [{ name: 'WepNative', methods: [{ name: 'nativeVersion' }, { name: 'tokenAnfrage' }] }] } }
    expect(huelleKannServer(alt)).toBe(false)
    // Android, native-version 8
    const neu = { Capacitor: { PluginHeaders: [{ name: 'App', methods: [] }, { name: 'WepNative', methods: [{ name: 'nativeVersion' }, { name: 'speichereServerToken' }] }] } }
    expect(huelleKannServer(neu)).toBe(true)
    // gleichnamige Methode in einem fremden Plugin zählt nicht
    expect(huelleKannServer({ Capacitor: { PluginHeaders: [{ name: 'Anderes', methods: [{ name: 'speichereServerToken' }] }] } })).toBe(false)
    // Windows: alte Hülle ohne Marke, neue mit Marke
    expect(huelleKannServer({ __TAURI_INTERNALS__: {} })).toBe(false)
    expect(huelleKannServer({ __TAURI_INTERNALS__: {}, __WEP_HUELLE__: { serverAnmeldung: 1 } })).toBe(true)
  })
})
