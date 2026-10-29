// Typen der v2-Schnittstelle (Spiegel von functions/_lib/v2/konten.ts).
export type ServerRolle = 'bau' | 'gruen' | 'bv' | 'admin'
export type KontoStatus = 'wartet' | 'freigegeben' | 'gesperrt'

export interface ServerKonto {
  id: string
  anbieter: 'google' | 'microsoft'
  email: string
  name: string
  status: KontoStatus
  rollen: ServerRolle[]
  mailBenachrichtigung: boolean
  erstelltAm: string
  geaendertAm: string
  letzteAnmeldung?: string
  /** Offene Sitzungen (nur in der Kontenverwaltung der Admins). */
  sitzungen?: ServerSitzung[]
}

export type SitzungsGeraet = 'browser' | 'android' | 'windows'

/** Eine offene Sitzung (Browser oder App), Spiegel von SitzungInfo in functions/_lib/v2/sitzung.ts. */
export interface ServerSitzung {
  id: string
  geraet: SitzungsGeraet
  erstelltAm: string
  laeuftAb: string
  /** Die Sitzung, mit der gerade gefragt wird. */
  diese?: boolean
}

export const GERAET_TEXT: Record<SitzungsGeraet, string> = { browser: 'Browser', android: 'Android-App', windows: 'Windows-App' }

export const ROLLEN_TEXT: Record<ServerRolle, string> = { bau: 'Bau', gruen: 'Grün', bv: 'BV', admin: 'Admin' }
export const STATUS_TEXT: Record<KontoStatus, string> = { wartet: 'wartet auf Freigabe', freigegeben: 'freigegeben', gesperrt: 'gesperrt' }

/** Ein Wertermittler ist Bau ODER Grün; BV und Admin zusätzlich (wie auf dem Server geprüft). */
export function rollenFehler(rollen: ServerRolle[]): string | undefined {
  return rollen.includes('bau') && rollen.includes('gruen') ? 'Ein Konto ist entweder Bau oder Grün, nicht beides.' : undefined
}
