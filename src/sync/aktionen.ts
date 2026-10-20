// Aktionen der Oberfläche rund um Papierkorb und Konflikte: die Regeln aus papierkorb.ts,
// angebunden an den IndexedDB-Speicher dieses Geräts. Wirkt zuerst lokal (funktioniert
// offline und ohne Konto); der nächste Abgleich überträgt es nach OneDrive.
import type { Wep } from '@/model'
import { geraeteKennung } from './geraet'
import * as regeln from './papierkorb'
import { syncSpeicher } from './speicher'
import type { KonfliktInfo, PapierkorbEintrag, SyncMeta } from './types'

export type { KonfliktWahl, WiederhergestelltErgebnis } from './papierkorb'
export { PAPIERKORB_TAGE, verbleibendeTage } from './papierkorb'

function kontext(): regeln.Kontext {
  return { jetzt: new Date().toISOString(), geraet: geraeteKennung() }
}

/** WEP löschen = in den Papierkorb legen (auf allen Geräten, sobald abgeglichen). */
export function loescheWep(id: string): Promise<boolean> {
  return regeln.loescheWep(syncSpeicher, id, kontext())
}

export function stelleWiederHer(id: string) {
  return regeln.stelleWiederHer(syncSpeicher, id, kontext())
}

export function loescheEndgueltig(id: string): Promise<boolean> {
  return regeln.loescheEndgueltig(syncSpeicher, id, kontext().jetzt)
}

/** Entfernt, was länger als 30 Tage im Papierkorb liegt. Liefert die betroffenen Nummern. */
export function raeumePapierkorbAuf(): Promise<string[]> {
  return regeln.raeumePapierkorbAuf(syncSpeicher, kontext().jetzt)
}

export function loeseKonflikt(id: string, wahl: regeln.KonfliktWahl): Promise<{ wep?: Wep } | undefined> {
  return regeln.loeseKonflikt(syncSpeicher, id, wahl, kontext())
}

export function ladePapierkorb(): Promise<PapierkorbEintrag[]> {
  return regeln.papierkorbListe(syncSpeicher)
}

/** Offene Konflikte, nach WEP-Nummer. */
export async function offeneKonflikte(): Promise<Map<string, KonfliktInfo>> {
  const metas = await syncSpeicher.alleMeta()
  return new Map(metas.filter((m) => m.konflikt).map((m) => [m.id, m.konflikt as KonfliktInfo]))
}

export async function ladeKonflikt(id: string): Promise<KonfliktInfo | undefined> {
  return (await syncSpeicher.alleMeta()).find((m: SyncMeta) => m.id === id)?.konflikt
}

/**
 * Nummern, die für ein neues WEP nicht mehr in Frage kommen: aktive, gelöschte (Papierkorb)
 * und endgültig gelöschte, deren Dateien in OneDrive noch aufgeräumt werden.
 */
export async function belegteNummern(): Promise<{ id: string }[]> {
  const [weps, korb, metas] = await Promise.all([
    syncSpeicher.alleWeps(),
    syncSpeicher.alleImPapierkorb(),
    syncSpeicher.alleMeta(),
  ])
  const ids = new Set([...weps.map((w) => w.id), ...korb.map((e) => e.id), ...metas.filter((m) => m.endgueltig).map((m) => m.id)])
  return [...ids].map((id) => ({ id }))
}
