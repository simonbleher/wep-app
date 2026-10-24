// Außenanlagen, Aufwuchs und Beseitigung (Abschnitt 2) aus der Bau-Excel in das WEP übernehmen.
//
// Regeln (wie bei den Formalien: nichts geht still verloren, nichts wird überschrieben):
// - Eine Zeile der Bau-Excel, die im WEP schon steht (gleiche Bezeichnung, Menge und Einheit), wird nicht doppelt angelegt.
// - Ist die Liste im WEP noch leer, wird sie beim Hinterlegen der Bau-Excel gleich gefüllt (`fuelleLeereListen`).
// - Gibt es im WEP schon Einträge, bietet die App die fehlenden Zeilen an; hinzugefügt wird nur, was der Nutzer wählt.
// - Übernommene Zeilen sind Freitext mit dem Preis der Bau-Excel (`preisManuell`); die Regelhinweise rechnet die App.
import { INVASIVE_ARTEN, KATALOG_POSITIONEN, PROBLEMPFLANZEN } from '@/app/katalogDaten'
import type { BauGruen, BauGruenBeseitigung, BauGruenPosition } from '@/export/bauExcelLesen'
import { berechneRegelhinweise } from '@/gruen/regelhinweise'
import { normalisiere } from '@/katalog/util'
import type { BeseitigungsPosition, Position, Wep } from '@/model'

export type GruenListe = 'aussenanlagen' | 'aufwuchs' | 'beseitigungAA'

export const LISTEN_NAMEN: Record<GruenListe, string> = {
  aussenanlagen: 'Außenanlagen',
  aufwuchs: 'Aufwuchs',
  beseitigungAA: 'Beseitigung Außenanlagen/Aufwuchs',
}

export const GRUEN_LISTEN: readonly GruenListe[] = ['aussenanlagen', 'aufwuchs', 'beseitigungAA']

/** Eine Zeile zur Anzeige im Dialog. */
export interface GruenZeile {
  text: string
  /** „3 Stück · 20 €“ */
  detail: string
}

export interface GruenListenAbgleich {
  liste: GruenListe
  name: string
  /** Zeilen der Bau-Excel, die im WEP noch fehlen. */
  neu: GruenZeile[]
  /** Zeilen, die im WEP schon stehen. */
  gleich: number
  /** Im WEP gibt es in dieser Liste noch keinen Eintrag. */
  wepLeer: boolean
}

const zahlText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
const euro = (n: number) => (n > 0 ? `${zahlText(n)} €` : 'ohne Preis')

const schluessel = (text: string, menge: number, einheit: string) => `${normalisiere(text)}|${menge}|${normalisiere(einheit)}`

const posSchluessel = (p: { bezeichnung: string; anzahl: number; einheit: string }) => schluessel(p.bezeichnung, p.anzahl, p.einheit)
const besSchluessel = (p: { gegenstand: string; menge: number; einheit: string }) => schluessel(p.gegenstand, p.menge, p.einheit)

function fehlende<B, W>(bau: B[], wep: W[], sb: (b: B) => string, sw: (w: W) => string): { neu: B[]; gleich: number } {
  // Eins zu eins zählen: stehen zwei gleiche Zeilen in der Bau-Excel, aber nur eine im WEP, fehlt die zweite noch
  const vorhanden = new Map<string, number>()
  for (const w of wep) vorhanden.set(sw(w), (vorhanden.get(sw(w)) ?? 0) + 1)
  const neu: B[] = []
  let gleich = 0
  for (const b of bau) {
    const k = sb(b)
    const rest = vorhanden.get(k) ?? 0
    if (rest > 0) {
      vorhanden.set(k, rest - 1)
      gleich++
    } else neu.push(b)
  }
  return { neu, gleich }
}

const posBau = (b: BauGruenPosition) => schluessel(b.bezeichnung, b.anzahl, b.einheit)
const posZeile = (b: BauGruenPosition): GruenZeile => ({ text: b.bezeichnung, detail: `${zahlText(b.anzahl)} ${b.einheit} · ${euro(b.einzelpreis)}` })
const besZeile = (b: BauGruenBeseitigung): GruenZeile => ({
  text: b.gegenstand,
  detail: `${zahlText(b.menge)} ${b.einheit} · ${euro(b.einzelpreis)}${b.faktor !== 1 ? ` · Faktor ${zahlText(b.faktor)}` : ''}`,
})

export function pruefeGruen(wep: Wep, bau: BauGruen): GruenListenAbgleich[] {
  const a = fehlende(bau.aussenanlagen, wep.gruen.aussenanlagen, posBau, posSchluessel)
  const p = fehlende(bau.aufwuchs, wep.gruen.aufwuchs, posBau, posSchluessel)
  const b = fehlende(bau.beseitigungAA, wep.gruen.beseitigungAA, (x) => schluessel(x.gegenstand, x.menge, x.einheit), besSchluessel)
  return [
    { liste: 'aussenanlagen', name: LISTEN_NAMEN.aussenanlagen, neu: a.neu.map(posZeile), gleich: a.gleich, wepLeer: wep.gruen.aussenanlagen.length === 0 },
    { liste: 'aufwuchs', name: LISTEN_NAMEN.aufwuchs, neu: p.neu.map(posZeile), gleich: p.gleich, wepLeer: wep.gruen.aufwuchs.length === 0 },
    { liste: 'beseitigungAA', name: LISTEN_NAMEN.beseitigungAA, neu: b.neu.map(besZeile), gleich: b.gleich, wepLeer: wep.gruen.beseitigungAA.length === 0 },
  ]
}

/** Anzahl Zeilen der Bau-Excel, die im WEP noch fehlen. */
export const offeneZeilen = (ab: readonly GruenListenAbgleich[]): number => ab.reduce((s, l) => s + l.neu.length, 0)

let zaehler = 0
const neueId = (vorsatz: string) => `${vorsatz}-${Date.now()}-${(zaehler++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

function neuePosition(b: BauGruenPosition, wep: Wep): Position {
  const pos: Position = {
    id: neueId('pos'),
    bezeichnung: b.bezeichnung,
    anzahl: b.anzahl,
    einheit: b.einheit,
    einzelpreis: b.einzelpreis,
    preisManuell: true, // der Preis stammt aus der Bau-Excel, nicht aus Höchstwert × Zustand
    hinweise: [],
  }
  pos.hinweise = berechneRegelhinweise(pos, wep, KATALOG_POSITIONEN, INVASIVE_ARTEN, PROBLEMPFLANZEN)
  return pos
}

const neueBeseitigung = (b: BauGruenBeseitigung, begruendung?: string): BeseitigungsPosition => ({
  id: neueId('bes'),
  gegenstand: b.gegenstand,
  menge: b.menge,
  einheit: b.einheit,
  einzelpreis: b.einzelpreis,
  faktor: b.faktor,
  ...(b.faktor > 1 && begruendung ? { begruendung } : {}),
})

/** Hängt die fehlenden Zeilen der gewählten Listen an; vorhandene Einträge bleiben unverändert. */
export function uebernimmGruen(wep: Wep, bau: BauGruen, listen: ReadonlySet<GruenListe>): Wep {
  const ab = new Map(pruefeGruen(wep, bau).map((l) => [l.liste, l]))
  const fehlt = (liste: GruenListe) => (listen.has(liste) ? (ab.get(liste)?.neu.length ?? 0) > 0 : false)
  if (!GRUEN_LISTEN.some(fehlt)) return wep
  const aussen = fehlt('aussenanlagen') ? [...wep.gruen.aussenanlagen, ...neueZeilen(bau.aussenanlagen, wep.gruen.aussenanlagen, posBau, posSchluessel).map((b) => neuePosition(b, wep))] : wep.gruen.aussenanlagen
  const auf = fehlt('aufwuchs') ? [...wep.gruen.aufwuchs, ...neueZeilen(bau.aufwuchs, wep.gruen.aufwuchs, posBau, posSchluessel).map((b) => neuePosition(b, wep))] : wep.gruen.aufwuchs
  const bes = fehlt('beseitigungAA')
    ? [
        ...wep.gruen.beseitigungAA,
        ...neueZeilen(bau.beseitigungAA, wep.gruen.beseitigungAA, (x) => schluessel(x.gegenstand, x.menge, x.einheit), besSchluessel).map((b) => neueBeseitigung(b, bau.beseitigungBegruendung)),
      ]
    : wep.gruen.beseitigungAA
  return { ...wep, gruen: { ...wep.gruen, aussenanlagen: aussen, aufwuchs: auf, beseitigungAA: bes } }
}

function neueZeilen<B, W>(bau: B[], wep: W[], sb: (b: B) => string, sw: (w: W) => string): B[] {
  return fehlende(bau, wep, sb, sw).neu
}

/** Füllt nur die Listen, die im WEP noch leer sind (beim Hinterlegen der Bau-Excel); alles andere bleibt dem Nutzer überlassen. */
export function fuelleLeereListen(wep: Wep, bau: BauGruen): Wep {
  const leer = new Set(pruefeGruen(wep, bau).filter((l) => l.wepLeer).map((l) => l.liste))
  return uebernimmGruen(wep, bau, leer)
}
