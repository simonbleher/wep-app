// „Position ändern“ für Außenanlagen und Aufwuchs: das Formular der vorhandenen Position,
// unten „Löschen“ (mit Rückfrage). Eigener Bildschirm wie „Position hinzufügen“.
import type { Position, Wep } from '@/model'
import { ABSCHNITT_TITEL, type Abschnitt } from './katalogDaten'
import { PositionFormular, auswahlFuerPosition } from './PositionFormular'
import { Kopf } from './ui'

export function PositionBearbeiten({
  abschnitt,
  pos,
  wep,
  onAbbrechen,
  onSpeichern,
  onLoeschen,
}: {
  abschnitt: Abschnitt
  pos: Position
  wep: Wep
  onAbbrechen: () => void
  onSpeichern: (pos: Position) => void
  onLoeschen: () => void
}) {
  const titel = ABSCHNITT_TITEL[abschnitt]
  return (
    <div className="hinzufuegen bearbeiten" data-schritt="formular">
      <Kopf
        titel="Position ändern"
        unter={titel}
        links={
          <button type="button" className="textknopf" onClick={onAbbrechen}>
            Abbrechen
          </button>
        }
      />
      <header className="seitenkopf nur-tablet">
        <div>
          <h1 className="h1">Position ändern</h1>
          <p className="neben">{titel}</p>
        </div>
        <button type="button" className="knopf" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </header>
      <div className="split">
        <section className="split-formular" aria-label="Position">
          <PositionFormular
            key={pos.id}
            auswahl={auswahlFuerPosition(pos)}
            wep={wep}
            bearbeiten={pos}
            onFertig={onSpeichern}
            onLoeschen={onLoeschen}
          />
        </section>
      </div>
    </div>
  )
}
