// Server-Modus (v2): Grün führt sein eigenes WEP mit einem an ihn abgegebenen Bau-WEP zusammen (docs/PLAN-V2.md,
// „Grün legt selbst an“). Reine Logik ohne Speicher und Oberfläche – die App rechnet damit offline, der Server prüft und
// übernimmt beim Abgleich (functions/_lib/v2/weps.ts, `fuehreZusammen`).
//
// Ergebnis ist das Bau-WEP (Kennung, Verlauf und Abgabe bleiben):
// - Bau-Teil, Parzelle und Bau-Excel vom Bau-WEP (hat Bau keine Parzelle, kommt die von Grün); Grün-Teil (Positionen, Beschreibungen, Grün-Skizze, Unterschrift Grün,
//   Fotos an Grün-Positionen und allgemeine Fotos) aus dem eigenen WEP.
// - Stammdaten (Formalien): Bau gilt. Unterschiede und Felder, die nur im eigenen WEP ausgefüllt sind, stehen in der
//   Vorschau; Grün wählt je Feld den eigenen Wert (Abgleich wie bei der Bau-Excel, src/bauexcel/abgleich.ts).
// - Skizze: Die Grün-Elemente kommen auf die Bau-Skizze als Grundlage (wie „Grundlage übernehmen“ im Reiter Skizze,
//   src/skizze/grundlage.ts). Hat Grün ohne Bau-Grundlage gezeichnet, gibt es den Hinweis, die Lage zu prüfen.
import type { Foto, Formalien, Wep } from '@/model'
import { pruefeFormalien } from '@/bauexcel/abgleich'
import { BAU_FORMALIEN } from './teile'
import { normalisiere } from '@/katalog/util'
import { lageVon } from '@/parzelle'
import { stabil } from '@/sicherung'
import { grundrissHatTeile, gruenElemente, uebernehmeGrundlage, type GrundlageQuelle } from '@/skizze/grundlage'
import { istGrundlage, type SkizzeDaten } from '@/skizze/types'

export type Vorschlagsgrund = 'vorgangsNr' | 'anlageParzelle'

export interface EigenesWep {
  wep: Wep
  /** Warum es passen könnte; fehlt = nur zur Auswahl. */
  grund?: Vorschlagsgrund
}

const gleich = (a: string | undefined, b: string | undefined) => Boolean(a?.trim()) && normalisiere(a ?? '') === normalisiere(b ?? '')

/**
 * Eigene offene WEPs zur Auswahl, passende zuerst: gleiche Vorgangs-Nr., sonst gleiche Anlage und Parzelle; danach alle
 * übrigen (Reihenfolge wie übergeben).
 */
export function eigeneZurAuswahl(bau: Wep, eigene: readonly Wep[]): EigenesWep[] {
  const mit = eigene
    .filter((w) => w.id !== bau.id)
    .map((wep): EigenesWep => {
      const f = wep.formalien
      if (gleich(f.vorgangsNr, bau.formalien.vorgangsNr)) return { wep, grund: 'vorgangsNr' }
      if (gleich(f.kleingartenanlage, bau.formalien.kleingartenanlage) && gleich(f.parzelle, bau.formalien.parzelle)) return { wep, grund: 'anlageParzelle' }
      return { wep }
    })
  const rang = (e: EigenesWep) => (e.grund === 'vorgangsNr' ? 0 : e.grund === 'anlageParzelle' ? 1 : 2)
  return mit.map((e, i) => ({ e, i })).sort((a, b) => rang(a.e) - rang(b.e) || a.i - b.i).map((x) => x.e)
}

export interface StammdatenFeld {
  feld: keyof Formalien
  name: string
  /** Wert im Bau-WEP (lesbar, leer = nicht ausgefüllt). */
  bau: string
  /** Wert im eigenen WEP (lesbar). */
  gruen: string
  /** `leer`: im Bau-WEP nicht ausgefüllt · `anders`: in beiden ausgefüllt und verschieden. */
  art: 'leer' | 'anders'
  /** Vorschlag für die Auswahl: leere Felder ergänzen, den eigenen Namen als Grün-Wertermittler übernehmen; sonst gilt Bau. */
  vorgewaehlt: boolean
}

export interface ZusammenfuehrenVorschau {
  /** Was aus dem eigenen WEP kommt. */
  gruen: { aussenanlagen: number; aufwuchs: number; beseitigung: number; skizze: number; fotos: number; unterschrift: boolean }
  /** Im Bau-WEP gibt es schon einen Grün-Teil (z. B. von Bau vorbereitet): er wird ersetzt. */
  ersetztGruenImBau: boolean
  /** Stammdaten mit Unterschied – Bau gilt, Grün kann je Feld den eigenen Wert übernehmen. */
  stammdaten: StammdatenFeld[]
  /** Hinweise (nur warnen): Parzelle, Skizze. */
  hinweise: string[]
}

const gruenTeilLeer = (w: Wep) =>
  w.gruen.aussenanlagen.length + w.gruen.aufwuchs.length + w.gruen.beseitigungAA.length === 0 &&
  !w.gruen.beschreibungAussen.trim() &&
  !w.gruen.beschreibungAufwuchs.trim() &&
  !(w.skizze && gruenElemente(w.skizze).length)

const gruenPositionen = (w: Wep) => new Set([...w.gruen.aussenanlagen, ...w.gruen.aufwuchs, ...w.gruen.beseitigungAA].map((p) => p.id))

/** Hat Grün auf einer Bau-Grundlage (Bauteile aus dem Grundriss oder der Bau-Excel) gezeichnet? */
const mitBauGrundlage = (s: SkizzeDaten | undefined) => Boolean(s?.elemente.some((e) => istGrundlage(e) && e.typ === 'bauform' && e.art === 'bauteil'))

/** Grundlage aus dem Bau-WEP, wie im Reiter Skizze („Grundlage: Bau-Skizze“). */
function bauGrundlage(bau: Wep): GrundlageQuelle | undefined {
  const lage = lageVon(bau)
  if (lage) return { art: 'parzelle', lage, ...(grundrissHatTeile(bau.grundriss) ? { grundriss: bau.grundriss } : {}), bauteile: bau.bau?.bauteile ?? [] }
  if (grundrissHatTeile(bau.grundriss)) return { art: 'bau', grundriss: bau.grundriss, bauteile: bau.bau?.bauteile ?? [], flaecheM2: bau.formalien.parzellenflaecheM2 || undefined }
  return undefined
}

/** Hinweis, wenn die Parzelle aus dem Grün-WEP kommt (das Bau-WEP hat keine). */
export const PARZELLE_VON_GRUEN = 'Parzelle von Grün übernommen – bitte mit Bau abstimmen.'

/** Parzelle des Ergebnisses: die von Bau; hat Bau keine, die von Grün. */
export const parzelleZusammen = (bau: Wep, gruen: Wep): Wep['parzelle'] => bau.parzelle ?? gruen.parzelle

/** Grün-Skizze auf der Bau-Grundlage und die Hinweise dazu. */
export function skizzeZusammen(bauWep: Wep, gruen: Wep, jetzt: string): { skizze?: SkizzeDaten; hinweise: string[] } {
  // Grundlage mit der Parzelle des Ergebnisses (ggf. die von Grün)
  const bau: Wep = { ...bauWep, parzelle: parzelleZusammen(bauWep, gruen) }
  const g = gruen.skizze
  if (!g) return { hinweise: [] }
  const hinweise: string[] = []
  const anzahl = gruenElemente(g).length
  const quelle = bauGrundlage(bau)
  if (anzahl > 0 && !mitBauGrundlage(g) && grundrissHatTeile(bau.grundriss)) {
    hinweise.push('Du hast ohne Bau-Grundlage gezeichnet: Lage der Grün-Elemente zur Laube prüfen.')
  }
  if (!quelle) return { skizze: g, hinweise }
  const erg = uebernehmeGrundlage(g, quelle, jetzt)
  return { skizze: erg?.daten ?? g, hinweise: [...hinweise, ...(erg?.hinweise ?? [])] }
}

/** Was übernommen würde – für die Vorschau vor dem Zusammenführen. */
export function vorschau(bau: Wep, gruen: Wep, jetzt = new Date().toISOString()): ZusammenfuehrenVorschau {
  const ab = pruefeFormalien(bau.formalien, gruen.formalien)
  // Felder des Bau-Teils (Name des Bau-Wertermittlers) bietet die Vorschau nicht an: Sie kommen immer von Bau
  ab.neu = ab.neu.filter((f) => !BAU_FORMALIEN.includes(f.feld))
  ab.unterschiede = ab.unterschiede.filter((f) => !BAU_FORMALIEN.includes(f.feld))
  const stammdaten: StammdatenFeld[] = [
    ...ab.neu.map((f): StammdatenFeld => ({ feld: f.feld, name: f.name, bau: '', gruen: f.bau, art: 'leer', vorgewaehlt: true })),
    ...ab.unterschiede.map((f): StammdatenFeld => ({ feld: f.feld, name: f.name, bau: f.wep, gruen: f.bau, art: 'anders', vorgewaehlt: f.feld === 'wertermittlerAussenAufwuchs' })),
  ]
  const hinweise: string[] = []
  if (gruen.parzelle && bau.parzelle && stabil(gruen.parzelle) !== stabil(bau.parzelle)) {
    hinweise.push('Die Parzelle (Form) unterscheidet sich: Die Parzelle des Bau-WEP gilt, deine Grün-Elemente behalten ihre Lage in Metern.')
  } else if (gruen.parzelle && !bau.parzelle) {
    hinweise.push(PARZELLE_VON_GRUEN)
  }
  hinweise.push(...skizzeZusammen(bau, gruen, jetzt).hinweise)
  return {
    gruen: {
      aussenanlagen: gruen.gruen.aussenanlagen.length,
      aufwuchs: gruen.gruen.aufwuchs.length,
      beseitigung: gruen.gruen.beseitigungAA.length,
      skizze: gruen.skizze ? gruenElemente(gruen.skizze).length : 0,
      fotos: gruen.fotos?.length ?? 0,
      unterschrift: Boolean(gruen.unterschriften?.gruen),
    },
    ersetztGruenImBau: !gruenTeilLeer(bau),
    stammdaten,
    hinweise,
  }
}

/**
 * Das zusammengeführte WEP (Kennung des Bau-WEP). `felder`: Stammdaten, für die Grün den Wert aus dem eigenen WEP
 * übernimmt. Der Server rechnet den Bau-Teil und die Stammdaten beim Abgleich noch einmal aus seinem Stand nach.
 */
export function fuehreZusammen(bau: Wep, gruen: Wep, felder: readonly (keyof Formalien)[], jetzt = new Date().toISOString()): Wep {
  const formalien = { ...bau.formalien } as unknown as Record<string, unknown>
  for (const f of felder) if (!BAU_FORMALIEN.includes(f)) formalien[f] = gruen.formalien[f]
  // Fotos: die des Bau-Teils bleiben (nicht die an einem von Bau vorbereiteten Grün-Teil), dazu alle des eigenen WEP
  const vorbereitet = gruenPositionen(bau)
  const bauFotos = (bau.fotos ?? []).filter((f) => !(f.positionId && vorbereitet.has(f.positionId)))
  const vorhanden = new Set(bauFotos.map((f) => f.id))
  const fotos: Foto[] = [...bauFotos, ...(gruen.fotos ?? []).filter((f) => !vorhanden.has(f.id))]
  const unterschriften = Object.fromEntries(Object.entries({ bau: bau.unterschriften?.bau, gruen: gruen.unterschriften?.gruen }).filter(([, v]) => v)) as Wep['unterschriften']
  const { skizze } = skizzeZusammen(bau, gruen, jetzt)
  const neu: Wep = { ...bau, formalien: formalien as unknown as Formalien, gruen: gruen.gruen }
  const parzelle = parzelleZusammen(bau, gruen)
  if (parzelle) neu.parzelle = parzelle
  if (skizze) neu.skizze = skizze
  else delete neu.skizze
  if (fotos.length) neu.fotos = fotos
  else delete neu.fotos
  if (unterschriften && Object.keys(unterschriften).length) neu.unterschriften = unterschriften
  else delete neu.unterschriften
  return neu
}
