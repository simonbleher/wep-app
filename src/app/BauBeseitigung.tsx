// Reiter „Beseitigung Bau“ (Beta 4, Paket 2): Beseitigungskosten Bau (Anlage 4, Teil 1; Richtlinie S. 19–20) mit den
// Textbausteinen der Vorlage und Vorschlägen aus dem WEP (widerrechtliche Bauteile, Grube).
import { ChevronRight, Hammer, Plus, Wand2 } from 'lucide-react'
import type { BeseitigungsPosition, Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import { BESEITIGUNG_BAU_ZEILEN } from '@/export/exportBau'
import { beseitigungsVorschlaege, hinweiseBau } from '@/bau'
import { zahlDe } from '@/gruen/format'
import { BauHinweise } from './BauKomponenten'
import { beseitigungSumme } from './BeseitigungFormular'
import { aendereBauTeil } from './bauHelfer'
import { ICON, LeerZustand, euroFormat } from './ui'

/** Einheiten im Formular „Beseitigung Bau“. */
export const EINHEITEN_BAU = ['Stück', 'm', 'm²', 'm³', 'pauschal']

export function BeseitigungBauTab({ wep, aendere, profilIndex, onOeffnen }: { wep: Wep; aendere: WepAendern; profilIndex?: Record<string, number>; onOeffnen: (id?: string) => void }) {
  const liste = wep.bau?.beseitigung ?? []
  const vorschlaege = beseitigungsVorschlaege(wep)
  const hinweise = hinweiseBau(wep, { profilIndex }).filter((h) => h.bereich === 'beseitigung')
  const setze = (neu: BeseitigungsPosition[]) => void aendere((w) => aendereBauTeil(w, (b) => ({ ...b, beseitigung: neu })))

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Beseitigung Bau</h1>
          <p className="neben">{liste.length === 1 ? '1 Position' : `${liste.length} Positionen`}</p>
        </div>
        <button type="button" className="knopf knopf-primaer" onClick={() => onOeffnen()}>
          <Plus {...ICON} />
          Hinzufügen
        </button>
      </header>
      <p className="neben block">
        Kosten für nicht gestattete oder zu entfernende bauliche Anlagen (Richtlinie S. 19–20): je m³ umbauten Raumes nach Bauklasse, Laubenvorplatz je m².
        Für besondere Erschwernisse ist ein Zuschlag bis 300 % möglich (Faktor, mit Begründung). Die Vorlage hat Platz für {BESEITIGUNG_BAU_ZEILEN.length} Zeilen.
      </p>

      <BauHinweise hinweise={hinweise} mitInfo={false} />

      {vorschlaege.length > 0 && (
        <div className="zeile zeile-akzent vorschlag">
          <Wand2 {...ICON} />
          <span className="zeile-text">
            <span className="zeile-titel">{vorschlaege.length === 1 ? '1 Vorschlag' : `${vorschlaege.length} Vorschläge`} aus dem WEP</span>
            <span className="neben">{vorschlaege.map((v) => v.gegenstand).join(' · ')}</span>
          </span>
          <button type="button" className="knopf" onClick={() => setze([...liste, ...vorschlaege])}>
            Übernehmen
          </button>
        </div>
      )}

      {liste.length === 0 ? (
        <LeerZustand icon={Hammer} titel="Noch keine Positionen" text="Hier stehen die Kosten für den Rückbau von Anbauten, Kellern, Schornstein, Sondermüll und Unrat." />
      ) : (
        <>
          <ul className="liste" aria-label="Beseitigungspositionen Bau">
            {liste.map((pos) => (
              <li key={pos.id}>
                <button type="button" className="zeile" onClick={() => onOeffnen(pos.id)}>
                  <span className="zeile-text">
                    <span className="zeile-titel">{pos.gegenstand}</span>
                    <span className="neben">
                      {zahlDe(pos.menge)}&nbsp;{pos.einheit} · je {euroFormat(pos.einzelpreis)} · Faktor {zahlDe(pos.faktor)}
                    </span>
                    {pos.begruendung && <span className="neben">Begründung: {pos.begruendung}</span>}
                  </span>
                  <span className="zahl c-summe">{euroFormat(pos.menge * pos.einzelpreis * pos.faktor)}</span>
                  <ChevronRight {...ICON} className="chevron" />
                </button>
              </li>
            ))}
          </ul>
          <div className="summe">
            <span>Summe Beseitigung Bau</span>
            <span className="zahl">{euroFormat(beseitigungSumme(liste))}</span>
          </div>
        </>
      )}
      <button type="button" className="zeile zeile-akzent" onClick={() => onOeffnen()}>
        <Plus {...ICON} />
        <span className="zeile-titel">Position hinzufügen</span>
      </button>
    </>
  )
}
