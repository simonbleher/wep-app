/**
 * Eingaben zur Dachform unter der Formwahl (Beta 6, Paket 2): Erklär-Skizze, obere Höhe (First, Spitze, hohe Wand)
 * und die Zusatzmaße der Form (Firstlänge, Walmhöhe/-tiefe, Knickhöhe/-einzug). Gemeinsam für den Grundriss-Editor
 * und den Rechner, damit beide dieselben Felder und Beschriftungen zeigen.
 */
import { ZahlFeld } from '@/app/BauKomponenten'
import { DACHFORMEN, DACH_FELDER, hoehenTexte, type DachMasse, type Dachform } from './grundriss'
import { DachSkizze } from './DachSkizze'

export function DachFelder({
  dachform,
  hoeheOben,
  dach,
  onAendern,
}: {
  dachform: Dachform
  hoeheOben: number | undefined
  dach: DachMasse
  /** `key` fasst Tipp-Änderungen desselben Feldes im Verlauf zusammen (Rückgängig). */
  onAendern: (aenderung: Partial<DachMasse> & { hoeheOben?: number | undefined }, key: string) => void
}) {
  if (dachform === 'flach') return null
  const hilfe = DACHFORMEN.find((d) => d.id === dachform)!.hilfe
  return (
    <div className="dach-felder" data-testid="dach-felder">
      <DachSkizze form={dachform} />
      <p className="neben">{hilfe}</p>
      <div className="feld-reihe">
        <ZahlFeld label={hoehenTexte(dachform).oben} einheit="m" wert={hoeheOben} onChange={(v) => onAendern({ hoeheOben: v }, 'oben')} />
        {DACH_FELDER[dachform].map((f) => (
          <ZahlFeld key={f.key} label={f.label} einheit="m" wert={dach[f.key]} onChange={(v) => onAendern({ [f.key]: v }, f.key)} hilfe={f.hilfe} />
        ))}
      </div>
    </div>
  )
}
