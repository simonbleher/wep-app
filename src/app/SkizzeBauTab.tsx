// Reiter „Skizze Bau“ (Beta 4, Paket 3): Grundriss mit echten Maßen, Maßketten, Bauteil-Kürzel und Massenberechnung.
//
// Wie `SkizzeTab` bekommt der Editor seinen Startwert nur einmal; gespeichert wird entprellt und beim Verlassen sofort.
// Mit jedem Speichern fließen Fläche, Maße, Höhe und Kubatur der verknüpften Teile in die Bauteile (`uebernehmeGrundriss`).
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, TriangleAlert } from 'lucide-react'
import type { Bauteil, BauteilArt, GrundrissDaten, Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import { uebernehmeGrundriss } from '@/bau'
import { lageVon, schiebeGrundrissInParzelle, setzeParzelle, type Parzelle } from '@/parzelle'
import { GrundrissEditor } from '@/skizze/GrundrissEditor'
import { baueModell3D, ART_TEXT_3D } from '@/skizze/modell3d'
import { dachformText, leererGrundriss, massenberechnung, meterText, zahl2Text } from '@/skizze/grundriss'
import { ICON } from './ui'
import { aendereBauTeil, ersetzeBauteil, neuesBauteil } from './bauHelfer'
import { entprelle } from './entprellen'
import { AusserhalbHinweis, ParzelleBereich } from './ParzelleBereich'

const SPEICHER_VERZOEGERUNG_MS = 400

// three.js steckt nur in diesem Teil; er wird erst beim Antippen von „3D-Ansicht zeigen“ geladen (und liegt für offline im Zwischenspeicher).
const Ansicht3D = lazy(() => import('@/skizze/Ansicht3D'))

export function SkizzeBauTab({ wep, aendere }: { wep: Wep; aendere: WepAendern }) {
  const [startwert] = useState<GrundrissDaten>(() => wep.grundriss ?? leererGrundriss())
  const [aktuell, setAktuell] = useState<GrundrissDaten>(startwert)
  const bauteile = useMemo(() => wep.bau?.bauteile ?? [], [wep.bau?.bauteile])
  // Bauteile, die der Editor gerade angelegt hat und die das WEP noch nicht zeigt
  const bauteileRef = useRef<Bauteil[]>(bauteile)
  bauteileRef.current = bauteile
  const aendereRef = useRef(aendere)
  aendereRef.current = aendere
  const wepRef = useRef(wep)
  wepRef.current = wep
  const aktuellRef = useRef<GrundrissDaten>(startwert)

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
      aktuellRef.current = g
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

  const lage = lageVon(wep)
  // Ändert sich die Parzelle oder wird der Grundriss verschoben, startet der Editor neu (er nimmt seinen Startwert nur beim Anlegen)
  const [neuStand, setNeuStand] = useState(0)
  const editorKey = lage ? `${lage.abb.pxProM.toFixed(5)}-${lage.breiteM}-${lage.hoeheM}-${neuStand}` : `frei-${neuStand}`

  /** Parzelle setzen: offene Änderungen am Grundriss zuerst speichern, damit nichts Älteres zurückgeschrieben wird. */
  const uebernehmeParzelle = useCallback(
    async (p: Parzelle | undefined) => {
      speichere.sofort()
      await aendereRef.current((w) => setzeParzelle(w, p))
      setNeuStand((n) => n + 1)
    },
    [speichere],
  )
  const schiebeGrundriss = useCallback(async () => {
    const l = lageVon(wepRef.current)
    if (!l) return
    speichere.sofort()
    const verschoben = schiebeGrundrissInParzelle(aktuellRef.current, l)
    setAktuell(verschoben)
    aktuellRef.current = verschoben
    await aendereRef.current((w) => uebernehmeGrundriss({ ...w, grundriss: verschoben }, verschoben))
    setNeuStand((n) => n + 1)
  }, [speichere])

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
      <ParzelleBereich
        wep={wep}
        teil="bau"
        onUebernehmen={uebernehmeParzelle}
        extra={<AusserhalbHinweis wep={{ ...wep, grundriss: aktuell }} onSchieben={() => void schiebeGrundriss()} />}
      />
      <GrundrissEditor key={editorKey} wert={aktuell} bauteile={bauteile} onAenderung={beiAenderung} onNeuesBauteil={neuesBauteilAnlegen} parzelle={lage} />
      <Massenberechnung daten={aktuell} bauteile={bauteile} />
      <Bereich3D daten={aktuell} bauteile={bauteile} />
    </section>
  )
}

/** 3D-Ansicht der Bauteile aus dem Grundriss (nur Ansicht, Beta 4 Paket 5); three.js wird erst nach dem Antippen geladen. */
export function Bereich3D({ daten, bauteile }: { daten: GrundrissDaten; bauteile: ReadonlyArray<Bauteil> }) {
  const [offen, setOffen] = useState(false)
  const modell = useMemo(() => baueModell3D(daten, bauteile), [daten, bauteile])
  if (!modell.teile.length) return null
  const arten = [...new Map(modell.teile.map((t) => [t.art, t])).values()]
  return (
    <section className="abschnitt ansicht3d-bereich" aria-labelledby="ansicht3d-titel" data-testid="bereich3d">
      <h2 className="gruppenkopf" id="ansicht3d-titel">
        3D-Ansicht
      </h2>
      {!offen ? (
        <>
          <p className="neben">Die Laube und die übrigen Bauteile als Modell aus Grundriss, Höhen und Dachform – nur zum Ansehen, drehbar und zoombar.</p>
          <button type="button" className="knopf" onClick={() => setOffen(true)}>
            <Box {...ICON} /> 3D-Ansicht zeigen
          </button>
        </>
      ) : (
        <>
          <Suspense fallback={<p className="neben" role="status">3D-Ansicht wird geladen …</p>}>
            <Ansicht3D modell={modell} />
          </Suspense>
          <ul className="ansicht3d-legende" aria-label="Farben der Bauteile">
            {arten.map((t) => (
              <li key={t.art}>
                <span className="ansicht3d-farbe" style={{ background: t.farben.dach }} aria-hidden="true" />
                {ART_TEXT_3D[t.art]} ({modell.teile.filter((x) => x.art === t.art).map((x) => x.kuerzel).join(', ')})
              </li>
            ))}
          </ul>
          <p className="neben">Mit einem Finger oder der Maus drehen, mit zwei Fingern oder dem Mausrad zoomen. Nur Ansicht – ohne Einfluss auf Bewertung und Export.</p>
          {modell.hinweise.length > 0 && (
            <div className="warnung" role="note">
              <TriangleAlert {...ICON} />
              <ul className="meldung-liste">
                {modell.hinweise.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
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
        Fläche nach Außenmaßen (Richtlinie S. 3 Nr. 2), Kubatur = Fläche × mittlere Höhe: Flachdach Fläche × Höhe, Pultdach Fläche × Mittel der beiden Wände, Satteldach Fläche × Traufhöhe plus Dachraum; Walm-, Zelt-, Krüppelwalm- und Mansarddach rechnen den Dachraum nach ihrer Form (Formeln in der Hilfe der Dachform).
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
