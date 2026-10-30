// @vitest-environment node
// Sicherheitsprüfung v2, Fund M7 (docs/SICHERHEITSPRUEFUNG-V2.md): lokale Ablage je Konto. Meldet sich auf demselben
// Gerät eine andere Person an, arbeitet sie in einer eigenen IndexedDB; die bisherige Ablage gehört dem ersten Konto
// nach der Umstellung (vorhandene Daten gehen nicht verloren). Nur erfundene Daten.
import { describe, expect, it } from 'vitest'
import { ablageFuer, besitzerSchluessel } from './ablage'

function merker(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start))
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('Fund M7 (behoben): lokale Ablage je Konto', () => {
  it('die vorhandene Ablage gehört dem ersten Konto; jedes weitere Konto bekommt eine eigene', () => {
    const s = merker()
    expect(ablageFuer('wep-db-v2', 'konto-erika', s)).toBe('wep-db-v2')
    expect(s.m.get(besitzerSchluessel('wep-db-v2'))).toBe('konto-erika')
    expect(ablageFuer('wep-db-v2', 'konto-max', s)).toBe('wep-db-v2-konto-max')
    // Erika kommt zurück: wieder ihre (die bisherige) Ablage, nichts verloren
    expect(ablageFuer('wep-db-v2', 'konto-erika', s)).toBe('wep-db-v2')
    // Browser: Basis „wep-db“ wird unabhängig davon zugeordnet
    expect(ablageFuer('wep-db', 'konto-max', s)).toBe('wep-db')
  })

  it('nach dem Löschen (Besitzer-Eintrag entfernt) gehört die leere Ablage dem nächsten Konto; ohne localStorage bleibt es wie vorher', () => {
    const s = merker({ [besitzerSchluessel('wep-db')]: 'konto-erika' })
    s.m.delete(besitzerSchluessel('wep-db'))
    expect(ablageFuer('wep-db', 'konto-max', s)).toBe('wep-db')
    expect(ablageFuer('wep-db', 'konto-max', undefined)).toBe('wep-db')
    const kaputt = { getItem: () => { throw new Error('gesperrt') }, setItem: () => undefined }
    expect(ablageFuer('wep-db', 'konto-max', kaputt)).toBe('wep-db')
  })
})
