// Erfassung Außenanlagen / Aufwuchs: Beschreibung, Positionsliste mit Warnungen
// und eingeklappten Richtlinien-Hinweisen, Summe. Handy zweizeilig, Tablet als Tabelle.
// Antippen einer Position zeigt ihre Aktionen (Löschen).
import { useId, useState } from 'react'
import { ChevronRight, Info, Plus, Trash2, TriangleAlert } from 'lucide-react'
import type { Hinweis, Position, Wep } from '@/model'
import { berechneRegelhinweise } from '@/gruen/regelhinweise'
import { berechneAbschnittSumme } from '@/gruen/summen'
import { zahlDe } from '@/gruen/format'
import { ABSCHNITT_TITEL, INVASIVE_ARTEN, KATALOG_POSITIONEN, type Abschnitt } from './katalogDaten'
import { ICON, euroFormat } from './ui'

export function PositionenAbschnitt({
  wep,
  abschnitt,
  onSpeichern,
  onHinzufuegen,
}: {
  wep: Wep
  abschnitt: Abschnitt
  onSpeichern: (wep: Wep) => Promise<void>
  onHinzufuegen: () => void
}) {
  const positionen = abschnitt === 'aussenanlagen' ? wep.gruen.aussenanlagen : wep.gruen.aufwuchs
  const titel = ABSCHNITT_TITEL[abschnitt]
  const summe = berechneAbschnittSumme(positionen)
  const [offenId, setOffenId] = useState<string | null>(null)

  function loeschePosition(posId: string) {
    const neu = positionen.filter((p) => p.id !== posId)
    void onSpeichern({ ...wep, gruen: { ...wep.gruen, [abschnitt]: neu } })
    setOffenId(null)
  }

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

      <div className="tabelle" role="table" aria-label={`Positionen ${titel}`}>
        <div className="pos pos-kopf nur-tablet" role="row">
          <span role="columnheader" className="zahl">Anzahl</span>
          <span role="columnheader">Einheit</span>
          <span role="columnheader">Bezeichnung</span>
          <span role="columnheader">Zustand</span>
          <span role="columnheader" className="zahl">Einzelpreis</span>
          <span role="columnheader" className="zahl">Summe</span>
        </div>
        {positionen.length === 0 && <p className="leertext">Noch keine Positionen.</p>}
        {positionen.map((pos) => (
          <PositionZeile
            key={pos.id}
            pos={pos}
            wep={wep}
            offen={offenId === pos.id}
            onUmschalten={() => setOffenId(offenId === pos.id ? null : pos.id)}
            onLoeschen={() => loeschePosition(pos.id)}
          />
        ))}
        <div className="summe" role="row">
          <span role="cell">Summe {titel}</span>
          <span role="cell" className="zahl">{euroFormat(summe)}</span>
        </div>
      </div>

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
  offen,
  onUmschalten,
  onLoeschen,
}: {
  pos: Position
  wep: Wep
  offen: boolean
  onUmschalten: () => void
  onLoeschen: () => void
}) {
  const hinweise = berechneRegelhinweise(pos, wep, KATALOG_POSITIONEN, INVASIVE_ARTEN)
  const neben = [`${zahlDe(pos.anzahl)} ${pos.einheit}`, pos.zustand, `je ${euroFormat(pos.einzelpreis)}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="pos-gruppe" role="rowgroup">
      <button type="button" className="pos" role="row" aria-expanded={offen} onClick={onUmschalten}>
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
      {offen && (
        <div className="pos-aktionen">
          <button type="button" className="knopf" aria-label={`Position ${pos.bezeichnung} löschen`} onClick={onLoeschen}>
            <Trash2 {...ICON} />
            Löschen
          </button>
        </div>
      )}
      <HinweisListe hinweise={hinweise} />
    </div>
  )
}

/**
 * Regelhinweise: Warnungen immer sichtbar, reine Info-Texte (Richtlinien-
 * Erläuterungen) eingeklappt, damit die Positionsliste übersichtlich bleibt.
 */
export function HinweisListe({ hinweise }: { hinweise: Hinweis[] }) {
  const warnungen = hinweise.filter((h) => h.schwere === 'warnung')
  const infos = hinweise.filter((h) => h.schwere !== 'warnung')
  return (
    <>
      {warnungen.map((h, i) => (
        <p key={`w${i}`} className="warnung" role="note">
          <TriangleAlert {...ICON} size={20} />
          <span>{h.text}</span>
        </p>
      ))}
      {infos.length > 0 && (
        <details className="hinweise">
          <summary>
            <ChevronRight {...ICON} size={18} className="chevron-auf" />
            {infos.length === 1 ? '1 Hinweis' : `${infos.length} Hinweise`} zur Richtlinie
          </summary>
          {infos.map((h, i) => (
            <p key={`i${i}`} className="info">
              <Info {...ICON} size={18} />
              <span>{h.text}</span>
            </p>
          ))}
        </details>
      )}
    </>
  )
}
