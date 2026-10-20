// Aktionen der Oberfläche rund um Papierkorb und Konflikte: die Regeln aus papierkorb.ts,
// angebunden an den IndexedDB-Speicher dieses Geräts. Wirkt zuerst lokal (funktioniert
// offline und ohne Konto); der nächste Abgleich überträgt es nach OneDrive.
import { entferneBauExcelLokal, entferneFotosLokal, kopiereBauExcelLokal, kopiereFotosLokal } from '@/app/db'
import type { Wep } from '@/model'
import { geraeteKennung } from './geraet'
import * as regeln from './papierkorb'
import { bauAufraeumListe, fotoAufraeumListe, syncSpeicher } from './speicher'
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

export async function stelleWiederHer(id: string) {
  const res = await regeln.stelleWiederHer(syncSpeicher, id, kontext())
  // Neue Nummer (die alte war vergeben): Die Fotos des Originals bleiben im Papierkorb, die Kopie bekommt eigene
  if (res?.neueNummer) {
    await kopiereFotosLokal(id, res.id)
    await kopiereBauExcelLokal(id, res.id)
  }
  return res
}

/**
 * Fotos und Bau-Excel eines endgültig gelöschten WEP: lokal sofort weg, in OneDrive beim nächsten Abgleich.
 */
export async function vergesseFotos(ids: string[]): Promise<void> {
  if (!ids.length) return
  for (const id of ids) {
    await entferneFotosLokal(id)
    await entferneBauExcelLokal(id)
  }
  fotoAufraeumListe.speichere([...new Set([...fotoAufraeumListe.lade(), ...ids])])
  bauAufraeumListe.speichere([...new Set([...bauAufraeumListe.lade(), ...ids])])
}

export async function loescheEndgueltig(id: string): Promise<boolean> {
  const ok = await regeln.loescheEndgueltig(syncSpeicher, id, kontext().jetzt)
  if (ok) await vergesseFotos([id])
  return ok
}

/** Entfernt, was länger als 30 Tage im Papierkorb liegt. Liefert die betroffenen Nummern. */
export async function raeumePapierkorbAuf(): Promise<string[]> {
  const ids = await regeln.raeumePapierkorbAuf(syncSpeicher, kontext().jetzt)
  await vergesseFotos(ids)
  return ids
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
