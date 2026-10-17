// Skizze-Tab: bindet den SkizzeEditor (src/skizze) in die Erfassung ein.
//
// Der Editor bekommt seinen Startwert nur einmal beim Öffnen des Tabs. Würden
// wir ihm nach jedem Speichern den neuen Wert geben, setzt er sich zurück
// (Auswahl weg). Gespeichert wird entprellt; beim Verlassen des Tabs sofort.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Wep, SkizzeDaten } from '@/model'
import { SkizzeEditor } from '@/skizze/SkizzeEditor'
import { leereSkizze } from '@/skizze/types'
import { entprelle } from './entprellen'

const SPEICHER_VERZOEGERUNG_MS = 400

export function SkizzeTab({
  wep,
  onSpeichern,
}: {
  wep: Wep
  onSpeichern: (wep: Wep) => Promise<void>
}) {
  const [startwert] = useState<SkizzeDaten>(() => wep.skizze ?? leereSkizze())

  // Immer den aktuellen WEP verwenden, damit nichts Älteres zurückgeschrieben wird
  const wepRef = useRef(wep)
  wepRef.current = wep
  const speichernRef = useRef(onSpeichern)
  speichernRef.current = onSpeichern

  const speichereSkizze = useMemo(
    () =>
      entprelle((skizze: SkizzeDaten) => {
        void speichernRef.current({ ...wepRef.current, skizze })
      }, SPEICHER_VERZOEGERUNG_MS),
    [],
  )

  // Beim Verlassen des Tabs Ausstehendes sofort speichern
  useEffect(() => () => speichereSkizze.sofort(), [speichereSkizze])

  const anzahl = wep.skizze?.elemente.length ?? 0

  return (
    <section className="formular skizze-tab">
      <h2 className="abschnitt-titel">Skizze Außenanlagen &amp; Aufwuchs</h2>
      <p className="hinweis-klein">
        Rechteck, Linie, Kreis (Baum), Text und Maßangabe. Die Skizze wird beim
        Excel-Export ins Blatt „Skizze Außenanlage-Aufwuchs“ eingefügt.
        {anzahl > 0 && ` · ${anzahl} ${anzahl === 1 ? 'Element' : 'Elemente'} gespeichert`}
      </p>
      <SkizzeEditor wert={startwert} onAenderung={speichereSkizze} />
    </section>
  )
}
