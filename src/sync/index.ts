// Öffentliche Schnittstelle des Sync-Moduls für die App.
import { abmelden, aktuellesKonto, anmelden, syncKonfiguriert, zugriffstoken } from './auth'
import { erstelleGraphClient } from './graph'
import { synchronisiere, wartetAufUpload } from './engine'
import { syncSpeicher } from './speicher'
import type { SyncErgebnis } from './types'

export { abmelden, aktuellesKonto, anmelden, syncKonfiguriert }
export type { SyncErgebnis, SyncHinweis } from './types'

const GERAET_KEY = 'wep-geraet'

/** Stabile, zufällige Kennung dieses Geräts (nur zur Info in den Sync-Dateien). */
export function geraeteKennung(): string {
  try {
    let id = localStorage.getItem(GERAET_KEY)
    if (!id) {
      id = `${navigator.platform || 'Gerät'}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem(GERAET_KEY, id)
    }
    return id
  } catch {
    return 'unbekanntes Gerät'
  }
}

/** Anzahl der WEPs, deren Änderungen noch auf den Upload warten. */
export async function wartendeAenderungen(): Promise<number> {
  const [weps, metas] = await Promise.all([syncSpeicher.alleWeps(), syncSpeicher.alleMeta()])
  const meta = new Map(metas.map((m) => [m.id, m]))
  return weps.filter((w) => wartetAufUpload(meta.get(w.id))).length
}

/** Führt einen vollständigen Abgleich mit OneDrive aus. */
export async function jetztSynchronisieren(): Promise<SyncErgebnis> {
  if (!navigator.onLine) throw new Error('Keine Internetverbindung – Änderungen warten.')
  return synchronisiere({
    client: erstelleGraphClient(zugriffstoken),
    lokal: syncSpeicher,
    geraet: geraeteKennung(),
  })
}
