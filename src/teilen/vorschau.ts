// Vorschau beim Öffnen einer WEP-Datei: neu / gleich / unterschiedlich – und bei Abweichung je Teil
// (Bau-Teil, Grün-Teil, Fotos, Bau-Excel, Formalien), was übernommen wird. Der Vergleich des ganzen WEP
// kommt aus der Sicherung (`erstelleVorschau`); hier kommt nur die Aufteilung in Teile dazu.
import type { Wep } from '@/model'
import { erstelleVorschau, stabil, type Punkt, type SicherungsQuelle, type Vorschau, type Wahl } from '@/sicherung'
import type { GeleseneTeilen } from './lesen'
import { TEIL_REIHENFOLGE, TEIL_TITEL, type TeilId } from './types'

export interface TeilPunkt {
  teil: TeilId
  titel: string
  /** „Hier: … · Datei: …“ */
  detail: string
}

export type TeilWahl = 'uebernehmen' | 'behalten'

export interface TeilenVorschau {
  erstelltAm: string
  appVersion: string
  /** Vorschau der Sicherungslogik (mit genau einem WEP); wird beim Einspielen mitgegeben. */
  basis: Vorschau
  punkt: Punkt
  /** Nur bei Abweichung: die Teile, die sich unterscheiden und übernommen werden könnten. */
  teile: TeilPunkt[]
  /** Etwas, das eingespielt werden könnte. */
  hatAenderungen: boolean
}

export interface TeilenWahl {
  /** uebernehmen = (bei Abweichung: die gewählten Teile) · kopie = als neues WEP · ueberspringen */
  wep: Wahl
  teile: Partial<Record<TeilId, TeilWahl>>
}

const n = (anzahl: number, einzahl: string, mehrzahl: string) => `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`

const bauLeer = (w: Wep) => {
  const b = w.bau
  return !w.grundriss && (!b || (b.bauteile.length === 0 && b.beseitigung.length === 0 && !b.beschreibung.trim()))
}
const gruenLeer = (w: Wep) => {
  const g = w.gruen
  return !w.skizze && g.aussenanlagen.length + g.aufwuchs.length + g.beseitigungAA.length === 0 && !g.beschreibungAussen.trim() && !g.beschreibungAufwuchs.trim()
}

function beschreibe(teil: TeilId, w: Wep): string {
  if (teil === 'bau') {
    if (bauLeer(w)) return 'leer'
    return [n(w.bau?.bauteile.length ?? 0, 'Bauteil', 'Bauteile'), w.grundriss ? 'Grundriss' : ''].filter(Boolean).join(', ')
  }
  if (teil === 'gruen') {
    if (gruenLeer(w)) return 'leer'
    return `${w.gruen.aussenanlagen.length} Außenanlagen, ${w.gruen.aufwuchs.length} Aufwuchs${w.skizze ? ', Skizze' : ''}`
  }
  if (teil === 'bauExcel') return w.bauExcel ? w.bauExcel.name : 'keine'
  if (teil === 'fotos') return n(w.fotos?.length ?? 0, 'Foto', 'Fotos')
  return [w.formalien.kleingartenanlage, w.formalien.parzelle, w.status ?? 'in Arbeit'].filter((t) => t && String(t).trim()).join(' · ') || 'leer'
}

const formalienTeil = (w: Wep) => ({ formalien: w.formalien, status: w.status, rolle: w.rolle })

/** Welche Teile der Datei unterscheiden sich vom lokalen Stand und wären etwas zum Übernehmen? */
export function unterschiedlicheTeile(lokal: Wep, datei: Wep): TeilPunkt[] {
  const punkte: TeilPunkt[] = []
  const punkt = (teil: TeilId, hier: string, dort: string) =>
    punkte.push({ teil, titel: TEIL_TITEL[teil], detail: `Hier: ${hier} · Datei: ${dort}` })
  if (!bauLeer(datei) && stabil([lokal.bau, lokal.grundriss]) !== stabil([datei.bau, datei.grundriss])) {
    punkt('bau', beschreibe('bau', lokal), beschreibe('bau', datei))
  }
  if (!gruenLeer(datei) && stabil([lokal.gruen, lokal.skizze]) !== stabil([datei.gruen, datei.skizze])) {
    punkt('gruen', beschreibe('gruen', lokal), beschreibe('gruen', datei))
  }
  const vorhandeneFotos = new Set((lokal.fotos ?? []).map((f) => f.id))
  const neueFotos = (datei.fotos ?? []).filter((f) => !vorhandeneFotos.has(f.id)).length
  if (neueFotos > 0) {
    punkte.push({ teil: 'fotos', titel: TEIL_TITEL.fotos, detail: `${n(neueFotos, 'Foto kommt', 'Fotos kommen')} dazu (Fotos hier bleiben erhalten).` })
  }
  if (datei.bauExcel && datei.bauExcel.version !== lokal.bauExcel?.version) {
    punkt('bauExcel', beschreibe('bauExcel', lokal), beschreibe('bauExcel', datei))
  }
  if (stabil(formalienTeil(lokal)) !== stabil(formalienTeil(datei))) {
    punkt('formalien', beschreibe('formalien', lokal), beschreibe('formalien', datei))
  }
  return punkte.sort((a, b) => TEIL_REIHENFOLGE.indexOf(a.teil) - TEIL_REIHENFOLGE.indexOf(b.teil))
}

export async function erstelleTeilenVorschau(gelesen: GeleseneTeilen, lokal: SicherungsQuelle): Promise<TeilenVorschau> {
  const basis = await erstelleVorschau(gelesen.sicherung, lokal)
  // Die Texte der Sicherungslogik sprechen von „Sicherung“; hier ist es eine WEP-Datei
  const punkt: Punkt = { ...basis.weps[0], detail: basis.weps[0].detail.replace('Sicherung:', 'Datei:').replace('Die Sicherung ist neuer', 'Die Datei ist neuer') }
  basis.weps[0] = punkt
  let teile: TeilPunkt[] = []
  if (punkt.status === 'anders') {
    const hier = (await lokal.weps()).find((w) => w.wep.id === gelesen.daten.wep.id)
    teile = hier ? unterschiedlicheTeile(hier.wep, gelesen.daten.wep) : []
  }
  const hatAenderungen = punkt.status === 'anders' ? teile.length > 0 || punkt.optionen.includes('kopie') : punkt.optionen.length > 0
  return { erstelltAm: basis.erstelltAm, appVersion: basis.appVersion, basis, punkt, teile, hatAenderungen }
}

/** Optionen für das ganze WEP: bei Abweichung entscheidet die Auswahl je Teil (oder eine Kopie). */
export function wepOptionen(v: TeilenVorschau): Wahl[] {
  return v.punkt.status === 'anders' ? ['uebernehmen', 'kopie'] : v.punkt.optionen
}

/** Standard: Neues wird übernommen; bei Abweichung bleibt jeder Teil, wie er hier ist. */
export function standardTeilenWahl(v: TeilenVorschau): TeilenWahl {
  const teile: TeilenWahl['teile'] = {}
  for (const t of v.teile) teile[t.teil] = 'behalten'
  return { wep: v.punkt.status === 'anders' ? 'uebernehmen' : v.punkt.standard, teile }
}

/** Wie viel wird mit dieser Wahl eingespielt? (0 = der Knopf bleibt aus) */
export function anzahlGewaehlt(v: TeilenVorschau, w: TeilenWahl): number {
  if (v.punkt.status === 'anders') {
    if (w.wep === 'kopie') return 1
    return v.teile.filter((t) => w.teile[t.teil] === 'uebernehmen').length
  }
  return (w.wep === 'uebernehmen' || w.wep === 'kopie') && v.punkt.optionen.includes(w.wep) ? 1 : 0
}
