// Bäume: Vorschlag direkt aus dem Maß.
//
// - Beseitigung Grün, Vorlage „Baum fällen“: Satz nach Stammumfang in 1,30 m Höhe (BewRL S. 20–21).
//   Eingabe wahlweise als Durchmesser, Umfang = π × Durchmesser.
// - Aufwuchs, Obstgehölze: Altersstufe aus dem Alter in vollen Jahren (BewRL S. 16).
// - Geschützte Bäume: fest 1,00 € je Stück (BewRL S. 16) – siehe preisvorschlag.ts.
//
// Die Staffeln stehen in data/katalog.json („staffeln“). Fehlt das Maß, gibt es keinen Vorschlag und einen
// Hinweis „Maß fehlt“; gespeichert und überschrieben werden kann trotzdem immer (nichts sperren, nur warnen).
// Reine Funktionen – getestet in src/gruen/__tests__/baumMass.test.ts.

import katalogRaw from '../../data/katalog.json'
import type { BeseitigungsPosition, Hinweis, Position, Wep } from '@/model'
import { zahlDe } from './format'

export interface Stufe {
  /** Obergrenze einschließlich („bis 30 cm“) */
  bis?: number
  /** Letzte Stufe: alles darüber („größer 140 cm“) */
  ueber?: number
  hoechstwert?: number
  altersstufe?: string
}

export interface Staffel {
  katalogId?: string
  bezeichnung?: string
  mass: string
  masseinheit: string
  einheit?: string
  seite: number
  seiteBis?: number
  regeln?: string
  stufen: Stufe[]
}

const STAFFELN = (katalogRaw as unknown as { staffeln: Record<string, Staffel> & Record<'baumBeseitigung' | 'obstgehoelzAlter', Staffel> }).staffeln

/** Beseitigungskosten Bäume nach Stammumfang (S. 20–21). */
export const BAUM_BESEITIGUNG: Staffel = STAFFELN.baumBeseitigung
/** Altersstufen der Obstgehölze (S. 16). */
export const OBST_ALTER: Staffel = STAFFELN.obstgehoelzAlter
export const OBST_ID = 'aw-obstgehoelz'
/** Altersstaffeln je Katalog-Position (Obstgehölze, Beerenobst, weitere Kulturen; BewRL S. 16–17). */
const ALTERS_STAFFELN = new Map(
  Object.values(STAFFELN)
    .filter((s) => s.masseinheit === 'Jahre' && s.katalogId)
    .map((s) => [s.katalogId!, s] as const),
)
/** Altersstaffel einer Katalog-Position – undefined, wenn die Richtlinie dort nicht nach Alter staffelt. */
export function altersStaffel(katalogId: string | undefined): Staffel | undefined {
  return katalogId ? ALTERS_STAFFELN.get(katalogId) : undefined
}
export const GESCHUETZT_ID = 'aw-baum-geschuetzt'
/** Fester Wert geschützter Bäume (S. 16). */
export const GESCHUETZT_WERT = 1

/** Seitenangabe einer Staffel, z. B. „S. 20–21“. */
export function staffelSeite(s: Staffel): string {
  return s.seiteBis && s.seiteBis !== s.seite ? `S. ${s.seite}–${s.seiteBis}` : `S. ${s.seite}`
}

const gueltig = (x: number | undefined): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0

/** Stufe zu einem Maß: erste Stufe mit Maß ≤ bis, sonst die „über“-Stufe. Ohne gültiges Maß: undefined. */
export function stufeFuer(staffel: Staffel, mass: number | undefined): Stufe | undefined {
  if (!gueltig(mass)) return undefined
  return staffel.stufen.find((s) => s.bis !== undefined && mass <= s.bis) ?? staffel.stufen.find((s) => s.ueber !== undefined && mass > s.ueber)
}

/** Kurztext einer Stufe, z. B. „bis 30 cm“ oder „über 140 cm“. */
export function stufenText(staffel: Staffel, s: Stufe): string {
  return s.bis !== undefined ? `bis ${zahlDe(s.bis)} ${staffel.masseinheit}` : `über ${zahlDe(s.ueber ?? 0)} ${staffel.masseinheit}`
}

// ---------------------------------------------------------------------------
// Beseitigung: Baum fällen
// ---------------------------------------------------------------------------

/** Umfang aus Durchmesser (π × d), auf 0,1 cm gerundet – die Stufe richtet sich nach diesem angezeigten Wert. */
export function umfangAusDurchmesser(durchmesserCm: number): number {
  return Math.round(Math.PI * durchmesserCm * 10) / 10
}

/** Durchmesser aus Umfang (u / π), auf 0,1 cm gerundet – nur zur Anzeige. */
export function durchmesserAusUmfang(umfangCm: number): number {
  return Math.round((umfangCm / Math.PI) * 10) / 10
}

/** Stammumfang einer Beseitigungsposition (aus dem Umfang oder dem Durchmesser). */
export function stammumfangVon(p: Pick<BeseitigungsPosition, 'baum'>): number | undefined {
  const b = p.baum
  if (!b) return undefined
  if (gueltig(b.stammumfangCm)) return b.stammumfangCm
  if (gueltig(b.durchmesserCm)) return umfangAusDurchmesser(b.durchmesserCm)
  return undefined
}

/** Vorgeschlagener Einzelpreis „Baum fällen“ nach Stammumfang – undefined, wenn das Maß fehlt. */
export function baumFaellenPreis(umfangCm: number | undefined): number | undefined {
  return stufeFuer(BAUM_BESEITIGUNG, umfangCm)?.hoechstwert
}

/** Gegenstand für Protokoll, PDF und Excel: „Birke fällen inkl. Wurzelstock, StU 85 cm“ (ohne Maß: „…, StU fehlt“). */
export function baumFaellenText(art: string | undefined, umfangCm: number | undefined): string {
  const name = art?.trim() || 'Baum'
  return `${name} fällen inkl. Wurzelstock, ${gueltig(umfangCm) ? `StU ${zahlDe(umfangCm, 1)} cm` : 'StU fehlt'}`
}

/** Hinweise zu einer Beseitigungsposition „Baum fällen“ (Maß fehlt, Stufe). Leere Liste bei anderen Positionen. */
export function baumHinweise(p: BeseitigungsPosition): Hinweis[] {
  if (!p.baum) return []
  const u = stammumfangVon(p)
  if (u === undefined) {
    return [{ schwere: 'warnung', text: `Maß fehlt: Stammumfang in 1,30 m Höhe (oder Durchmesser) eintragen – ohne Maß kein Vorschlag (BewRL ${staffelSeite(BAUM_BESEITIGUNG)}).` }]
  }
  const s = stufeFuer(BAUM_BESEITIGUNG, u)!
  return [{ schwere: 'info', text: `Stammumfang ${zahlDe(u, 1)} cm → Stufe „${stufenText(BAUM_BESEITIGUNG, s)}“: bis ${zahlDe(s.hoechstwert ?? 0)} € (BewRL ${staffelSeite(BAUM_BESEITIGUNG)}).` }]
}

// ---------------------------------------------------------------------------
// Aufwuchs nach Alter: Obstgehölze, Beerenobst, weitere Kulturen (Weinrebe, Erdbeere, Rhabarber, Kiwi, Spargel)
// ---------------------------------------------------------------------------

/** Altersstufe einer Position aus dem Alter in vollen Jahren (Nachkommastellen werden abgeschnitten). */
export function altersstufeFuer(katalogId: string | undefined, alterJahre: number | undefined): string | undefined {
  const staffel = altersStaffel(katalogId)
  if (!staffel || typeof alterJahre !== 'number' || !Number.isFinite(alterJahre) || alterJahre < 0) return undefined
  // 0 Jahre (frisch gepflanzt) gehört zur ersten Stufe
  return stufeFuer(staffel, Math.max(Math.floor(alterJahre), 0.0001))?.altersstufe
}

/** Altersstufe eines Obstgehölzes (S. 16). */
export function obstAltersstufe(alterJahre: number | undefined): string | undefined {
  return altersstufeFuer(OBST_ID, alterJahre)
}

type AlterVariante = { form?: string; altersstufe?: string; hoechstwert: number }

/**
 * Höchstwert aus Wuchsform (falls die Position Formen hat) und Alter – undefined, wenn etwas fehlt oder unbekannt ist.
 */
export function hoechstwertNachAlter(
  katalogId: string | undefined,
  varianten: readonly AlterVariante[],
  form: string | undefined,
  alterJahre: number | undefined,
): number | undefined {
  const stufe = altersstufeFuer(katalogId, alterJahre)
  const mitFormen = varianten.some((v) => v.form)
  if (!stufe || (mitFormen && !form)) return undefined
  return varianten.find((v) => (mitFormen ? v.form === form : true) && v.altersstufe === stufe)?.hoechstwert
}

/** Höchstwert eines Obstgehölzes aus Baumform und Alter. */
export function obstHoechstwert(varianten: readonly AlterVariante[], baumform: string | undefined, alterJahre: number | undefined): number | undefined {
  return hoechstwertNachAlter(OBST_ID, varianten, baumform, alterJahre)
}

/** Bezeichnung mit Alter: „Apfel, Halbstamm, 12 J.“, „Weinrebe, 6 J.“ */
export function obstBezeichnung(name: string, baumform: string | undefined, alterJahre: number | undefined): string {
  const alter = typeof alterJahre === 'number' && Number.isFinite(alterJahre) && alterJahre >= 0 ? `${zahlDe(Math.floor(alterJahre))} J.` : undefined
  return [name, baumform, alter].filter(Boolean).join(', ')
}

/**
 * Ist das Alter der Position ein Pflichtfeld? Ja bei Positionen, die nach Alter erfasst werden (`nachAlter`, bei
 * Obstgehölzen aus #133 auch erkennbar an der Baumform). Ältere Positionen ohne diese Kennung bleiben, wie sie sind.
 */
export function brauchtAlter(p: Pick<Position, 'katalogId' | 'baumform' | 'nachAlter'>): boolean {
  if (!altersStaffel(p.katalogId)) return false
  return Boolean(p.nachAlter) || (p.katalogId === OBST_ID && Boolean(p.baumform))
}

/** Hat die Position ein gültiges Alter? */
export function hatAlter(p: Pick<Position, 'alterJahre'>): boolean {
  return typeof p.alterJahre === 'number' && Number.isFinite(p.alterJahre) && p.alterJahre >= 0
}

/** Hinweise zum Alter einer Aufwuchs-Position, deren Wert die Richtlinie nach Alter staffelt. */
export function alterHinweise(p: Position): Hinweis[] {
  const staffel = altersStaffel(p.katalogId)
  if (!staffel) return []
  if (!hatAlter(p)) {
    return brauchtAlter(p)
      ? [{ schwere: 'warnung', text: `Maß fehlt: Alter in Jahren eintragen – ohne Alter kein Vorschlag (BewRL S. ${staffel.seite}).` }]
      : [{ schwere: 'info', text: 'Alter nicht erfasst: Der Vorschlag folgt der gewählten Altersstufe. Beim Ändern der Position kann das Alter nachgetragen werden.' }]
  }
  return [{ schwere: 'info', text: `Alter ${zahlDe(Math.floor(p.alterJahre!))} Jahre → Altersstufe „${altersstufeFuer(p.katalogId, p.alterJahre)}“ (BewRL S. ${staffel.seite}).` }]
}

// ---------------------------------------------------------------------------
// Vor der Abgabe
// ---------------------------------------------------------------------------

/** Positionen des Grün-Teils, bei denen das Pflichtmaß fehlt (für die Warnung vor der Abgabe). */
export function fehlendeMasse(wep: Pick<Wep, 'gruen'>): string[] {
  const g = wep.gruen
  if (!g) return []
  const aufwuchs = (g.aufwuchs ?? []).filter((p) => brauchtAlter(p) && !hatAlter(p)).map((p) => `Aufwuchs: „${p.bezeichnung}“ – Alter fehlt`)
  const baeume = (g.beseitigungAA ?? []).filter((p) => p.baum && stammumfangVon(p) === undefined).map((p) => `Beseitigung: „${p.gegenstand}“ – Stammumfang fehlt`)
  return [...aufwuchs, ...baeume]
}

/**
 * Obstgehölze in der Suche: eine Zeile je Baumform statt je Form × Altersstufe – die Altersstufe ergibt sich
 * aus dem Alter. Höchstwert = größter Wert der Form (Anzeige „bis …“).
 */
export function obstFormVarianten<V extends { form?: string; altersstufe?: string; hoechstwert: number }>(varianten: readonly V[]): { form: string; hoechstwert: number }[] {
  const formen: { form: string; hoechstwert: number }[] = []
  for (const v of varianten) {
    if (!v.form) continue
    const f = formen.find((x) => x.form === v.form)
    if (f) f.hoechstwert = Math.max(f.hoechstwert, v.hoechstwert)
    else formen.push({ form: v.form, hoechstwert: v.hoechstwert })
  }
  return formen
}

/** Baumform aus einer älteren Bezeichnung („Apfel, Halbstamm, 5–30 J.“ → „Halbstamm“). */
export function formAusBezeichnung(varianten: readonly { form?: string }[], bezeichnung: string): string | undefined {
  const formen = [...new Set(varianten.map((v) => v.form).filter((f): f is string => Boolean(f)))]
  return formen.find((f) => new RegExp(`(^|[\\s,(])${f}([\\s,)]|$)`, 'i').test(bezeichnung))
}
