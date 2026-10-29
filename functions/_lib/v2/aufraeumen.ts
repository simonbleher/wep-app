// v2: Aufräumen nach der Abgabe an den BV (danach ist „Zusammenführen rückgängig“ nicht mehr möglich):
// - Ein in dieses Bau-WEP zusammengeführtes eigenes Grün-WEP bleibt nur als Markierung in D1 (Kennung, Vorgangs-Nr.,
//   „zusammengeführt in …“); sein Inhalt und seine Dateien in R2 werden gelöscht – sie stecken im Bau-WEP. Der Stand des
//   Bau-WEP vor dem Zusammenführen (für „Rückgängig“) wird ebenfalls geleert. So liegen keine Pächterdaten doppelt.
// - Dateien des Bau-WEP in R2 ohne Eintrag im WEP (verwaist) werden gelöscht.
// Verlauf und Zugriffsprotokoll halten fest, was entfernt wurde. Fehler hier ändern nichts an der Abgabe; beim nächsten
// „an den BV“ (z. B. nach einer Rückfrage) wird es erneut versucht.
import type { Db } from './db'
import { protokolliere } from './konten'
import { loescheAlleDateien, loescheVerwaisteDateien, type R2Ablage } from './dateien'
import { ladeZeile, verlauf } from './weps'

/** Was von einem zusammengeführten Grün-WEP in D1 bleibt. */
export const markierungsDaten = (id: string) => JSON.stringify({ id })

export interface AufraeumErgebnis {
  /** Verwaiste Dateien des Bau-WEP, die gelöscht wurden. */
  verwaist: number
  /** Das zusammengeführte Grün-WEP, das geleert wurde (falls es eins gab). */
  gruenId?: string
  /** Dateien des Grün-WEP, die gelöscht wurden. */
  gruenDateien: number
}

export async function raeumeNachAbgabeAuf(db: Db, r2: R2Ablage | undefined, kontoId: string, wepId: string, jetzt = Date.now()): Promise<AufraeumErgebnis> {
  const erg: AufraeumErgebnis = { verwaist: 0, gruenDateien: 0 }
  const z = await ladeZeile(db, wepId)
  if (!z || !['beim_bv', 'rueckfrage', 'geprueft'].includes(z.zustand)) return erg
  if (r2) erg.verwaist = await loescheVerwaisteDateien(r2, JSON.parse(z.daten))
  if (erg.verwaist) await protokolliere(db, { kontoId, aktion: 'dateien_verwaist_geloescht', ziel: wepId, details: `${erg.verwaist} Dateien ohne Eintrag im WEP` }, jetzt)
  const g = z.zusammengefuehrt_aus ? await ladeZeile(db, z.zusammengefuehrt_aus) : null
  if (!g || g.zusammengefuehrt_in !== wepId || g.daten === markierungsDaten(g.id)) return erg
  // Erst die Dateien, dann der Inhalt: bricht R2 ab, bleibt alles für den nächsten Versuch
  if (r2) erg.gruenDateien = await loescheAlleDateien(r2, g.id)
  await db.batch([
    db.prepare("UPDATE weps SET daten = ?, anlage = '', parzelle = '' WHERE id = ?").bind(markierungsDaten(g.id), g.id),
    db.prepare("UPDATE zusammenfuehrungen SET bau_vorher = '' WHERE bau_id = ?").bind(wepId),
  ])
  erg.gruenId = g.id
  const notiz = `Inhalt und ${erg.gruenDateien} ${erg.gruenDateien === 1 ? 'Datei' : 'Dateien'} gelöscht – steckt im Bau-WEP ${z.vorgangs_nr || wepId}`
  await verlauf(db, { wepId: g.id, kontoId, aktion: 'aufgeraeumt', notiz }, jetzt)
  await protokolliere(db, { kontoId, aktion: 'wep_aufgeraeumt', ziel: g.id, details: `zusammengeführt in ${wepId}; ${erg.gruenDateien} Dateien gelöscht` }, jetzt)
  return erg
}
