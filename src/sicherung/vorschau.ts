// Vorschau beim Einspielen: Was ist neu, was gleich, was weicht vom Stand auf diesem Gerät ab?
// Es wird nichts stillschweigend überschrieben: bei Abweichungen gilt vorerst „behalten“, die
// Entscheidung trifft der Nutzer (Auswahl je Eintrag).
import type { Wep } from '@/model'
import { aktiveEigene, type EigenePosition } from '@/katalog'
import { normalisiere } from '@/katalog/util'
import type { Profil } from '@/profil'
import type { GeleseneSicherung } from './lesen'
import type { SicherungsQuelle } from './types'

export type Wahl = 'uebernehmen' | 'ueberspringen' | 'behalten' | 'kopie'

export const WAHL_TEXT: Record<Wahl, string> = {
  uebernehmen: 'Aus der Sicherung übernehmen',
  ueberspringen: 'Nicht einspielen',
  behalten: 'Stand auf diesem Gerät behalten',
  kopie: 'Als neues WEP mit neuer Nummer anlegen',
}

export interface Punkt {
  /** Schlüssel für die Entscheidung: wep:<id> · korb:<id> · eigen:<id> · profil */
  schluessel: string
  titel: string
  /** Zusatzzeile, z. B. Zeitpunkte oder Anzahl der Fotos. */
  detail: string
  status: 'neu' | 'gleich' | 'anders' | 'im-papierkorb' | 'vorhanden'
  /** Leer = nichts zu entscheiden (gleich oder schon vorhanden). */
  optionen: Wahl[]
  standard: Wahl
  /** Nur bei WEPs: Fotos, die aus der Sicherung dazukommen, und ob eine Bau-Excel dabei ist. */
  fotos?: number
  bauExcel?: boolean
}

export interface Vorschau {
  erstelltAm: string
  appVersion: string
  weps: Punkt[]
  papierkorb: Punkt[]
  eigene: Punkt[]
  profil?: Punkt
  /** Mindestens ein Punkt, der eingespielt werden könnte. */
  hatAenderungen: boolean
}

export type Entscheidungen = Record<string, Wahl>

/** Standardentscheidungen: Neues wird übernommen, Abweichendes bleibt, wie es hier ist. */
export function standardEntscheidungen(v: Vorschau): Entscheidungen {
  const e: Entscheidungen = {}
  for (const p of alle(v)) if (p.optionen.length > 0) e[p.schluessel] = p.standard
  return e
}

export function alle(v: Vorschau): Punkt[] {
  return [...v.weps, ...v.papierkorb, ...v.eigene, ...(v.profil ? [v.profil] : [])]
}

/** JSON mit sortierten Schlüsseln: Reihenfolge der Felder und `undefined` spielen für den Vergleich keine Rolle. */
export function stabil(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}
export const gleichesWep = (a: Wep, b: Wep): boolean => stabil(a) === stabil(b)

export function wepKurztitel(wep: Wep): string {
  const { kleingartenanlage, parzelle } = wep.formalien
  const t = [kleingartenanlage, parzelle].filter((s) => s.trim()).join(' · ')
  return t ? `${wep.id} · ${t}` : wep.id
}

const datum = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'unbekannt')

/** Vergleicht die Sicherung mit dem Stand auf diesem Gerät. */
export async function erstelleVorschau(s: GeleseneSicherung, lokal: SicherungsQuelle): Promise<Vorschau> {
  const d = s.daten
  const [lWeps, lKorb, lEigene, lProfil] = await Promise.all([
    lokal.weps(),
    lokal.papierkorb(),
    lokal.eigenePositionen(),
    lokal.profil(),
  ])
  const aktivNachId = new Map(lWeps.map((w) => [w.wep.id, w]))
  const korbNachId = new Map(lKorb.map((k) => [k.id, k]))

  const weps: Punkt[] = []
  for (const sw of d.weps) {
    const id = sw.wep.id
    const fotos = d.fotos.filter((f) => f.wepId === id).length
    const bauExcel = d.bauExcel.some((b) => b.wepId === id)
    const zusatz = [fotos ? `${fotos} Foto${fotos === 1 ? '' : 's'}` : '', bauExcel ? 'Bau-Excel' : ''].filter(Boolean).join(', ')
    const basis = { schluessel: `wep:${id}`, titel: wepKurztitel(sw.wep), fotos, bauExcel }
    const l = aktivNachId.get(id)
    if (!l && korbNachId.has(id)) {
      weps.push({
        ...basis,
        status: 'im-papierkorb',
        detail: `Liegt auf diesem Gerät im Papierkorb. ${zusatz}`.trim(),
        optionen: ['ueberspringen', 'kopie'],
        standard: 'ueberspringen',
      })
    } else if (!l) {
      weps.push({ ...basis, status: 'neu', detail: `Neu auf diesem Gerät. ${zusatz}`.trim(), optionen: ['uebernehmen', 'ueberspringen'], standard: 'uebernehmen' })
    } else if (gleichesWep(l.wep, sw.wep)) {
      weps.push({ ...basis, status: 'gleich', detail: 'Schon genau so vorhanden.', optionen: [], standard: 'ueberspringen' })
    } else {
      const neuer =
        sw.geaendertAm && l.geaendertAm
          ? sw.geaendertAm > l.geaendertAm
            ? 'Die Sicherung ist neuer.'
            : sw.geaendertAm < l.geaendertAm
              ? 'Der Stand hier ist neuer.'
              : ''
          : ''
      weps.push({
        ...basis,
        status: 'anders',
        detail: `Weicht ab. Hier geändert: ${datum(l.geaendertAm)}, Sicherung: ${datum(sw.geaendertAm)}. ${neuer}`.trim(),
        optionen: ['behalten', 'uebernehmen', 'kopie'],
        standard: 'behalten',
      })
    }
  }

  const papierkorb: Punkt[] = d.papierkorb.map((k) => {
    const da = aktivNachId.has(k.id) || korbNachId.has(k.id)
    return {
      schluessel: `korb:${k.id}`,
      titel: wepKurztitel(k.wep),
      detail: da ? 'Nummer ist hier schon vergeben – bleibt unverändert.' : `Gelöscht am ${datum(k.geloeschtAm)}; kommt in den Papierkorb.`,
      status: da ? 'vorhanden' : 'neu',
      optionen: da ? [] : ['uebernehmen', 'ueberspringen'],
      standard: 'uebernehmen',
    }
  })

  const eigene = vergleicheEigene(d.eigenePositionen, lEigene)

  const profil = vergleicheProfil(d.profil.profil, lProfil.profil)

  const v: Vorschau = { erstelltAm: d.erstelltAm, appVersion: d.appVersion, weps, papierkorb, eigene, profil, hatAenderungen: false }
  v.hatAenderungen = alle(v).some((p) => p.optionen.length > 0)
  return v
}

const eigenSchluessel = (e: EigenePosition) =>
  `${e.abschnitt}|${normalisiere(e.bezeichnung)}|${normalisiere(e.einheit)}`

function eigenText(e: EigenePosition): string {
  return `${e.bezeichnung} · ${e.einheit}${e.einzelpreis !== undefined ? ` · ${e.einzelpreis.toFixed(2).replace('.', ',')} €` : ''}`
}

function vergleicheEigene(sicherung: EigenePosition[], lokal: EigenePosition[]): Punkt[] {
  const nachId = new Map(lokal.map((e) => [e.id, e]))
  const aktivNachSchluessel = new Set(aktiveEigene(lokal).map(eigenSchluessel))
  const punkte: Punkt[] = []
  for (const e of sicherung) {
    const l = nachId.get(e.id)
    const schluessel = `eigen:${e.id}`
    if (!l) {
      // Eine in der Sicherung gelöschte Position, die es hier nicht gibt, ist nichts zum Einspielen
      if (e.geloescht) continue
      // Gleiche Position unter anderer Kennung: nicht doppelt anlegen
      if (aktivNachSchluessel.has(eigenSchluessel(e))) continue
      punkte.push({ schluessel, titel: e.bezeichnung, detail: `Neue eigene Position. ${eigenText(e)}`, status: 'neu', optionen: ['uebernehmen', 'ueberspringen'], standard: 'uebernehmen' })
    } else if (
      l.abschnitt === e.abschnitt &&
      l.bezeichnung === e.bezeichnung &&
      l.einheit === e.einheit &&
      l.einzelpreis === e.einzelpreis &&
      !!l.geloescht === !!e.geloescht
    ) {
      continue
    } else {
      punkte.push({
        schluessel,
        titel: e.bezeichnung,
        detail: `Weicht ab. Hier: ${l.geloescht ? 'gelöscht' : eigenText(l)}. Sicherung: ${e.geloescht ? 'gelöscht' : eigenText(e)}.`,
        status: 'anders',
        optionen: ['behalten', 'uebernehmen'],
        standard: 'behalten',
      })
    }
  }
  return punkte
}

const profilLeer = (p: Profil) => !p.name.trim()

function vergleicheProfil(sicherung: Profil, lokal: Profil): Punkt | undefined {
  if (profilLeer(sicherung)) return undefined
  const beschreibe = (p: Profil) => p.name.trim() || 'leer'
  if (sicherung.name === lokal.name && sicherung.rolle === lokal.rolle) return undefined
  if (profilLeer(lokal)) {
    return { schluessel: 'profil', titel: 'Profil', detail: `Hier noch leer. Sicherung: ${beschreibe(sicherung)}.`, status: 'neu', optionen: ['uebernehmen', 'ueberspringen'], standard: 'uebernehmen' }
  }
  return {
    schluessel: 'profil',
    titel: 'Profil',
    detail: `Weicht ab. Hier: ${beschreibe(lokal)}. Sicherung: ${beschreibe(sicherung)}.`,
    status: 'anders',
    optionen: ['behalten', 'uebernehmen'],
    standard: 'behalten',
  }
}
