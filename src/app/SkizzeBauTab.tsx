// Reiter „Skizze Bau“ (Beta 4, Paket 3): Grundriss mit echten Maßen, Maßketten, Bauteil-Kürzel und Massenberechnung.
//
// Wie `SkizzeTab` bekommt der Editor seinen Startwert nur einmal; gespeichert wird entprellt und beim Verlassen sofort.
// Mit jedem Speichern fließen Fläche, Maße, Höhe und Kubatur der verknüpften Teile in die Bauteile (`uebernehmeGrundriss`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { Bauteil, BauteilArt, GrundrissDaten, Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import { uebernehmeGrundriss } from '@/bau'
import { GrundrissEditor } from '@/skizze/GrundrissEditor'
import { dachformText, leererGrundriss, massenberechnung, meterText, zahl2Text } from '@/skizze/grundriss'
import { ICON } from './ui'
import { aendereBauTeil, ersetzeBauteil, neuesBauteil } from './bauHelfer'
import { entprelle } from './entprellen'

const SPEICHER_VERZOEGERUNG_MS = 400

export function SkizzeBauTab({ wep, aendere }: { wep: Wep; aendere: WepAendern }) {
  const [startwert] = useState<GrundrissDaten>(() => wep.grundriss ?? leererGrundriss())
  const [aktuell, setAktuell] = useState<GrundrissDaten>(startwert)
  const bauteile = useMemo(() => wep.bau?.bauteile ?? [], [wep.bau?.bauteile])
  // Bauteile, die der Editor gerade angelegt hat und die das WEP noch nicht zeigt
  const bauteileRef = useRef<Bauteil[]>(bauteile)
  bauteileRef.current = bauteile
  const aendereRef = useRef(aendere)
  aendereRef.current = aendere

  const speichere = useMemo(
    () =>
      entprelle((grundriss: GrundrissDaten) => {
        void aendereRef.current((w) => uebernehmeGrundriss({ ...w, grundriss }, grundriss))
      }, SPEICHER_VERZOEGERUNG_MS),
    [],
  )
  useEffect(() => () => speichere.sofort(), [speichere])

  const beiAenderung = useCallback(
    (g: GrundrissDaten) => {
      setAktuell(g)
      speichere(g)
    },
    [speichere],
  )

  const neuesBauteilAnlegen = useCallback((art: BauteilArt): Bauteil => {
    const b = neuesBauteil(art, bauteileRef.current)
    bauteileRef.current = [...bauteileRef.current, b]
    void aendereRef.current((w) => aendereBauTeil(w, (bau) => ersetzeBauteil(bau, b)))
    return b
  }, [])

  const anzahl = aktuell.teile.length
  return (
    <section className="skizze-tab skizze-bau-tab">
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Skizze Bau</h1>
          <p className="neben">Grundriss mit Maßen</p>
        </div>
      </header>
      <p className="neben">
        Rechteck oder Vieleck zeichnen, eine Kante antippen und die Länge eintippen – die Form passt sich an. Die Fläche der Bauteile (L, A1, S, Ü1 …) und die Kubatur gehen in die Bewertung ein;
        der Export schreibt alles als bearbeitbare Formen ins Blatt „Skizze Bau“.
        {anzahl > 0 && ` · ${anzahl} ${anzahl === 1 ? 'Teil' : 'Teile'}`}
      </p>
      <GrundrissEditor wert={startwert} bauteile={bauteile} onAenderung={beiAenderung} onNeuesBauteil={neuesBauteilAnlegen} />
      <Massenberechnung daten={aktuell} bauteile={bauteile} />
    </section>
  )
}

/** Massenberechnung: Fläche und Kubatur je Teil nach Dachform (Richtlinie S. 4 Nr. 9: Baulichkeiten auch in der Kubatur darstellen). */
export function Massenberechnung({ daten, bauteile }: { daten: GrundrissDaten; bauteile: ReadonlyArray<Bauteil> }) {
  const b = massenberechnung(daten, bauteile)
  if (!b.zeilen.length) return null
  const hinweise = b.zeilen.flatMap((z) => z.hinweise.map((h) => `${z.kuerzel}: ${h}`))
  return (
    <section className="abschnitt massen" aria-labelledby="massen-titel" data-testid="massenberechnung">
      <h2 className="gruppenkopf" id="massen-titel">
        Massenberechnung
      </h2>
      <div className="massen-scroll">
        <table className="massen-tabelle">
          <thead>
            <tr>
              <th scope="col">Teil</th>
              <th scope="col">Maße</th>
              <th scope="col">Fläche</th>
              <th scope="col">Dach · Höhe</th>
              <th scope="col">Kubatur</th>
            </tr>
          </thead>
          <tbody>
            {b.zeilen.map((z) => (
              <tr key={z.teil.id} data-teil={z.kuerzel}>
                <th scope="row">{z.kuerzel}</th>
                <td>{z.masseText}</td>
                <td>{zahl2Text(z.flaeche)} m²</td>
                <td>
                  {z.hoehe === undefined
                    ? '–'
                    : `${dachformText(z.dachform)} · ${meterText(z.hoehe)}${z.dachform !== 'flach' && z.hoeheOben !== undefined ? ` / ${meterText(z.hoeheOben)}` : ''}`}
                </td>
                <td>{z.kubaturM3 !== undefined ? `${zahl2Text(z.kubaturM3)} m³` : '–'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Summe
              </th>
              <td>{zahl2Text(b.flaecheSumme)} m²</td>
              <td />
              <td>{b.kubaturSumme > 0 ? `${zahl2Text(b.kubaturSumme)} m³` : '–'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="neben">
        Fläche nach Außenmaßen (Richtlinie S. 3 Nr. 2), Kubatur = Fläche × mittlere Höhe: Flachdach Fläche × Höhe, Pultdach Fläche × Mittel der beiden Wände, Satteldach Fläche × Traufhöhe plus Dachraum.
      </p>
      {hinweise.length > 0 && (
        <div className="warnung" role="note">
          <TriangleAlert {...ICON} />
          <ul className="meldung-liste">
            {hinweise.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
