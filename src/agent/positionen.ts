/**
 * Positions-Vorschlag (`window.wep.positionen.vorschlagen`): Außenanlagen, Aufwuchs und Beseitigung aus Text, den der Nutzer einem
 * Agenten gibt. Der Agent nennt nur, WAS er gelesen hat (Katalog-Treffer oder Freitext, Menge, Zustand, ggf. Preis); Preisvorschlag
 * (Höchstwert × Zustand), Bezeichnung und Regelhinweise (invasiv, Problempflanze, Rasen > 100 m² …) rechnet die App wie im Formular.
 * Nichts wird gespeichert, bis der Nutzer „Übernehmen“ wählt (`src/app/PositionenVorschlag.tsx`).
 *
 * Format `wep-positionen/1`: `{ "format": "wep-positionen/1", "liste": "aufwuchs" | "aussenanlagen" | "beseitigung", "positionen": [ … ] }`.
 */
import { INVASIVE_ARTEN, KATALOG_POSITIONEN, PROBLEMPFLANZEN } from '../app/katalogDaten'
import { gefundeneArt, kurzeBezeichnung, variantenMerkmale } from '../gruen/format'
import { berechnePreisvorschlag } from '../gruen/preisvorschlag'
import { berechneRegelhinweise } from '../gruen/regelhinweise'
import { aktiveEigene, lokaleEigene, sucheKatalog, type Position as KatalogPosition, type Variante } from '../katalog'
import { normalisiere } from '../katalog/util'
import { ZUSTANDSSTUFEN, wepRolle, type BeseitigungsPosition, type Position, type Wep } from '../model'

export const POSITIONEN_FORMAT = 'wep-positionen/1'
export const POSITIONEN_LISTEN = ['aufwuchs', 'aussenanlagen', 'beseitigung'] as const
export type PositionenListe = (typeof POSITIONEN_LISTEN)[number]
export const ZUSTAENDE = Object.keys(ZUSTANDSSTUFEN) as NonNullable<Position['zustand']>[]
export const EINHEITEN_POSITION = ['Stück', 'm', 'm²', 'm³', 'lfdm', 'Pauschale']
export const EINHEITEN_BESEITIGUNG = ['Stück', 'm', 'm²', 'Pauschale']

export const MAX_POSITIONEN = 100
const MAX_TEXT = 200

type Rohobjekt = Record<string, unknown>
const istObjekt = (v: unknown): v is Rohobjekt => typeof v === 'object' && v !== null && !Array.isArray(v)
const istZahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export interface PositionsFehler {
  pfad: string
  meldung: string
}

/** Eine Zeile der Vorschau (für Agent und Balken in der App). */
export interface VorschauZeile {
  bezeichnung: string
  menge: number
  einheit: string
  zustand: string | null
  einzelpreis: number
  summe: number
  /** Bezeichnung der Katalog-Position bzw. „Freitext“ / „Eigene Position“. */
  quelle: string
  /** Faktor (nur Beseitigung). */
  faktor?: number
}

export interface PositionenErgebnis {
  ok: boolean
  fehler: PositionsFehler[]
  /** Regelhinweise und Auffälligkeiten; verhindern nichts. */
  hinweise: string[]
  zusammenfassung: string
  anzahl: number
  vorschau: VorschauZeile[]
  /** Summe der Vorschau in Euro. */
  summe: number
}

export interface GeprueftePositionen extends PositionenErgebnis {
  liste: PositionenListe | null
  /** Neue Positionen (Außenanlagen/Aufwuchs), leer solange nicht `ok`. */
  positionen: Position[]
  /** Neue Beseitigungspositionen. */
  beseitigung: BeseitigungsPosition[]
}

// ---------------------------------------------------------------------------
// Katalogsuche (nur lesend)
// ---------------------------------------------------------------------------

export interface KatalogTrefferInfo {
  katalogId: string
  bezeichnung: string
  kategorie: string
  einheit: string
  bewrlSeite: number
  /** Regeltext der Richtlinie (kann leer sein). */
  regeln: string
  /** Höchstwert in € (ohne Varianten). */
  hoechstwert: number | null
  /** Varianten mit Höchstwert; `variante` im Vorschlag = der Index. */
  varianten: { index: number; merkmale: string; hoechstwert: number }[]
  eigene: boolean
}

const ABSCHNITT: Record<'aufwuchs' | 'aussenanlagen', string> = { aufwuchs: 'III. Aufwuchs', aussenanlagen: 'II. Außenanlagen' }

function eigeneFuer(liste: 'aufwuchs' | 'aussenanlagen') {
  try {
    return aktiveEigene(lokaleEigene.lade().eintraege, liste)
  } catch {
    return []
  }
}

function kandidaten(liste: 'aufwuchs' | 'aussenanlagen'): KatalogPosition[] {
  return KATALOG_POSITIONEN.filter((p) => p.abschnitt === ABSCHNITT[liste])
}

/** Sucht im Katalog des Abschnitts (tippfehlertolerant, auch Arten und Alltagsbegriffe) – dieselbe Suche wie „Position hinzufügen“. */
export function katalogSuchen(begriff: string, liste: 'aufwuchs' | 'aussenanlagen', limit = 8): KatalogTrefferInfo[] {
  const treffer = sucheKatalog(kandidaten(liste), begriff, { limit })
  return treffer.map((t) => ({
    katalogId: t.position.id,
    bezeichnung: t.position.bezeichnung,
    kategorie: t.position.kategorie,
    einheit: t.position.einheit,
    bewrlSeite: t.position.seite,
    regeln: t.position.regeln,
    hoechstwert: t.position.hoechstwert ?? null,
    varianten: (t.position.varianten ?? []).map((v, index) => ({ index, merkmale: variantenMerkmale(v), hoechstwert: v.hoechstwert })),
    eigene: false,
  }))
}

// ---------------------------------------------------------------------------
// Prüfung
// ---------------------------------------------------------------------------

const POS_FELDER = ['suche', 'katalogId', 'variante', 'bezeichnung', 'anzahl', 'einheit', 'zustand', 'einzelpreis'] as const
const BES_FELDER = ['gegenstand', 'menge', 'einheit', 'einzelpreis', 'faktor', 'begruendung'] as const

interface Kontext {
  fehler: PositionsFehler[]
  hinweise: string[]
}
const fehlt = (k: Kontext, pfad: string, meldung: string) => k.fehler.push({ pfad, meldung })

function zahl(k: Kontext, o: Rohobjekt, feld: string, pfad: string, opt: { pflicht?: boolean; positiv?: boolean; min?: number } = {}): number | undefined {
  const v = o[feld]
  if (v === undefined) {
    if (opt.pflicht) fehlt(k, `${pfad}.${feld}`, `„${feld}“ fehlt (Zahl).`)
    return undefined
  }
  if (!istZahl(v)) {
    fehlt(k, `${pfad}.${feld}`, `„${feld}“ muss eine Zahl sein, nicht ${typeof v === 'string' ? `der Text „${v}“` : JSON.stringify(v)} (Dezimalpunkt statt Komma).`)
    return undefined
  }
  if (opt.positiv && v <= 0) {
    fehlt(k, `${pfad}.${feld}`, `„${feld}“ muss größer als 0 sein (ist ${v}).`)
    return undefined
  }
  if (v < (opt.min ?? 0) || v > 1_000_000) {
    fehlt(k, `${pfad}.${feld}`, `„${feld}“ = ${v} liegt außerhalb des erlaubten Bereichs (${opt.min ?? 0} bis 1 000 000).`)
    return undefined
  }
  return v
}

function text(k: Kontext, o: Rohobjekt, feld: string, pfad: string, pflicht = false): string | undefined {
  const v = o[feld]
  if (v === undefined) {
    if (pflicht) fehlt(k, `${pfad}.${feld}`, `„${feld}“ fehlt.`)
    return undefined
  }
  if (typeof v !== 'string' || !v.trim()) {
    fehlt(k, `${pfad}.${feld}`, `„${feld}“ muss ein nicht leerer Text sein.`)
    return undefined
  }
  if (v.trim().length > MAX_TEXT) {
    fehlt(k, `${pfad}.${feld}`, `„${feld}“ ist zu lang (höchstens ${MAX_TEXT} Zeichen).`)
    return undefined
  }
  return v.trim()
}

function einheitFeld(k: Kontext, o: Rohobjekt, pfad: string, erlaubt: string[]): string | undefined {
  const e = text(k, o, 'einheit', pfad)
  if (e === undefined) return undefined
  const treffer = erlaubt.find((x) => normalisiere(x) === normalisiere(e)) ?? (normalisiere(e) === 'lfdm' ? 'lfdm' : undefined)
  if (!treffer) {
    fehlt(k, `${pfad}.einheit`, `Unbekannte Einheit „${e}“. Erlaubt: ${erlaubt.join(', ')}.`)
    return undefined
  }
  return treffer
}

const neuePositionId = () => `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const neueBesId = () => `bes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

interface Aufgeloest {
  katalog?: KatalogPosition
  variante?: Variante
  art?: string
  eigene?: { bezeichnung: string; einheit: string; einzelpreis?: number }
}

/** Löst `katalogId`/`suche`/`variante` auf einen Katalogeintrag auf – oder meldet, was mehrdeutig oder unbekannt ist. */
function loeseAuf(k: Kontext, o: Rohobjekt, pfad: string, liste: 'aufwuchs' | 'aussenanlagen'): Aufgeloest | null | 'frei' {
  const katalogId = text(k, o, 'katalogId', pfad)
  const suche = text(k, o, 'suche', pfad)
  if (katalogId && suche) {
    fehlt(k, pfad, 'Entweder „katalogId“ oder „suche“ angeben, nicht beides.')
    return null
  }
  if (!katalogId && !suche) return 'frei'
  const varianteRoh = o.variante
  let pos: KatalogPosition | undefined
  let art: string | undefined
  let treffVariante: Variante | undefined
  if (katalogId) {
    pos = kandidaten(liste).find((p) => p.id === katalogId)
    if (!pos) {
      fehlt(k, `${pfad}.katalogId`, `Keine Katalog-Position „${katalogId}“ in „${liste}“. Mit window.wep.positionen.katalogSuchen('<Begriff>', '${liste}') nachschlagen.`)
      return null
    }
  } else {
    const eigene = eigeneFuer(liste)
    const treffer = sucheKatalog([...kandidaten(liste)], suche!, { limit: 3 })
    const eigeneTreffer = eigene.filter((e) => normalisiere(e.bezeichnung) === normalisiere(suche!))
    if (eigeneTreffer.length && varianteRoh === undefined) {
      const e = eigeneTreffer[0]
      return { eigene: { bezeichnung: e.bezeichnung, einheit: e.einheit, einzelpreis: e.einzelpreis } }
    }
    if (!treffer.length) {
      fehlt(k, `${pfad}.suche`, `Im Katalog (${liste}) gibt es nichts zu „${suche}“. Für etwas Eigenes „bezeichnung“, „einheit“ und „einzelpreis“ ohne „suche“ angeben (Freitext).`)
      return null
    }
    pos = treffer[0].position
    treffVariante = treffer[0].variante
    art = gefundeneArt(pos, suche!)
  }
  let variante = treffVariante
  if (varianteRoh !== undefined) {
    const vs = pos.varianten ?? []
    if (!vs.length) {
      fehlt(k, `${pfad}.variante`, `„${pos.bezeichnung}“ hat keine Varianten (nur einen Höchstwert).`)
      return null
    }
    if (typeof varianteRoh === 'number' && Number.isInteger(varianteRoh) && varianteRoh >= 0 && varianteRoh < vs.length) variante = vs[varianteRoh]
    else if (typeof varianteRoh === 'string' && varianteRoh.trim()) {
      const q = normalisiere(varianteRoh)
      const passend = vs.filter((v) => normalisiere(variantenMerkmale(v)).includes(q) || q.split(' ').every((t) => normalisiere(variantenMerkmale(v)).includes(t)))
      if (passend.length === 1) variante = passend[0]
      else {
        fehlt(k, `${pfad}.variante`, `${passend.length ? 'Mehrdeutig' : 'Unbekannt'}: „${varianteRoh}“. Varianten von „${pos.bezeichnung}“: ${vs.map((v, i) => `${i} = ${variantenMerkmale(v)} (bis ${v.hoechstwert} €)`).join('; ')}.`)
        return null
      }
    } else {
      fehlt(k, `${pfad}.variante`, 'variante ist der Index (Zahl ab 0) oder ein Text der Merkmale, z. B. „Halbstamm 5–30“.')
      return null
    }
  }
  if (pos.varianten?.length && !variante) {
    fehlt(
      k,
      `${pfad}.variante`,
      `„${pos.bezeichnung}“ hat mehrere Preisvarianten – bitte „variante“ angeben: ${pos.varianten.map((v, i) => `${i} = ${variantenMerkmale(v)} (bis ${v.hoechstwert} €)`).join('; ')}.`,
    )
    return null
  }
  return { katalog: pos, variante, art }
}

function pruefePosition(k: Kontext, e: unknown, i: number, liste: 'aufwuchs' | 'aussenanlagen', wep: Wep): Position | null {
  const pfad = `positionen[${i}]`
  if (!istObjekt(e)) {
    fehlt(k, pfad, 'Eine Position ist ein Objekt, z. B. { "suche": "Apfel", "variante": "Halbstamm 5–30", "anzahl": 2 }.')
    return null
  }
  const anfang = k.fehler.length
  for (const f of Object.keys(e)) if (!(POS_FELDER as readonly string[]).includes(f)) fehlt(k, `${pfad}.${f}`, `Unbekanntes Feld „${f}“. Erlaubt: ${POS_FELDER.join(', ')}.`)
  const aufgeloest = loeseAuf(k, e, pfad, liste)
  const anzahl = zahl(k, e, 'anzahl', pfad, { pflicht: true, positiv: true })
  const bezeichnungRoh = text(k, e, 'bezeichnung', pfad)
  const einheitRoh = e.einheit !== undefined ? einheitFeld(k, e, pfad, EINHEITEN_POSITION) : undefined
  let zustand: Position['zustand'] | undefined = 'gut'
  if (e.zustand !== undefined) {
    if (typeof e.zustand === 'string' && (ZUSTAENDE as string[]).includes(e.zustand)) zustand = e.zustand as Position['zustand']
    else fehlt(k, `${pfad}.zustand`, `zustand muss ${ZUSTAENDE.map((z) => `„${z}“`).join(', ')} sein (ist ${JSON.stringify(e.zustand)}). Ohne Angabe gilt „gut“.`)
  }
  const preis = zahl(k, e, 'einzelpreis', pfad)
  if (aufgeloest === 'frei') {
    if (!bezeichnungRoh) fehlt(k, `${pfad}.bezeichnung`, 'Freitext-Position: „bezeichnung“ fehlt (oder „suche“ / „katalogId“ für einen Katalogeintrag angeben).')
    if (!einheitRoh && e.einheit === undefined) fehlt(k, `${pfad}.einheit`, `Freitext-Position: „einheit“ fehlt (${EINHEITEN_POSITION.join(', ')}).`)
  }
  if (k.fehler.length > anfang || aufgeloest === null || anzahl === undefined) return null

  const katalog = aufgeloest !== 'frei' ? aufgeloest.katalog : undefined
  const eigene = aufgeloest !== 'frei' ? aufgeloest.eigene : undefined
  const variante = aufgeloest !== 'frei' ? aufgeloest.variante : undefined
  const hoechstwert = variante?.hoechstwert ?? katalog?.hoechstwert
  const bezeichnung = bezeichnungRoh ?? (katalog ? kurzeBezeichnung(katalog, variante, aufgeloest !== 'frei' ? aufgeloest.art : undefined) : (eigene?.bezeichnung ?? ''))
  const einheit = einheitRoh ?? katalog?.einheit ?? eigene?.einheit ?? 'Stück'
  const grund: Position = {
    id: neuePositionId(),
    ...(katalog ? { katalogId: katalog.id } : {}),
    bezeichnung,
    anzahl,
    einheit,
    zustand,
    ...(hoechstwert !== undefined ? { hoechstwert } : {}),
    einzelpreis: 0,
    preisManuell: false,
    hinweise: [],
  }
  const preisManuell = preis !== undefined || (eigene?.einzelpreis !== undefined && hoechstwert === undefined)
  const einzelpreis = preis ?? (preisManuell ? (eigene?.einzelpreis ?? 0) : berechnePreisvorschlag(grund))
  const pos: Position = { ...grund, einzelpreis, preisManuell }
  pos.hinweise = berechneRegelhinweise(pos, wep, KATALOG_POSITIONEN, INVASIVE_ARTEN, PROBLEMPFLANZEN)
  for (const h of pos.hinweise) if (h.schwere === 'warnung') k.hinweise.push(`${pfad} „${bezeichnung}“: ${h.text}`)
  if (!katalog && !preisManuell && zustand !== 'schlecht') k.hinweise.push(`${pfad} „${bezeichnung}“ hat keinen Höchstwert und keinen Preis: Einzelpreis 0 € – der Nutzer trägt ihn ein.`)
  if (preis !== undefined && hoechstwert !== undefined && preis > hoechstwert + 0.005) {
    k.hinweise.push(`${pfad} „${bezeichnung}“: Preis ${preis} € liegt über dem Höchstwert von ${hoechstwert} € (BewRL) – nur ein Hinweis.`)
  }
  const bestehend = (liste === 'aufwuchs' ? wep.gruen.aufwuchs : wep.gruen.aussenanlagen).find((p) => normalisiere(p.bezeichnung) === normalisiere(bezeichnung))
  if (bestehend) k.hinweise.push(`${pfad} „${bezeichnung}“ gibt es in der Liste schon (${bestehend.anzahl} ${bestehend.einheit}) – mit „Übernehmen“ entsteht eine zweite Zeile.`)
  return pos
}

function pruefeBeseitigung(k: Kontext, e: unknown, i: number): BeseitigungsPosition | null {
  const pfad = `positionen[${i}]`
  if (!istObjekt(e)) {
    fehlt(k, pfad, 'Eine Beseitigungsposition ist ein Objekt, z. B. { "gegenstand": "Blaufichte entfernen", "menge": 1, "einheit": "Stück", "einzelpreis": 80 }.')
    return null
  }
  const anfang = k.fehler.length
  for (const f of Object.keys(e)) if (!(BES_FELDER as readonly string[]).includes(f)) fehlt(k, `${pfad}.${f}`, `Unbekanntes Feld „${f}“. Erlaubt: ${BES_FELDER.join(', ')}.`)
  const gegenstand = text(k, e, 'gegenstand', pfad, true)
  const menge = zahl(k, e, 'menge', pfad, { pflicht: true, positiv: true })
  if (e.einheit === undefined) fehlt(k, `${pfad}.einheit`, `„einheit“ fehlt (${EINHEITEN_BESEITIGUNG.join(', ')}).`)
  const einheit = e.einheit !== undefined ? einheitFeld(k, e, pfad, EINHEITEN_BESEITIGUNG) : undefined
  const einzelpreis = zahl(k, e, 'einzelpreis', pfad, { pflicht: true })
  const faktor = zahl(k, e, 'faktor', pfad, { positiv: true }) ?? 1
  const begruendung = text(k, e, 'begruendung', pfad)
  if (k.fehler.length > anfang || !gegenstand || menge === undefined || !einheit || einzelpreis === undefined) return null
  if (faktor > 1 && !begruendung) k.hinweise.push(`${pfad} „${gegenstand}“: Faktor ${faktor} > 1 braucht eine Begründung („begruendung“).`)
  return { id: neueBesId(), gegenstand, menge, einheit, einzelpreis, faktor, ...(faktor > 1 && begruendung ? { begruendung } : {}) }
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const zahlDe = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

/**
 * Prüft einen Positions-Vorschlag gegen das WEP. Alles oder nichts: ein Fehler verhindert die Anzeige.
 */
export function pruefePositionen(eingabe: unknown, wep: Wep): GeprueftePositionen {
  const k: Kontext = { fehler: [], hinweise: [] }
  const leer = (z: string): GeprueftePositionen => ({ ok: false, fehler: k.fehler, hinweise: k.hinweise, zusammenfassung: z, anzahl: 0, vorschau: [], summe: 0, liste: null, positionen: [], beseitigung: [] })
  let json: unknown = eingabe
  if (typeof eingabe === 'string') {
    try {
      json = JSON.parse(eingabe)
    } catch (err) {
      fehlt(k, '', `Der Vorschlag ist kein gültiges JSON: ${err instanceof Error ? err.message : String(err)}`)
      return leer('Nichts angezeigt: kein gültiges JSON.')
    }
  }
  if (!istObjekt(json)) {
    fehlt(k, '', `Der Vorschlag ist ein Objekt: { "format": "${POSITIONEN_FORMAT}", "liste": "aufwuchs", "positionen": [ … ] }.`)
    return leer('Nichts angezeigt: der Vorschlag ist kein Objekt.')
  }
  for (const f of Object.keys(json)) if (!['format', 'liste', 'positionen'].includes(f)) fehlt(k, f, `Unbekanntes Feld „${f}“ im Vorschlag (erlaubt: format, liste, positionen).`)
  if (json.format !== POSITIONEN_FORMAT) fehlt(k, 'format', `„format“ muss „${POSITIONEN_FORMAT}“ sein (ist ${JSON.stringify(json.format)}).`)
  const liste = json.liste
  if (typeof liste !== 'string' || !(POSITIONEN_LISTEN as readonly string[]).includes(liste)) fehlt(k, 'liste', `„liste“ muss „aufwuchs“, „aussenanlagen“ oder „beseitigung“ sein (ist ${JSON.stringify(liste)}).`)
  if (!Array.isArray(json.positionen)) fehlt(k, 'positionen', '„positionen“ fehlt: Liste der Positionen.')
  else if (json.positionen.length === 0) fehlt(k, 'positionen', '„positionen“ ist leer.')
  else if (json.positionen.length > MAX_POSITIONEN) fehlt(k, 'positionen', `Zu viele Positionen (${json.positionen.length}, höchstens ${MAX_POSITIONEN}).`)
  if (wepRolle(wep) === 'bau') fehlt(k, '', 'Dieses WEP hat keinen Grün-Teil (Rolle „bau“); Außenanlagen, Aufwuchs und Beseitigung Grün gibt es hier nicht.')
  if (k.fehler.length) return leer(`Nichts angezeigt: ${k.fehler.length} Fehler im Vorschlag.`)

  const l = liste as PositionenListe
  const roh = json.positionen as unknown[]
  const positionen: Position[] = []
  const beseitigung: BeseitigungsPosition[] = []
  roh.forEach((e, i) => {
    if (l === 'beseitigung') {
      const b = pruefeBeseitigung(k, e, i)
      if (b) beseitigung.push(b)
    } else {
      const p = pruefePosition(k, e, i, l, wep)
      if (p) positionen.push(p)
    }
  })
  if (k.fehler.length) return leer(`Nichts angezeigt: ${k.fehler.length} ${k.fehler.length === 1 ? 'Fehler' : 'Fehler'} im Vorschlag.`)

  const vorschau: VorschauZeile[] =
    l === 'beseitigung'
      ? beseitigung.map((b) => ({ bezeichnung: b.gegenstand, menge: b.menge, einheit: b.einheit, zustand: null, einzelpreis: b.einzelpreis, summe: Math.round(b.menge * b.einzelpreis * b.faktor * 100) / 100, quelle: 'Beseitigung', faktor: b.faktor }))
      : positionen.map((p) => ({
          bezeichnung: p.bezeichnung,
          menge: p.anzahl,
          einheit: p.einheit,
          zustand: p.zustand ?? null,
          einzelpreis: p.einzelpreis,
          summe: Math.round(p.anzahl * p.einzelpreis * 100) / 100,
          quelle: p.katalogId ? (KATALOG_POSITIONEN.find((c) => c.id === p.katalogId)?.bezeichnung ?? p.katalogId) : 'Freitext',
        }))
  const summe = Math.round(vorschau.reduce((s, z) => s + z.summe, 0) * 100) / 100
  const ziel = l === 'aufwuchs' ? 'Aufwuchs' : l === 'aussenanlagen' ? 'Außenanlagen' : 'Beseitigung Grün'
  return {
    ok: true,
    fehler: [],
    hinweise: k.hinweise,
    zusammenfassung:
      `${vorschau.length} ${vorschau.length === 1 ? 'Position' : 'Positionen'} für „${ziel}“ (Summe ${eur.format(summe)}, ${zahlDe.format(vorschau.reduce((s, z) => s + z.menge, 0))} Einheiten insgesamt). ` +
      'Der Vorschlag steht oben im Reiter; gespeichert wird erst, wenn der Nutzer „Übernehmen“ wählt.',
    anzahl: vorschau.length,
    vorschau,
    summe,
    liste: l,
    positionen,
    beseitigung,
  }
}
