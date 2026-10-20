// Fotos aufnehmen, löschen und nachladen (Beta 3, Paket 4). Die Oberfläche (src/app/Fotos.tsx)
// ruft nur diese Funktionen auf; Bildverarbeitung und Ablage sind austauschbar (Tests).
import type { Foto, Wep } from '@/model'
import { dbAblage, type FotoAblage } from './ablage'
import { browserBilddienst } from './browserBild'
import { erzeugeFoto, erzeugeVorschau, type Bilddienst } from './komprimieren'
import { fotoKey, type FotoRecord } from './types'

/** Ändert das aktuelle WEP (immer auf Basis des neuesten Stands) und speichert es. */
export type WepAendern = (fn: (wep: Wep) => Wep) => Promise<void>

export interface FotoWerkzeuge {
  ablage: FotoAblage
  bild: Bilddienst
  jetzt: () => string
  neueId: () => string
}

export function neueFotoId(): string {
  const zufall = Math.random().toString(36).slice(2, 8)
  return `f${Date.now().toString(36)}${zufall}`
}

const standard: FotoWerkzeuge = {
  ablage: dbAblage,
  bild: browserBilddienst,
  jetzt: () => new Date().toISOString(),
  neueId: neueFotoId,
}

const hoerer = new Set<() => void>()
/** Meldet, wenn sich Fotos (Dateien, Vorschauen, Upload-Stand) geändert haben. */
export function beiFotoAenderung(fn: () => void): () => void {
  hoerer.add(fn)
  return () => void hoerer.delete(fn)
}
export function meldeFotoAenderung(): void {
  for (const fn of hoerer) fn()
}

async function bytesVon(datei: Blob): Promise<Uint8Array> {
  return new Uint8Array(await datei.arrayBuffer())
}

export interface HinzufuegenErgebnis {
  fotos: Foto[]
  fehler: { name: string; meldung: string }[]
}

/**
 * Verkleinert die gewählten Fotos, legt sie lokal ab und trägt sie ins WEP ein. Ein Foto nach dem
 * anderen (schont den Speicher); `beiFortschritt` meldet „n von m“. Ein Foto, das sich nicht
 * verarbeiten lässt (z. B. HEIC im Browser), bricht die anderen nicht ab.
 */
export async function fuegeFotosHinzu(opt: {
  wepId: string
  dateien: (Blob & { name?: string })[]
  positionId?: string
  text?: string
  aendere: WepAendern
  beiFortschritt?: (fertig: number, gesamt: number) => void
  werkzeuge?: Partial<FotoWerkzeuge>
}): Promise<HinzufuegenErgebnis> {
  const w = { ...standard, ...opt.werkzeuge }
  const ergebnis: HinzufuegenErgebnis = { fotos: [], fehler: [] }
  let fertig = 0
  for (const datei of opt.dateien) {
    opt.beiFortschritt?.(fertig, opt.dateien.length)
    try {
      const f = await erzeugeFoto(await bytesVon(datei), w.bild)
      const zeit = w.jetzt()
      const id = w.neueId()
      const foto: Foto = {
        id,
        ...(opt.positionId ? { positionId: opt.positionId } : {}),
        ...(opt.text?.trim() ? { text: opt.text.trim() } : {}),
        aufgenommenAm: zeit,
        breite: f.breite,
        hoehe: f.hoehe,
        groesse: f.jpeg.byteLength,
      }
      const record: FotoRecord = {
        key: fotoKey(opt.wepId, id),
        wepId: opt.wepId,
        id,
        vorschau: new Blob([f.vorschau.slice().buffer], { type: 'image/jpeg' }),
        hatDatei: true,
        hochgeladen: false,
        erstelltAm: zeit,
      }
      // Erst die Datei, dann der Verweis im WEP: bricht etwas ab, bleibt höchstens eine unbenutzte Datei
      await w.ablage.speichere(record, new Blob([f.jpeg.slice().buffer], { type: 'image/jpeg' }))
      await opt.aendere((wep) => ({ ...wep, fotos: [...(wep.fotos ?? []), foto] }))
      ergebnis.fotos.push(foto)
    } catch (e) {
      ergebnis.fehler.push({
        name: datei.name ?? 'Foto',
        meldung: e instanceof Error ? e.message : String(e),
      })
    }
    fertig++
    meldeFotoAenderung()
  }
  opt.beiFortschritt?.(fertig, opt.dateien.length)
  return ergebnis
}

/** Ändert den Text eines Fotos. */
export function setzeFotoText(aendere: WepAendern, fotoId: string, text: string): Promise<void> {
  return aendere((wep) => ({
    ...wep,
    fotos: (wep.fotos ?? []).map((f) => {
      if (f.id !== fotoId) return f
      const { text: _alt, ...rest } = f
      return text.trim() ? { ...rest, text: text.trim() } : rest
    }),
  }))
}

/**
 * Löscht ein Foto: Es verschwindet aus dem WEP und von diesem Gerät. Liegt es schon in OneDrive, wird
 * die Datei dort beim nächsten Abgleich entfernt – aber erst, wenn das WEP ohne das Foto dort angekommen
 * ist (src/sync/fotos.ts).
 */
export async function loescheFoto(opt: {
  wepId: string
  fotoId: string
  aendere: WepAendern
  werkzeuge?: Partial<FotoWerkzeuge>
}): Promise<void> {
  const w = { ...standard, ...opt.werkzeuge }
  await opt.aendere((wep) => ({ ...wep, fotos: (wep.fotos ?? []).filter((f) => f.id !== opt.fotoId) }))
  const rec = (await w.ablage.recordsVon(opt.wepId)).find((r) => r.id === opt.fotoId)
  if (rec?.hochgeladen) await w.ablage.markiereGeloescht(opt.wepId, opt.fotoId, w.jetzt())
  else await w.ablage.entferne(opt.wepId, opt.fotoId)
  meldeFotoAenderung()
}

/**
 * Wird eine Position gelöscht, bleiben ihre Fotos erhalten: Sie hängen danach am WEP allgemein, der
 * Name der Position steht als Text dabei.
 */
export function loeseFotosVonPosition(wep: Wep, positionId: string, name: string): Wep {
  if (!(wep.fotos ?? []).some((f) => f.positionId === positionId)) return wep
  return {
    ...wep,
    fotos: (wep.fotos ?? []).map((f) => {
      if (f.positionId !== positionId) return f
      const { positionId: _p, ...rest } = f
      return { ...rest, text: f.text ? `${name}: ${f.text}` : `Zu: ${name}` }
    }),
  }
}

export interface LadeQuelle {
  /** Holt die Bilddatei aus OneDrive (undefined = dort nicht vorhanden). */
  hole(wepId: string, fotoId: string): Promise<Blob | undefined>
}

/**
 * Lädt Fotos des WEP nach, die nur in OneDrive liegen (z. B. auf einem anderen Gerät aufgenommen),
 * und erzeugt die Vorschauen. Wenige gleichzeitig; ein Fehler bricht die übrigen nicht ab.
 */
export async function ladeFehlendeFotos(opt: {
  wep: Wep
  quelle: LadeQuelle
  parallel?: number
  beiFortschritt?: (fertig: number, gesamt: number) => void
  werkzeuge?: Partial<FotoWerkzeuge>
}): Promise<{ geladen: number; fehlgeschlagen: number }> {
  const w = { ...standard, ...opt.werkzeuge }
  const vorhanden = new Map((await w.ablage.recordsVon(opt.wep.id)).map((r) => [r.id, r]))
  const offen = (opt.wep.fotos ?? []).filter((f) => !vorhanden.get(f.id)?.hatDatei && !vorhanden.get(f.id)?.geloescht)
  let geladen = 0
  let fehlgeschlagen = 0
  let naechster = 0
  async function arbeiter(): Promise<void> {
    while (naechster < offen.length) {
      const foto = offen[naechster++]
      try {
        const blob = await opt.quelle.hole(opt.wep.id, foto.id)
        if (!blob) {
          fehlgeschlagen++
          continue
        }
        const vorschau = await erzeugeVorschau(await bytesVon(blob), w.bild)
        await w.ablage.speichere(
          {
            key: fotoKey(opt.wep.id, foto.id),
            wepId: opt.wep.id,
            id: foto.id,
            vorschau: new Blob([vorschau.slice().buffer], { type: 'image/jpeg' }),
            hatDatei: true,
            hochgeladen: true,
            erstelltAm: w.jetzt(),
          },
          blob,
        )
        geladen++
      } catch {
        fehlgeschlagen++
      }
      opt.beiFortschritt?.(geladen + fehlgeschlagen, offen.length)
      meldeFotoAenderung()
    }
  }
  await Promise.all(Array.from({ length: Math.min(opt.parallel ?? 2, offen.length) }, arbeiter))
  return { geladen, fehlgeschlagen }
}
