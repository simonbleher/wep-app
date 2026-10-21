import { describe, expect, it } from 'vitest'
// @ts-expect-error reines JS-Modul ohne Typen
import { istProgrammDatei, parseVersion, pruefe, versionAusCargo, vergleiche } from './pruefe-windows-version.mjs'

const konfig = (v: string) => JSON.stringify({ productName: 'WEP', version: v })
const cargo = (v: string) => `[package]\nname = "wep-app"\nversion = "${v}"\nedition = "2021"\n\n[dependencies]\ntauri = { version = "2" }\n`
const basis = { basisKonfig: konfig('0.1.0'), aktuelleKonfig: konfig('0.1.0'), aktuellesCargo: cargo('0.1.0'), basisHuelle: '1\n', aktuelleHuelle: '1\n' }

describe('Prüfung Windows-Version', () => {
  it('nur Web-Änderungen → ok ohne Erhöhung', () => {
    expect(pruefe({ ...basis, geaendert: ['src/app/App.tsx', 'docs/WINDOWS.md'] }).ok).toBe(true)
  })
  it('Änderung unter src-tauri/ ohne Erhöhung → Fehler', () => {
    const r = pruefe({ ...basis, geaendert: ['src-tauri/src/lib.rs'] })
    expect(r.ok).toBe(false)
    expect(r.meldung).toContain('src-tauri/src/lib.rs')
  })
  it('Änderung unter src-tauri/ mit Erhöhung → ok', () => {
    const r = pruefe({ ...basis, aktuelleKonfig: konfig('0.1.1'), aktuellesCargo: cargo('0.1.1'), geaendert: ['src-tauri/src/lib.rs', 'src-tauri/tauri.conf.json'] })
    expect(r.ok).toBe(true)
  })
  it('Cargo.toml passt nicht zur Konfiguration → Fehler', () => {
    expect(pruefe({ ...basis, aktuelleKonfig: konfig('0.2.0'), geaendert: [] }).ok).toBe(false)
  })
  it('Version sinkt → Fehler', () => {
    const r = pruefe({ ...basis, basisKonfig: konfig('0.2.0'), geaendert: ['src-tauri/Cargo.lock'] })
    expect(r.ok).toBe(false)
  })
  it('kein Windows-Programm in der Basis (erster PR) → ok', () => {
    expect(pruefe({ ...basis, basisKonfig: null, basisHuelle: null, geaendert: ['src-tauri/tauri.conf.json'] }).ok).toBe(true)
  })
  it('Hüllen-Nummer fehlt oder sinkt → Fehler', () => {
    expect(pruefe({ ...basis, aktuelleHuelle: '', geaendert: [] }).ok).toBe(false)
    expect(pruefe({ ...basis, basisHuelle: '3', aktuelleHuelle: '2', geaendert: [] }).ok).toBe(false)
  })
  it('Hüllen-Nummer darf steigen', () => {
    expect(pruefe({ ...basis, aktuelleHuelle: '2', geaendert: [] }).ok).toBe(true)
  })
  it('Build-Ausgaben und Doku zählen nicht', () => {
    expect(istProgrammDatei('src-tauri/target/debug/x')).toBe(false)
    expect(istProgrammDatei('src-tauri/gen/schemas/a.json')).toBe(false)
    expect(istProgrammDatei('src-tauri/README.md')).toBe(false)
    expect(istProgrammDatei('src-tauri/icons/icon.ico')).toBe(true)
  })
  it('Hilfsfunktionen', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.2')).toBeNull()
    expect(vergleiche([0, 10, 0], [0, 9, 9])).toBeGreaterThan(0)
    expect(versionAusCargo(cargo('0.1.0'))).toBe('0.1.0')
  })
})
