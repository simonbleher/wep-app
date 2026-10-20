// Sicherung als Datei (Beta 3, Paket 6): eine ZIP-Datei mit allen WEPs, dem Papierkorb, den eigenen
// Positionen und dem Profil; Fotos und Bau-Excel-Dateien sind optional.
//
//   sicherung.json                 (Format `wep-sicherung/1`, siehe SicherungsDatei)
//   fotos/<Vorgangs-Nr>/<Id>.jpg   nur mit „Fotos einschließen“
//   bau/<Vorgangs-Nr>.xlsx         nur mit „Bau-Excel einschließen“
import type { Foto, Wep } from '@/model'
import type { EigenePosition } from '@/katalog'
import type { Profil } from '@/profil'
import type { PapierkorbEintrag } from '@/sync/types'

export const SICHERUNG_FORMAT = 'wep-sicherung/1'
export const SICHERUNG_JSON = 'sicherung.json'

export interface SicherungsWep {
  wep: Wep
  /** Letzte lokale Änderung auf dem Gerät, von dem die Sicherung stammt (ISO). */
  geaendertAm?: string
}

export interface SicherungsDatei {
  format: typeof SICHERUNG_FORMAT
  erstelltAm: string
  appVersion: string
  weps: SicherungsWep[]
  papierkorb: PapierkorbEintrag[]
  /** Auch die Löschmarken, damit nichts Gelöschtes zurückkommt. */
  eigenePositionen: EigenePosition[]
  profil: { profil: Profil; geaendertAm?: string }
  enthaelt: { fotos: boolean; bauExcel: boolean }
  /** Fotodateien, die im ZIP liegen. */
  fotos: { wepId: string; id: string }[]
  /** Bau-Excel-Dateien, die im ZIP liegen. */
  bauExcel: { wepId: string }[]
}

/** Der lokale Stand dieses Geräts, aus dem gesichert wird und mit dem eine Sicherung verglichen wird. */
export interface SicherungsQuelle {
  weps(): Promise<SicherungsWep[]>
  papierkorb(): Promise<PapierkorbEintrag[]>
  eigenePositionen(): Promise<EigenePosition[]>
  profil(): Promise<{ profil: Profil; geaendertAm?: string }>
  /** Die Bilddatei, falls sie auf diesem Gerät liegt. */
  fotoDatei(wepId: string, foto: Foto): Promise<Blob | Uint8Array | undefined>
  /** Die Bau-Excel des WEP, falls die passende Fassung auf diesem Gerät liegt. */
  bauExcelDatei(wep: Wep): Promise<Blob | Uint8Array | undefined>
}

/** Wohin eine Sicherung eingespielt wird. */
export interface SicherungsZiel {
  /** Nummern, die nicht mehr vergeben werden dürfen (aktive, gelöschte, endgültig gelöschte). */
  belegteNummern(): Promise<{ id: string }[]>
  speichereWep(wep: Wep): Promise<void>
  legeInPapierkorb(eintrag: PapierkorbEintrag): Promise<void>
  speichereFoto(wepId: string, foto: Foto, bytes: Uint8Array): Promise<void>
  speichereBauExcel(wepId: string, wep: Wep, bytes: Uint8Array): Promise<void>
  setzeEigenePositionen(eintraege: EigenePosition[]): Promise<void>
  setzeProfil(profil: Profil): Promise<void>
}
