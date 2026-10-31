// Erfassung Außenanlagen / Aufwuchs: Beschreibung, Positionsliste mit Warnungen, Summe.
// Handy zweizeilig, Tablet als Tabelle. Antippen einer Position öffnet das Formular zum
// Ändern (dort auch „Löschen“); Richtlinien-Erläuterungen stehen nur im Formular.
import { useId, useState } from 'react'
import { ChevronRight, Plus, Shovel, Sprout, Fence, TriangleAlert } from 'lucide-react'
import type { Hinweis, Position, Wep } from '@/model'
import { berechneRegelhinweise } from '@/gruen/regelhinweise'
import { berechneAbschnittSumme } from '@/gruen/summen'
import { zahlDe } from '@/gruen/format'
import { ABSCHNITT_TITEL, INVASIVE_ARTEN, KATALOG_POSITIONEN, PROBLEMPFLANZEN, type Abschnitt } from './katalogDaten'
import { ICON, LeerZustand, euroFormat } from './ui'

export function PositionenAbschnitt({
  wep,
  abschnitt,
  onSpeichern,
  onHinzufuegen,
  onBearbeiten,
  onBeseitigung,
}: {
  wep: Wep
  abschnitt: Abschnitt
  onSpeichern: (wep: Wep) => Promise<void>
  onHinzufuegen: () => void
  onBearbeiten: (posId: string) => void
  /** Öffnet die Beseitigung, mit dem Vorschlag aus einem Hinweis vorbelegt. */
  onBeseitigung?: (vorschlag: NonNullable<Hinweis['beseitigung']>) => void
}) {
  const positionen = abschnitt === 'aussenanlagen' ? wep.gruen.aussenanlagen : wep.gruen.aufwuchs
  const titel = ABSCHNITT_TITEL[abschnitt]
  const summe = berechneAbschnittSumme(positionen)
  const beschreibungFeld = abschnitt === 'aussenanlagen' ? 'beschreibungAussen' : 'beschreibungAufwuchs'

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">{titel}</h1>
          <p className="neben">{positionen.length === 1 ? '1 Position' : `${positionen.length} Positionen`}</p>
        </div>
        <button type="button" className="knopf knopf-primaer" onClick={onHinzufuegen}>
          <Plus {...ICON} />
          Hinzufügen
        </button>
      </header>

      <Beschreibung
        wert={wep.gruen[beschreibungFeld]}
        onChange={(v) => void onSpeichern({ ...wep, gruen: { ...wep.gruen, [beschreibungFeld]: v } })}
      />

      {positionen.length === 0 ? (
        <LeerZustand
          icon={abschnitt === 'aufwuchs' ? Sprout : Fence}
          titel="Noch keine Positionen"
          text={
            abschnitt === 'aufwuchs'
              ? 'Bäume, Sträucher, Hecken und Rasen über die Suche im Katalog hinzufügen.'
              : 'Wege, Einfriedung, Beete und mehr über die Suche im Katalog hinzufügen.'
          }
        />
      ) : (
      <div className="tabelle" role="table" aria-label={`Positionen ${titel}`}>
        <div className="pos pos-kopf nur-tablet" role="row">
          <span role="columnheader" className="zahl">Anzahl</span>
          <span role="columnheader">Einheit</span>
          <span role="columnheader">Bezeichnung</span>
          <span role="columnheader">Zustand</span>
          <span role="columnheader" className="zahl">Einzelpreis</span>
          <span role="columnheader" className="zahl">Summe</span>
        </div>
        {positionen.map((pos) => (
          <PositionZeile key={pos.id} pos={pos} wep={wep} onOeffnen={() => onBearbeiten(pos.id)} onBeseitigung={onBeseitigung} />
        ))}
        <div className="summe" role="row">
          <span role="cell">Summe {titel}</span>
          <span role="cell" className="zahl">{euroFormat(summe)}</span>
        </div>
      </div>
      )}

      <button type="button" className="zeile zeile-akzent" onClick={onHinzufuegen}>
        <Plus {...ICON} />
        <span className="zeile-titel">Position hinzufügen</span>
      </button>
    </>
  )
}

/** Beschreibung des Abschnitts: als Zeile, zum Bearbeiten aufklappbar. */
function Beschreibung({ wert, onChange }: { wert: string; onChange: (v: string) => void }) {
  const id = useId()
  const [offen, setOffen] = useState(false)

  if (offen) {
    return (
      <div className="beschreibung">
        <div className="beschreibung-kopf">
          <label className="label" htmlFor={id}>
            Beschreibung (optional)
          </label>
          <button type="button" className="textknopf" onClick={() => setOffen(false)}>
            Fertig
          </button>
        </div>
        <textarea id={id} className="eingabe" rows={3} value={wert} autoFocus onChange={(e) => onChange(e.target.value)} />
      </div>
    )
  }

  return (
    <button type="button" className="zeile feldzeile" onClick={() => setOffen(true)}>
      <span className="zeile-text">
        <span className="zeile-titel">Beschreibung</span>
        <span className={wert.trim() ? 'neben einzeilig' : 'neben leer'}>{wert.trim() || 'optional'}</span>
      </span>
      <ChevronRight {...ICON} className="chevron" />
    </button>
  )
}

function PositionZeile({
  pos,
  wep,
  onOeffnen,
  onBeseitigung,
}: {
  pos: Position
  wep: Wep
  onOeffnen: () => void
  onBeseitigung?: (vorschlag: NonNullable<Hinweis['beseitigung']>) => void
}) {
  const hinweise = berechneRegelhinweise(pos, wep, KATALOG_POSITIONEN, INVASIVE_ARTEN, PROBLEMPFLANZEN)
  const neben = [`${zahlDe(pos.anzahl)} ${pos.einheit}`, pos.zustand, `je ${euroFormat(pos.einzelpreis)}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="pos-gruppe" role="rowgroup">
      <button type="button" className="pos" role="row" onClick={onOeffnen}>
        <span role="cell" className="zahl c-anzahl">{zahlDe(pos.anzahl)}</span>
        <span role="cell" className="c-einheit">{pos.einheit}</span>
        <span role="cell" className="c-bez">
          {pos.bezeichnung}
          <span className="c-neben nur-handy">
            {neben}
            {pos.preisManuell ? ' · manuell' : ''}
          </span>
        </span>
        <span role="cell" className="c-zustand">{pos.zustand ?? ''}</span>
        <span role="cell" className="zahl c-preis">
          {euroFormat(pos.einzelpreis)}
          {pos.preisManuell && <span className="c-manuell">manuell</span>}
        </span>
        <span role="cell" className="zahl c-summe">{euroFormat(pos.anzahl * pos.einzelpreis)}</span>
      </button>
      <WarnListe hinweise={hinweise} onBeseitigung={onBeseitigung} />
    </div>
  )
}

/**
 * Warnungen einer Position (Regelverstöße). Reine Richtlinien-Erläuterungen
 * (Schwere „info“) stehen nicht in der Liste, sondern im Formular unter „Richtlinie“.
 */
export function WarnListe({
  hinweise,
  onBeseitigung,
}: {
  hinweise: Hinweis[]
  /** Fehlt sie, gibt es keinen Knopf „Zur Beseitigung“ (z. B. im Formular, wo noch nichts gespeichert ist). */
  onBeseitigung?: (vorschlag: NonNullable<Hinweis['beseitigung']>) => void
}) {
  return (
    <>
      {hinweise
        .filter((h) => h.schwere === 'warnung')
        .map((h, i) => (
          <div key={i} className="warnung" role="note">
            <TriangleAlert {...ICON} size={20} />
            <span>{h.text}</span>
            {h.beseitigung && onBeseitigung && (
              <button type="button" className="textknopf" onClick={() => onBeseitigung(h.beseitigung!)}>
                <Shovel {...ICON} size={18} />
                {h.beseitigung.baum ? 'Baum fällen erfassen' : 'Zur Beseitigung'}
              </button>
            )}
          </div>
        ))}
    </>
  )
}
