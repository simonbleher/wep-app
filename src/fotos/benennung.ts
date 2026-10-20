// Positionsnummern und Dateinamen der Fotos beim Excel-Export.
//
// Positionsnummer = laufende Nummer im WEP in der Reihenfolge der Erfassung: erst alle Außenanlagen,
// dann Aufwuchs, dann Beseitigung (Nr. 1, 2, 3 …). Fotos zum WEP allgemein bekommen die Nummer 00.
// Beispiele: „03 Apfelbaum.jpg“, „03 Apfelbaum 2.jpg“, „00 Gesamtansicht 1.jpg“.
import type { Foto, Wep } from '@/model'

export interface PositionsEintrag {
  nr: number
  id: string
  name: string
  abschnitt: 'aussenanlagen' | 'aufwuchs' | 'beseitigung'
}

/** Alle Positionen des WEP mit ihrer laufenden Nummer. */
export function positionsListe(wep: Wep): PositionsEintrag[] {
  const liste: PositionsEintrag[] = []
  let nr = 0
  for (const p of wep.gruen.aussenanlagen) liste.push({ nr: ++nr, id: p.id, name: p.bezeichnung, abschnitt: 'aussenanlagen' })
  for (const p of wep.gruen.aufwuchs) liste.push({ nr: ++nr, id: p.id, name: p.bezeichnung, abschnitt: 'aufwuchs' })
  for (const p of wep.gruen.beseitigungAA) liste.push({ nr: ++nr, id: p.id, name: p.gegenstand, abschnitt: 'beseitigung' })
  return liste
}

/** Macht aus einem Text einen Dateinamen (ohne Pfadzeichen und Sonderzeichen von Windows/OneDrive). */
export function dateiNamenTeil(text: string, maxLaenge = 50): string {
  const sauber = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLaenge)
    .replace(/[. ]+$/g, '')
  return sauber || 'Position'
}

export interface FotoDateiName {
  foto: Foto
  name: string
  /** 0 = WEP allgemein, sonst die Positionsnummer. */
  nr: number
}

/** Die Dateinamen für alle Fotos eines WEP (eindeutig, in Reihenfolge der Aufnahme je Gruppe). */
export function fotoDateiNamen(wep: Wep): FotoDateiName[] {
  const positionen = positionsListe(wep)
  const nachId = new Map(positionen.map((p) => [p.id, p]))
  const stellen = Math.max(2, String(positionen.length).length)
  const gruppen = new Map<number, Foto[]>()
  for (const f of wep.fotos ?? []) {
    const nr = f.positionId ? (nachId.get(f.positionId)?.nr ?? 0) : 0
    gruppen.set(nr, [...(gruppen.get(nr) ?? []), f])
  }
  const ergebnis: FotoDateiName[] = []
  for (const [nr, fotos] of [...gruppen.entries()].sort((a, b) => a[0] - b[0])) {
    const eintrag = positionen.find((p) => p.nr === nr)
    const basis = `${String(nr).padStart(stellen, '0')} ${nr === 0 ? 'Gesamtansicht' : dateiNamenTeil(eintrag?.name ?? '')}`
    fotos
      .sort((a, b) => a.aufgenommenAm.localeCompare(b.aufgenommenAm))
      .forEach((foto, i) => {
        // Gesamtansicht immer nummeriert, sonst nur bei mehreren Fotos zur selben Position
        const nummer = nr === 0 || fotos.length > 1 ? ` ${i + 1}` : ''
        ergebnis.push({ foto, nr, name: `${basis}${nummer}.jpg` })
      })
  }
  return ergebnis
}
