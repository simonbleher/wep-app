import { describe, expect, it } from 'vitest'
// @ts-expect-error reines JS-Modul ohne Typen
import { istNativDatei, pruefe } from './pruefe-native-version.mjs'

const pkg = (deps: Record<string, string>) => JSON.stringify({ dependencies: deps })
const basis = { basisVersion: '3\n', aktuelleVersion: '3\n', basisPackage: pkg({ '@capacitor/app': '^8.0.0' }), aktuellesPackage: pkg({ '@capacitor/app': '^8.0.0' }) }

describe('Prüfung native-version', () => {
  it('nur Web-Änderungen → ok ohne Erhöhung', () => {
    expect(pruefe({ ...basis, geaendert: ['src/app/App.tsx', 'docs/ANDROID.md'] }).ok).toBe(true)
  })
  it('Änderung unter android/ ohne Erhöhung → Fehler', () => {
    const r = pruefe({ ...basis, geaendert: ['android/app/src/main/AndroidManifest.xml'] })
    expect(r.ok).toBe(false)
    expect(r.meldung).toContain('AndroidManifest.xml')
  })
  it('Änderung unter android/ mit Erhöhung → ok', () => {
    const r = pruefe({ ...basis, aktuelleVersion: '4', geaendert: ['android/app/build.gradle', 'android/native-version.txt'] })
    expect(r.ok).toBe(true)
  })
  it('neues Capacitor-Plugin in package.json ohne Erhöhung → Fehler', () => {
    const r = pruefe({ ...basis, aktuellesPackage: pkg({ '@capacitor/app': '^8.0.0', '@capgo/capacitor-updater': '^8.53.0' }), geaendert: ['package.json'] })
    expect(r.ok).toBe(false)
  })
  it('andere Abhängigkeiten in package.json zählen nicht', () => {
    expect(pruefe({ ...basis, aktuellesPackage: pkg({ '@capacitor/app': '^8.0.0', react: '^18' }), geaendert: ['package.json'] }).ok).toBe(true)
  })
  it('Version sinkt oder fehlt → Fehler', () => {
    expect(pruefe({ ...basis, aktuelleVersion: '2', geaendert: [] }).ok).toBe(false)
    expect(pruefe({ ...basis, aktuelleVersion: '', geaendert: [] }).ok).toBe(false)
  })
  it('Erstes Mal (Datei in der Basis unbekannt) → 1 genügt', () => {
    expect(pruefe({ ...basis, basisVersion: null, aktuelleVersion: '1', geaendert: ['android/app/build.gradle'] }).ok).toBe(true)
  })
  it('Dateiauswahl', () => {
    expect(istNativDatei('android/native-version.txt')).toBe(false)
    expect(istNativDatei('android/app/build/outputs/x.apk')).toBe(false)
    expect(istNativDatei('capacitor.config.ts')).toBe(true)
  })
})
