// Skizze-Tab: bindet den SkizzeEditor (src/skizze) in die Erfassung ein.
//
// Der Editor bekommt seinen Startwert nur einmal beim Öffnen des Tabs. Würden
// wir ihm nach jedem Speichern den neuen Wert geben, setzt er sich zurück
// (Auswahl weg). Gespeichert wird entprellt; beim Verlassen des Tabs sofort.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Wep, SkizzeDaten } from '@/model'
import { SkizzeEditor } from '@/skizze/SkizzeEditor'
import { SkizzeChat } from '@/skizze/SkizzeChat'
import { leereSkizze } from '@/skizze/types'
import { KI_AKTIV } from '@/funktionen'
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
  // Wert für den Editor: ändert sich nur durch den Chat (sonst setzt sich der Editor zurück)
  const [editorWert, setEditorWert] = useState<SkizzeDaten>(startwert)
  const aktuellRef = useRef<SkizzeDaten>(startwert)

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

  const beiEditorAenderung = useCallback(
    (skizze: SkizzeDaten) => {
      aktuellRef.current = skizze
      speichereSkizze(skizze)
    },
    [speichereSkizze],
  )
  const beiChatAenderung = useCallback(
    (skizze: SkizzeDaten) => {
      aktuellRef.current = skizze
      setEditorWert(skizze)
      speichereSkizze(skizze)
    },
    [speichereSkizze],
  )
  const holeSkizze = useCallback(() => aktuellRef.current, [])

  const anzahl = wep.skizze?.elemente.length ?? 0

  return (
    <section className="formular skizze-tab">
      <h2 className="abschnitt-titel">Skizze Außenanlagen &amp; Aufwuchs</h2>
      <p className="hinweis-klein">
        Rechteck, Linie, Kreis, Text, Maßangabe und Symbole (Baum, Beet, Hecke …){KI_AKTIV && ' – oder per Beschreibung im Chat darunter'}. Die Skizze wird beim
        Excel-Export ins Blatt „Skizze Außenanlage-Aufwuchs“ eingefügt.
        {anzahl > 0 && ` · ${anzahl} ${anzahl === 1 ? 'Element' : 'Elemente'} gespeichert`}
      </p>
      <SkizzeEditor wert={editorWert} onAenderung={beiEditorAenderung} />
      {KI_AKTIV && <SkizzeChat holeSkizze={holeSkizze} onSkizze={beiChatAenderung} />}
    </section>
  )
}
