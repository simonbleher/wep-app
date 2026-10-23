// WEP teilen (Beta 5, Paket 2): ein einzelnes WEP als `.wep`-Datei (ZIP) weitergeben, z. B. vom Bau- an den
// Grün-Wertermittler. Die Logik der Sicherung (src/sicherung) wird wiederverwendet: gelesen wird die Datei
// als Sicherung mit genau einem WEP, die Vorschau und das Einspielen laufen darüber.
//
//   wep.json                (Format `wep-teilen/1`, siehe TeilenDatei; das WEP im Sync-Format)
//   fotos/<Id>.jpg          nur mit „Fotos mitschicken“
//   bau.xlsx                nur mit „Bau-Excel mitschicken“
import type { Wep } from '@/model'

export const TEILEN_FORMAT = 'wep-teilen/1'
export const TEILEN_JSON = 'wep.json'
export const TEILEN_ENDUNG = '.wep'
/** Dateityp beim Teilen und für die Dateizuordnung (Android-Intent-Filter, Windows). */
export const TEILEN_MIME = 'application/x-wep'
/** Größer als das nimmt die App nicht an (schützt vor versehentlich gewählten Riesendateien). */
export const TEILEN_MAX_BYTES = 1024 * 1024 * 1024

export interface TeilenDatei {
  format: typeof TEILEN_FORMAT
  erstelltAm: string
  appVersion: string
  /** Das WEP. Fotos und Bau-Excel stehen nur darin, wenn ihre Dateien auch im ZIP liegen. */
  wep: Wep
  /** Letzte lokale Änderung auf dem Gerät, von dem die Datei stammt (ISO). */
  geaendertAm?: string
  enthaelt: { fotos: boolean; bauExcel: boolean }
  /** Fotodateien im ZIP (`fotos/<Id>.jpg`). */
  fotos: { id: string }[]
}

/** Die Teile eines WEP, die beim Einspielen einzeln gewählt werden können. */
export type TeilId = 'formalien' | 'bau' | 'gruen' | 'fotos' | 'bauExcel'

export const TEIL_TITEL: Record<TeilId, string> = {
  formalien: 'Formalien und Status',
  bau: 'Bau-Teil',
  gruen: 'Grün-Teil',
  fotos: 'Fotos',
  bauExcel: 'Bau-Excel',
}

export const TEIL_REIHENFOLGE: TeilId[] = ['bau', 'gruen', 'fotos', 'bauExcel', 'formalien']

export class TeilenFehler extends Error {}

/** Text für Größen: „3,4 MB“, „120 KB“. */
export function groesseText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
