// Sicherung einspielen: führt aus, was in der Vorschau gewählt wurde. Nichts wird ohne Auswahl überschrieben.
import { naechsteVorgangsNr, type Foto, type Wep } from '@/model'
import type { EigenePosition } from '@/katalog'
import type { GeleseneSicherung } from './lesen'
import type { SicherungsQuelle, SicherungsZiel } from './types'
import type { Entscheidungen, Vorschau } from './vorschau'

export interface EinspielErgebnis {
  /** Vorgangs-Nr. aller angelegten oder ersetzten WEPs; `von` nur, wenn eine neue Nummer vergeben wurde. */
  weps: { id: string; von?: string; ersetzt: boolean }[]
  papierkorb: number
  eigene: number
  profil: boolean
  fotos: number
  /** Fotos, die laut WEP dazugehören, aber nicht in der Sicherung lagen. */
  fotosFehlen: number
  bauExcel: number
  fehler: string[]
}

function jahrVon(id: string): number | undefined {
  const j = Number.parseInt(id.slice(0, 4), 10)
  return Number.isFinite(j) ? j : undefined
}

/** Legt eine Kopie unter neuer Nummer an (Vorgangs-Nr. in den Formalien mit ändern). */
function alsKopie(wep: Wep, id: string): Wep {
  return { ...wep, id, formalien: { ...wep.formalien, vorgangsNr: id } }
}

export async function spieleEin(opt: {
  sicherung: GeleseneSicherung
  vorschau: Vorschau
  wahl: Entscheidungen
  lokal: SicherungsQuelle
  ziel: SicherungsZiel
  jetzt?: () => string
}): Promise<EinspielErgebnis> {
  const { sicherung: s, vorschau: v, wahl, lokal, ziel } = opt
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const e: EinspielErgebnis = { weps: [], papierkorb: 0, eigene: 0, profil: false, fotos: 0, fotosFehlen: 0, bauExcel: 0, fehler: [] }

  // Neue Nummern dürfen weder lokal noch in der Sicherung vorkommen (auch nicht im Papierkorb)
  const belegt = new Set([
    ...(await ziel.belegteNummern()).map((n) => n.id),
    ...s.daten.weps.map((w) => w.wep.id),
    ...s.daten.papierkorb.map((k) => k.id),
  ])
  const neueNummer = (alt: string): string => {
    const id = naechsteVorgangsNr([...belegt].map((x) => ({ id: x })), jahrVon(alt))
    belegt.add(id)
    return id
  }

  async function dateien(wep: Wep, quellId: string, zielId: string): Promise<void> {
    for (const foto of wep.fotos ?? []) {
      const bytes = await s.foto(quellId, foto.id)
      if (!bytes) {
        e.fotosFehlen++
        continue
      }
      await ziel.speichereFoto(zielId, foto as Foto, bytes)
      e.fotos++
    }
    if (wep.bauExcel) {
      const bytes = await s.bauExcel(quellId)
      if (bytes) {
        await ziel.speichereBauExcel(zielId, wep, bytes)
        e.bauExcel++
      }
    }
  }

  for (const sw of s.daten.weps) {
    const w = wahl[`wep:${sw.wep.id}`]
    if (w !== 'uebernehmen' && w !== 'kopie') continue
    // Nur ausführen, was die Vorschau anbietet
    const punkt = v.weps.find((p) => p.schluessel === `wep:${sw.wep.id}`)
    if (!punkt || !punkt.optionen.includes(w)) continue
    try {
      const kopie = w === 'kopie'
      const id = kopie ? neueNummer(sw.wep.id) : sw.wep.id
      const wep = kopie ? alsKopie(sw.wep, id) : sw.wep
      await dateien(wep, sw.wep.id, id)
      await ziel.speichereWep(wep)
      e.weps.push({ id, von: kopie ? sw.wep.id : undefined, ersetzt: punkt.status === 'anders' && !kopie })
    } catch (err) {
      e.fehler.push(`${sw.wep.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  for (const k of s.daten.papierkorb) {
    const punkt = v.papierkorb.find((p) => p.schluessel === `korb:${k.id}`)
    if (wahl[`korb:${k.id}`] !== 'uebernehmen' || !punkt?.optionen.includes('uebernehmen')) continue
    try {
      await dateien(k.wep, k.id, k.id)
      await ziel.legeInPapierkorb(k)
      e.papierkorb++
    } catch (err) {
      e.fehler.push(`Papierkorb ${k.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Eigene Positionen: gewählte Einträge einfügen bzw. ersetzen; ersetzte gelten ab jetzt (der Abgleich
  // lässt je Eintrag die neuere Änderung gewinnen, sonst würde ein anderes Gerät die Wahl rückgängig machen)
  const lokalEigene = await lokal.eigenePositionen()
  const ergebnis: EigenePosition[] = [...lokalEigene]
  let eigeneGeaendert = 0
  for (const se of s.daten.eigenePositionen) {
    const punkt = v.eigene.find((p) => p.schluessel === `eigen:${se.id}`)
    if (wahl[`eigen:${se.id}`] !== 'uebernehmen' || !punkt?.optionen.includes('uebernehmen')) continue
    const neu = { ...se, geaendertAm: jetzt() }
    const i = ergebnis.findIndex((x) => x.id === se.id)
    if (i >= 0) ergebnis[i] = neu
    else ergebnis.push(neu)
    eigeneGeaendert++
  }
  if (eigeneGeaendert > 0) {
    try {
      await ziel.setzeEigenePositionen(ergebnis)
      e.eigene = eigeneGeaendert
    } catch (err) {
      e.fehler.push(`Eigene Positionen: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const profilPunkt = v.profil
  if (profilPunkt && wahl.profil === 'uebernehmen' && profilPunkt.optionen.includes('uebernehmen')) {
    try {
      await ziel.setzeProfil(s.daten.profil.profil)
      e.profil = true
    } catch (err) {
      e.fehler.push(`Profil: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return e
}
