// Abgleich des Profils (Name, Rolle, Standard-Kleingartenanlage) mit daten/profil.json.
//
// Ein Profil für alle Geräte, ohne Konflikt-Kopien: Die neuere Änderung gewinnt.
// Geräte-Einstellungen (z. B. „Upload nur über WLAN“) gehören nicht hierher.
import { istUnterschriftUrl } from '@/unterschrift'
import { LEERES_PROFIL, type Profil, type ProfilSpeicher } from '@/profil'
import { PROFIL_DATEI } from './ordner'
import type { GraphClient } from './types'

export interface ProfilDatei {
  format: 'wep-profil/1'
  geaendertAm: string
  geraet: string
  profil: Profil
}

export type ProfilErgebnis = 'hochgeladen' | 'geladen' | 'unveraendert'

function entpackeProfil(inhalt: string): ProfilDatei {
  const d = JSON.parse(inhalt) as Partial<ProfilDatei>
  if (d.format !== 'wep-profil/1' || !d.profil || !d.geaendertAm) {
    throw new Error('Unbekanntes Profil-Format')
  }
  const profil = { ...LEERES_PROFIL, ...d.profil }
  // Aus der Cloud kommt nur ein echtes, nicht zu großes PNG ins Profil – alles andere wird verworfen
  if (profil.unterschrift !== undefined && !istUnterschriftUrl(profil.unterschrift)) delete profil.unterschrift
  return { ...(d as ProfilDatei), profil }
}

/** `client` ist der Client für den Ordner daten/. */
export async function synchronisiereProfil(opt: {
  client: GraphClient
  speicher: ProfilSpeicher
  geraet: string
  jetzt?: () => string
}): Promise<ProfilErgebnis> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const stand = opt.speicher.lade()
  const remote = (await opt.client.liste()).find((d) => d.name === PROFIL_DATEI)

  const lokalGeaendert =
    stand.geaendertAm !== undefined &&
    (!stand.letzterSyncAm || stand.geaendertAm > stand.letzterSyncAm)
  const remoteGeaendert = remote !== undefined && remote.eTag !== stand.remoteETag

  const hochladen = async (): Promise<ProfilErgebnis> => {
    const geaendertAm = stand.geaendertAm ?? jetzt()
    const datei: ProfilDatei = {
      format: 'wep-profil/1',
      geaendertAm,
      geraet: opt.geraet,
      profil: stand.profil,
    }
    const r = await opt.client.schreibe(PROFIL_DATEI, JSON.stringify(datei, null, 2))
    opt.speicher.speichere({
      ...stand,
      geaendertAm,
      letzterSyncAm: jetzt(),
      remoteETag: r.eTag,
    })
    return 'hochgeladen'
  }

  const laden = async (): Promise<ProfilErgebnis> => {
    const datei = entpackeProfil(await opt.client.lade(PROFIL_DATEI))
    opt.speicher.speichere({
      profil: datei.profil,
      geaendertAm: datei.geaendertAm,
      letzterSyncAm: jetzt(),
      remoteETag: remote?.eTag,
    })
    return 'geladen'
  }

  if (!remote) return lokalGeaendert ? hochladen() : 'unveraendert'
  if (!remoteGeaendert) return lokalGeaendert ? hochladen() : 'unveraendert'
  if (!lokalGeaendert) return laden()

  // Beide Seiten geändert: die neuere Änderung gewinnt
  const fremd = entpackeProfil(await opt.client.lade(PROFIL_DATEI))
  return (stand.geaendertAm as string) >= fremd.geaendertAm ? hochladen() : laden()
}
