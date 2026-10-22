// Gemeinsame Bausteine der Bau-Reiter (Beta 4, Paket 2): Zahlenfeld mit Einheit, Hinweisliste mit Quelle,
// Rechenweg einer Bewertung.
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Info, TriangleAlert } from 'lucide-react'
import type { BauHinweis, HauptErgebnis } from '@/bau'
import { leseZahl, zahlDe, zahlFuerEingabe } from '@/gruen/format'
import { ICON, euroFormat } from './ui'

/** Zahlenfeld mit deutschem Komma; der getippte Text bleibt lokal („12,“ wird nicht sofort umformatiert). */
export function ZahlFeld({
  label,
  wert,
  onChange,
  einheit,
  hilfe,
  platzhalter,
}: {
  label: string
  wert: number | undefined
  onChange: (v: number | undefined) => void
  einheit?: string
  hilfe?: ReactNode
  platzhalter?: string
}) {
  const id = useId()
  const [text, setText] = useState(wert === undefined ? '' : zahlFuerEingabe(wert))
  useEffect(() => {
    const aktuell = text.trim() === '' ? undefined : leseZahl(text)
    if (aktuell !== wert) setText(wert === undefined ? '' : zahlFuerEingabe(wert))
    // nur auf Änderungen des Werts von außen reagieren
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert])
  return (
    <div className="feld">
      <label className="label" htmlFor={id}>
        {label}
        {einheit ? ` (${einheit})` : ''}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="eingabe"
        value={text}
        placeholder={platzhalter}
        onChange={(e) => {
          setText(e.target.value)
          const n = leseZahl(e.target.value)
          if (e.target.value.trim() === '') onChange(undefined)
          else if (Number.isFinite(n)) onChange(n)
        }}
      />
      {hilfe && <p className="neben">{hilfe}</p>}
    </div>
  )
}

export function TextFeld({
  label,
  wert,
  onChange,
  platzhalter,
  mehrzeilig,
  hilfe,
}: {
  label: string
  wert: string
  onChange: (v: string) => void
  platzhalter?: string
  mehrzeilig?: boolean
  hilfe?: ReactNode
}) {
  const id = useId()
  return (
    <div className="feld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {mehrzeilig ? (
        <textarea id={id} className="eingabe" rows={4} value={wert} placeholder={platzhalter} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" className="eingabe" value={wert} placeholder={platzhalter} onChange={(e) => onChange(e.target.value)} />
      )}
      {hilfe && <p className="neben">{hilfe}</p>}
    </div>
  )
}

export function AuswahlFeld<T extends string | number>({
  label,
  wert,
  optionen,
  onChange,
}: {
  label: string
  wert: T | ''
  optionen: { wert: T; text: string }[]
  onChange: (v: T | undefined) => void
}) {
  const id = useId()
  return (
    <div className="feld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="eingabe"
        value={String(wert)}
        onChange={(e) => onChange(optionen.find((o) => String(o.wert) === e.target.value)?.wert)}
      >
        <option value="">– wählen –</option>
        {optionen.map((o) => (
          <option key={String(o.wert)} value={String(o.wert)}>
            {o.text}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Schalter({ label, an, onChange, hilfe }: { label: string; an: boolean; onChange: (v: boolean) => void; hilfe?: string }) {
  const id = useId()
  return (
    <div>
      <label className="schalter-zeile" htmlFor={id}>
        <span>{label}</span>
        <input id={id} type="checkbox" role="switch" className="schalter" checked={an} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {hilfe && <p className="neben">{hilfe}</p>}
    </div>
  )
}

/** Hinweise des Bau-Teils: Warnungen als roter Streifen, Infos als Nebentext; jeweils mit Quelle (Seite der Richtlinie). */
export function BauHinweise({ hinweise, mitInfo = true }: { hinweise: BauHinweis[]; mitInfo?: boolean }) {
  const warnungen = hinweise.filter((h) => h.schwere === 'warnung')
  const infos = mitInfo ? hinweise.filter((h) => h.schwere === 'info') : []
  if (!warnungen.length && !infos.length) return null
  return (
    <div className="bau-hinweise">
      {warnungen.map((h, i) => (
        <div key={`w${i}`} className="warnung" role="note">
          <TriangleAlert {...ICON} size={20} />
          <div className="warnung-text">
            <span>{h.text}</span>
            {h.regel && <span className="hinweis-quelle">{h.regel}</span>}
          </div>
        </div>
      ))}
      {infos.map((h, i) => (
        <div key={`i${i}`} className="bau-info" role="note">
          <Info {...ICON} size={18} />
          <div>
            <span>{h.text}</span>
            {h.regel && <span className="hinweis-quelle">{h.regel}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

const prozent = (n: number) => `${zahlDe(n)} %`

/** Rechenweg wie in der Vorlage: NHK, Mängelabzug, Altersabzug, Baupreisindex, Fläche, Wert. */
export function Rechenweg({ e }: { e: HauptErgebnis }) {
  const zeilen: [string, string][] = [
    [`NHK 2015${e.bauklasse ? `, Bauklasse ${e.bauklasse}` : ' (Bauklasse fehlt)'}`, `${euroFormat(e.nhk)} je m²`],
    [`abzüglich Mängelabzug ${prozent(e.maengelProzent)}`, `${euroFormat(e.nachMaengeln)} je m²`],
    [
      `abzüglich Altersabzug ${prozent(e.altersabzugProzent)}${e.restnutzungsjahre !== undefined ? ` (Restnutzung ${zahlDe(e.restnutzungsjahre)} Jahre)` : ''}`,
      `${euroFormat(e.nachAlter)} je m²`,
    ],
    [`mal Baupreisindex ${zahlDe(e.indexFaktor * 100, 1)} / 100`, `${euroFormat(e.wertProM2)} je m²`],
    [`mal ${zahlDe(e.flaeche)} m² zulässig überbaute Fläche`, euroFormat(e.wert)],
  ]
  return (
    <dl className="werte rechenweg" aria-label="Rechenweg">
      {zeilen.map(([k, v], i) => (
        <div key={i} className={i === zeilen.length - 1 ? 'rechenweg-summe' : undefined}>
          <dt>{k}</dt>
          <dd className="zahl">{v}</dd>
        </div>
      ))}
      {e.nichtBerechnet > 0 && (
        <div>
          <dt>nicht berechnete Baufläche</dt>
          <dd className="zahl">{zahlDe(e.nichtBerechnet)} m²</dd>
        </div>
      )}
    </dl>
  )
}
