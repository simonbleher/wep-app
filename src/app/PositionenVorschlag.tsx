// Balken mit dem Positions-Vorschlag eines Agenten (window.wep.positionen.vorschlagen) über der Liste:
// zeigt, was vorgeschlagen ist (mit Summe und Hinweisen), und wartet auf „Übernehmen“ oder „Verwerfen“.
// Erst „Übernehmen“ legt die Positionen im WEP an; danach ist „Rückgängig“ möglich, bis die Liste verlassen wird.
import { useEffect } from 'react'
import { Check, Undo2, X } from 'lucide-react'
import type { Wep } from '@/model'
import { positionenSpeicher, usePositionenStand } from '@/agent/bruecke'
import type { PositionenListe } from '@/agent/positionen'
import { ICON, euroFormat } from './ui'

const TITEL: Record<PositionenListe, string> = { aufwuchs: 'Aufwuchs', aussenanlagen: 'Außenanlagen', beseitigung: 'Beseitigung Grün' }

export function PositionenVorschlag({ liste, aendere }: { liste: PositionenListe; aendere: (fn: (w: Wep) => Wep) => Promise<void> }) {
  const stand = usePositionenStand()
  // „Rückgängig“ gilt nur, solange die Liste offen ist
  useEffect(() => () => positionenSpeicher.vergiss(), [])

  const offen = stand.anzeige && stand.anzeige.liste === liste ? stand.anzeige : null
  const uebernommen = !offen && stand.uebernommen && stand.uebernommen.liste === liste ? stand.uebernommen : null

  if (uebernommen) {
    const n = uebernommen.vorschau.length
    return (
      <div role="region" aria-label="Übernommener Vorschlag" className="skizze-vorschlag-balken" data-testid="positionen-uebernommen">
        <span role="status" className="skizze-vorschlag-text">
          {n} {n === 1 ? 'Position' : 'Positionen'} übernommen
        </span>
        <button
          type="button"
          className="knopf"
          aria-label="Übernahme rückgängig machen"
          onClick={() => {
            const ids = new Set(liste === 'beseitigung' ? uebernommen.beseitigung.map((b) => b.id) : uebernommen.positionen.map((p) => p.id))
            void aendere((w) => ({
              ...w,
              gruen:
                liste === 'beseitigung'
                  ? { ...w.gruen, beseitigungAA: w.gruen.beseitigungAA.filter((b) => !ids.has(b.id)) }
                  : { ...w.gruen, [liste]: w.gruen[liste].filter((p) => !ids.has(p.id)) },
            }))
            positionenSpeicher.zurueckgenommen()
          }}
        >
          <Undo2 {...ICON} /> Rückgängig
        </button>
        <button type="button" className="knopf" aria-label="Hinweis schließen" onClick={() => positionenSpeicher.vergiss()}>
          <X {...ICON} /> Schließen
        </button>
      </div>
    )
  }
  if (!offen) return null

  const n = offen.vorschau.length
  return (
    <div role="region" aria-label="Vorschlag für die Positionen" className="skizze-vorschlag-balken positionen-vorschlag" data-testid="positionen-vorschlag">
      <span role="status" aria-live="polite" className="skizze-vorschlag-text">
        Vorschlag: {n} {n === 1 ? 'Position' : 'Positionen'} für {TITEL[liste]} · {euroFormat(offen.summe)}
      </span>
      <button
        type="button"
        className="knopf knopf-primaer"
        aria-label="Vorschlag übernehmen"
        onClick={() => {
          void aendere((w) => ({
            ...w,
            gruen:
              liste === 'beseitigung'
                ? { ...w.gruen, beseitigungAA: [...w.gruen.beseitigungAA, ...offen.beseitigung] }
                : { ...w.gruen, [liste]: [...w.gruen[liste], ...offen.positionen] },
          }))
          positionenSpeicher.entscheide('uebernommen')
        }}
      >
        <Check {...ICON} /> Übernehmen
      </button>
      <button type="button" className="knopf" aria-label="Vorschlag verwerfen" onClick={() => positionenSpeicher.entscheide('verworfen')}>
        <X {...ICON} /> Verwerfen
      </button>
      <ul className="positionen-vorschlag-liste" aria-label="Vorgeschlagene Positionen">
        {offen.vorschau.map((z, i) => (
          <li key={i}>
            <strong>{z.bezeichnung}</strong> · {z.menge.toLocaleString('de-DE')} {z.einheit}
            {z.zustand ? ` · ${z.zustand}` : ''} · je {euroFormat(z.einzelpreis)} = {euroFormat(z.summe)}
          </li>
        ))}
      </ul>
      {offen.hinweise.length > 0 && (
        <ul className="positionen-vorschlag-hinweise" aria-label="Hinweise zum Vorschlag">
          {offen.hinweise.map((h, i) => (
            <li key={i}>{h.replace(/^positionen\[\d+\]\s*/, '')}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
