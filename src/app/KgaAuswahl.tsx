import { useId, useState } from 'react'
import { KGA_LISTE, findeKga } from '@/kga'

const ANDERE = '__andere__'

/** Kleingartenanlage: Auswahl aus der Liste des Bezirksverbands, „Andere …“ für eine eigene Eingabe (nichts gesperrt). */
export function KgaAuswahl({ label, wert, onChange }: { label: string; wert: string; onChange: (v: string) => void }) {
  const id = useId()
  const inListe = findeKga(wert)
  // Eine eigene Eingabe (oder ein Wert, der nicht in der Liste steht) bleibt sichtbar und änderbar
  const [eigen, setEigen] = useState(() => wert.trim() !== '' && !inListe)
  const zeigeEigen = eigen || (wert.trim() !== '' && !inListe)
  return (
    <div className="feld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="eingabe"
        value={zeigeEigen ? ANDERE : (inListe ?? '')}
        onChange={(e) => {
          const v = e.target.value
          if (v === ANDERE) {
            setEigen(true)
            if (inListe) onChange('')
          } else {
            setEigen(false)
            onChange(v)
          }
        }}
      >
        <option value="">– bitte wählen –</option>
        {KGA_LISTE.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
        <option value={ANDERE}>Andere …</option>
      </select>
      {zeigeEigen && (
        <input
          type="text"
          className="eingabe"
          aria-label="Name der Kleingartenanlage"
          placeholder="Name der Kleingartenanlage"
          value={wert}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
