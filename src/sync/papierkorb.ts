// Papierkorb und Konflikte, lokale Seite (Beta 3, Paket 2).
//
// Die Regeln hängen nur an der Schnittstelle `LokalSpeicher` (in der App IndexedDB,
// in Tests ein Fake). Der Abgleich mit OneDrive (engine.ts) liest und schreibt dieselben
// Felder und überträgt die Ergebnisse auf daten/papierkorb/.
//
// Lebenslauf eines gelöschten WEP:
//   löschen            → Eintrag im Papierkorb, Meta.geloescht (+ geloeschtAm)
//   wiederherstellen   → wieder im Store „weps“, Meta.wiederhergestellt (Abgleich holt die
//                        Datei aus daten/papierkorb/ zurück)
//   endgültig löschen  → Eintrag weg; gibt es Spuren in OneDrive, bleibt eine Marke
//                        (Meta.endgueltig), bis der Abgleich die Dateien entfernt hat
//   30 Tage            → wie „endgültig löschen“ (raeumePapierkorbAuf)
import { neueWepId, vorgangsNrVon, type Wep } from '@/model'
import type { LokalSpeicher, PapierkorbEintrag, SyncMeta } from './types'

export const PAPIERKORB_TAGE = 30
const TAG_MS = 24 * 60 * 60 * 1000

/** Ist die Aufbewahrungsfrist (30 Tage) seit dem Löschen abgelaufen? */
export function istAbgelaufen(geloeschtAm: string, jetzt: string): boolean {
  const dauer = Date.parse(jetzt) - Date.parse(geloeschtAm)
  return Number.isFinite(dauer) && dauer >= PAPIERKORB_TAGE * TAG_MS
}

/** Wie viele Tage der Papierkorb-Eintrag noch aufbewahrt wird (mindestens 0, aufgerundet). */
export function verbleibendeTage(geloeschtAm: string, jetzt: string): number {
  const rest = PAPIERKORB_TAGE * TAG_MS - (Date.parse(jetzt) - Date.parse(geloeschtAm))
  return Number.isFinite(rest) ? Math.max(0, Math.ceil(rest / TAG_MS)) : PAPIERKORB_TAGE
}

/** Meta mit gesetzten Feldern; `undefined` entfernt ein Feld. */
export function metaMit(
  alt: SyncMeta | undefined,
  id: string,
  zeit: string,
  felder: Partial<SyncMeta> = {},
): SyncMeta {
  const neu: Record<string, unknown> = { lokalGeaendertAm: zeit, ...alt, ...felder, id }
  for (const k of Object.keys(neu)) if (neu[k] === undefined) delete neu[k]
  return neu as unknown as SyncMeta
}

/** Meta eines WEP, das gerade in den Papierkorb gelegt wird. */
export function papierkorbMeta(alt: SyncMeta | undefined, id: string, geloeschtAm: string): SyncMeta {
  return metaMit(alt, id, geloeschtAm, {
    geloescht: true,
    geloeschtAm,
    papierkorbETag: undefined,
    wiederhergestellt: undefined,
    endgueltig: undefined,
    // „Doch löschen“ beendet einen Lösch-Konflikt; ein Zwei-Geräte-Konflikt bleibt für später
    konflikt: alt?.konflikt?.art === 'geloescht-geaendert' ? undefined : alt?.konflikt,
  })
}

export interface Kontext {
  /** Aktuelle Zeit (ISO). */
  jetzt: string
  /** Kennung dieses Geräts. */
  geraet: string
}

async function metaVon(spei: LokalSpeicher, id: string): Promise<SyncMeta | undefined> {
  return (await spei.alleMeta()).find((m) => m.id === id)
}

/** WEP löschen = in den Papierkorb legen. Liefert false, wenn es das WEP nicht (mehr) gibt. */
export async function loescheWep(spei: LokalSpeicher, id: string, k: Kontext): Promise<boolean> {
  return (await spei.legeInPapierkorb(id, k.jetzt, k.geraet)) !== undefined
}

export interface WiederhergestelltErgebnis {
  /** Vorgangs-Nr. des wiederhergestellten WEP (neu, wenn die alte inzwischen vergeben war). */
  id: string
  /** Die alte Nummer war schon vergeben: Es wurde als neues WEP angelegt, das Original bleibt im Papierkorb. */
  neueNummer: boolean
}

/** Holt ein WEP aus dem Papierkorb zurück. Liefert undefined, wenn es nicht im Papierkorb liegt. */
export async function stelleWiederHer(
  spei: LokalSpeicher,
  id: string,
  k: Kontext,
): Promise<WiederhergestelltErgebnis | undefined> {
  const [korb, weps, m] = await Promise.all([spei.alleImPapierkorb(), spei.alleWeps(), metaVon(spei, id)])
  const eintrag = korb.find((e) => e.id === id)
  if (!eintrag) return undefined

  if (weps.some((w) => w.id === id)) {
    // Die (alte) Kennung ist inzwischen wieder belegt: nichts überschreiben, unter neuer Kennung wiederherstellen.
    // Die Vorgangs-Nr. bleibt – es ist derselbe Vorgang.
    const nr = neueWepId()
    const kopie: Wep = { ...eintrag.wep, id: nr, formalien: { ...eintrag.wep.formalien, vorgangsNr: vorgangsNrVon(eintrag.wep) } }
    await spei.schreibe({ id: nr, wep: kopie, meta: metaMit(undefined, nr, k.jetzt), ereignis: 'geaendert' })
    return { id: nr, neueNummer: true }
  }

  await spei.schreibe({
    id,
    wep: eintrag.wep,
    papierkorb: null,
    meta: metaMit(m, id, k.jetzt, {
      geloescht: false,
      geloeschtAm: undefined,
      endgueltig: undefined,
      wiederhergestellt: true,
    }),
    ereignis: 'wiederhergestellt',
  })
  return { id, neueNummer: false }
}

/** Gibt es von diesem WEP Spuren in OneDrive, die der Abgleich noch entfernen muss? */
function hatSpuren(m: SyncMeta | undefined): boolean {
  return !!(m?.remoteETag || m?.papierkorbETag)
}

/** „Endgültig löschen“. Liefert false, wenn das WEP nicht im Papierkorb liegt. */
export async function loescheEndgueltig(spei: LokalSpeicher, id: string, jetzt: string): Promise<boolean> {
  const [korb, m] = await Promise.all([spei.alleImPapierkorb(), metaVon(spei, id)])
  const eintrag = korb.find((e) => e.id === id)
  if (!eintrag) return false
  await spei.schreibe({
    id,
    papierkorb: null,
    meta: hatSpuren(m)
      ? metaMit(m, id, jetzt, { geloescht: true, geloeschtAm: eintrag.geloeschtAm, endgueltig: true })
      : null,
  })
  return true
}

/** Löscht alles endgültig, was länger als 30 Tage im Papierkorb liegt. Liefert die Nummern. */
export async function raeumePapierkorbAuf(spei: LokalSpeicher, jetzt: string): Promise<string[]> {
  const weg: string[] = []
  for (const e of await spei.alleImPapierkorb()) {
    if (istAbgelaufen(e.geloeschtAm, jetzt) && (await loescheEndgueltig(spei, e.id, jetzt))) weg.push(e.id)
  }
  return weg
}

export type KonfliktWahl = 'diese' | 'andere'

/**
 * Entscheidung zu einem Konflikt.
 * - Zwei Geräte: „diese“ = angezeigte Fassung behalten, „andere“ = die andere Fassung
 *   übernehmen (sie wird gespeichert und beim nächsten Abgleich hochgeladen).
 * - Gelöscht/geändert: „diese“ = WEP behalten, „andere“ = doch löschen.
 * Die Konflikt-Kopien in OneDrive räumt der nächste Abgleich auf.
 * Liefert das danach gültige WEP (undefined, wenn es gelöscht wurde oder es keinen Konflikt gibt).
 */
export async function loeseKonflikt(
  spei: LokalSpeicher,
  id: string,
  wahl: KonfliktWahl,
  k: Kontext,
): Promise<{ wep?: Wep } | undefined> {
  const [weps, m] = await Promise.all([spei.alleWeps(), metaVon(spei, id)])
  const konflikt = m?.konflikt
  const aktuell = weps.find((w) => w.id === id)
  if (!m || !konflikt || !aktuell) return undefined
  const aufraeumen = [...new Set([...(m.aufraeumen ?? []), ...konflikt.kopien])]

  if (konflikt.art === 'geloescht-geaendert') {
    if (wahl === 'diese') {
      await spei.schreibe({ id, meta: metaMit(m, id, k.jetzt, { konflikt: undefined, aufraeumen: aufraeumen.length ? aufraeumen : undefined }) })
      return { wep: aktuell }
    }
    await spei.schreibe({ id, meta: metaMit(m, id, k.jetzt, { konflikt: undefined }) })
    await loescheWep(spei, id, k)
    return {}
  }

  const gewaehlt = wahl === 'diese' || !konflikt.fassung ? aktuell : konflikt.fassung
  const andere = gewaehlt === aktuell ? konflikt.fassung : aktuell
  // Fotos beider Fassungen behalten: sonst verschwänden die Fotos des anderen Geräts aus dem WEP
  // (und noch nicht hochgeladene würden später lokal verworfen).
  const ergebnisWep = mitFotosVon(gewaehlt, andere)
  const geaendert = ergebnisWep !== aktuell
  await spei.schreibe({
    id,
    ...(geaendert ? { wep: ergebnisWep, ereignis: 'geaendert' as const } : {}),
    meta: metaMit(m, id, k.jetzt, {
      konflikt: undefined,
      aufraeumen: aufraeumen.length ? aufraeumen : undefined,
      // wartet damit auf den Upload und gewinnt auf den anderen Geräten
      ...(geaendert ? { lokalGeaendertAm: k.jetzt } : {}),
    }),
  })
  return { wep: ergebnisWep }
}

/** `wep` mit den Fotos aus `andere` ergänzt, die es nicht kennt (gleiches Objekt, wenn nichts fehlt). */
export function mitFotosVon(wep: Wep, andere: Wep | undefined): Wep {
  const fehlend = (andere?.fotos ?? []).filter((f) => !(wep.fotos ?? []).some((g) => g.id === f.id))
  return fehlend.length ? { ...wep, fotos: [...(wep.fotos ?? []), ...fehlend] } : wep
}

/** Alle WEPs im Papierkorb, zuletzt gelöschte zuerst. */
export async function papierkorbListe(spei: LokalSpeicher): Promise<PapierkorbEintrag[]> {
  return [...(await spei.alleImPapierkorb())].sort((a, b) => b.geloeschtAm.localeCompare(a.geloeschtAm))
}
