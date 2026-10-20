// Profil → „Eigene Positionen“: die gemerkten Freitext-Positionen ansehen, ändern, löschen.
// Sie werden über daten/eigene-positionen.json mit den anderen Geräten abgeglichen.
import { useId, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  aendereEigenePosition,
  aktiveEigene,
  loescheEigenePosition,
  lokaleEigene,
  type EigenePosition,
  type EigenerAbschnitt,
} from '@/katalog'
import { leseZahl, zahlFuerEingabe } from '@/gruen/format'
import { ABSCHNITT_TITEL } from './katalogDaten'
import { Dialog, ICON, Rueckfrage, euroFormat } from './ui'

const EINHEITEN = ['Stück', 'm', 'm²', 'm³', 'lfdm', 'Pauschale']

const sortiert = (eintraege: EigenePosition[]) =>
  aktiveEigene(eintraege).sort(
    (a, b) => a.abschnitt.localeCompare(b.abschnitt) || a.bezeichnung.localeCompare(b.bezeichnung, 'de'),
  )

export function EigenePositionen({ id, konto }: { id: string; konto: boolean }) {
  const [liste, setListe] = useState(() => sortiert(lokaleEigene.lade().eintraege))
  const [aendern, setAendern] = useState<EigenePosition | null>(null)
  const [loeschen, setLoeschen] = useState<EigenePosition | null>(null)

  return (
    <section className="abschnitt" aria-labelledby={`${id}-titel`}>
      <h2 className="gruppenkopf" id={`${id}-titel`}>
        Eigene Positionen
      </h2>
      {liste.length === 0 ? (
        <p className="neben">
          Noch keine. Beim Hinzufügen einer Freitext-Position kannst du sie als eigene Position merken.
        </p>
      ) : (
        <ul className="liste">
          {liste.map((e) => (
            <li key={e.id} className="zeile">
              <span className="zeile-text">
                <span className="zeile-titel">{e.bezeichnung}</span>
                <span className="neben">
                  {ABSCHNITT_TITEL[e.abschnitt]} · {e.einheit}
                  {e.einzelpreis !== undefined ? ` · ${euroFormat(e.einzelpreis)}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="symbolknopf"
                aria-label={`${e.bezeichnung} ändern`}
                onClick={() => setAendern(e)}
              >
                <Pencil {...ICON} />
              </button>
              <button
                type="button"
                className="symbolknopf"
                aria-label={`${e.bezeichnung} löschen`}
                onClick={() => setLoeschen(e)}
              >
                <Trash2 {...ICON} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="neben">
        {konto
          ? 'Eigene Positionen werden mit deinen anderen Geräten abgeglichen.'
          : 'Ohne Konto bleiben eigene Positionen auf diesem Gerät.'}
      </p>

      {aendern && (
        <AendernDialog
          eintrag={aendern}
          onAbbrechen={() => setAendern(null)}
          onSpeichern={(teil) => {
            setListe(sortiert(aendereEigenePosition(aendern.id, teil).eintraege))
            setAendern(null)
          }}
        />
      )}
      {loeschen && (
        <Rueckfrage
          titel="Eigene Position löschen?"
          text={`„${loeschen.bezeichnung}“ erscheint nicht mehr in der Suche, auch nicht auf deinen anderen Geräten. Bereits erfasste WEPs bleiben unverändert.`}
          onAbbrechen={() => setLoeschen(null)}
          onBestaetigen={() => {
            setListe(sortiert(loescheEigenePosition(loeschen.id).eintraege))
            setLoeschen(null)
          }}
        />
      )}
    </section>
  )
}

function AendernDialog({
  eintrag,
  onAbbrechen,
  onSpeichern,
}: {
  eintrag: EigenePosition
  onAbbrechen: () => void
  onSpeichern: (teil: { bezeichnung: string; einheit: string; abschnitt: EigenerAbschnitt; einzelpreis?: number }) => void
}) {
  const id = useId()
  const [bezeichnung, setBezeichnung] = useState(eintrag.bezeichnung)
  const [einheit, setEinheit] = useState(eintrag.einheit)
  const [abschnitt, setAbschnitt] = useState<EigenerAbschnitt>(eintrag.abschnitt)
  const [preis, setPreis] = useState(eintrag.einzelpreis !== undefined ? zahlFuerEingabe(eintrag.einzelpreis) : '')
  const einheiten = EINHEITEN.includes(einheit) ? EINHEITEN : [...EINHEITEN, einheit]
  const preisOk = preis.trim() === '' || Number.isFinite(leseZahl(preis))

  return (
    <Dialog titel="Eigene Position ändern" onSchliessen={onAbbrechen}>
      <div className="feld">
        <label className="label" htmlFor={`${id}-bez`}>
          Bezeichnung
        </label>
        <input id={`${id}-bez`} className="eingabe" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
      </div>
      <div className="feld-reihe">
        <div className="feld">
          <label className="label" htmlFor={`${id}-einh`}>
            Einheit
          </label>
          <select id={`${id}-einh`} className="eingabe" value={einheit} onChange={(e) => setEinheit(e.target.value)}>
            {einheiten.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="feld">
          <label className="label" htmlFor={`${id}-preis`}>
            Einzelpreis (€, leer = keiner)
          </label>
          <input
            id={`${id}-preis`}
            className="eingabe zahl"
            inputMode="decimal"
            value={preis}
            placeholder="0,00"
            onChange={(e) => setPreis(e.target.value)}
          />
        </div>
      </div>
      <div className="feld">
        <label className="label" htmlFor={`${id}-abs`}>
          Abschnitt
        </label>
        <select
          id={`${id}-abs`}
          className="eingabe"
          value={abschnitt}
          onChange={(e) => setAbschnitt(e.target.value as EigenerAbschnitt)}
        >
          <option value="aussenanlagen">{ABSCHNITT_TITEL.aussenanlagen}</option>
          <option value="aufwuchs">{ABSCHNITT_TITEL.aufwuchs}</option>
        </select>
      </div>
      <div className="dialog-knoepfe">
        <button type="button" className="knopf" onClick={onAbbrechen}>
          Abbrechen
        </button>
        <button
          type="button"
          className="knopf knopf-primaer"
          disabled={!bezeichnung.trim() || !preisOk}
          onClick={() =>
            onSpeichern({
              bezeichnung: bezeichnung.trim(),
              einheit,
              abschnitt,
              einzelpreis: preis.trim() === '' ? undefined : leseZahl(preis),
            })
          }
        >
          Speichern
        </button>
      </div>
    </Dialog>
  )
}
