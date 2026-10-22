// Formular einer Beseitigungsposition (Abschnitt „Beseitigung“): Gegenstand, Menge,
// Einheit, Einzelpreis, Faktor (bei Faktor > 1 mit Begründung). Zum Hinzufügen und – mit
// `bearbeiten` – zum Ändern, dann mit „Löschen“ unten (mit Rückfrage).
import { useId, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import type { BeseitigungsPosition } from '@/model'
import { leseZahl, leseZahlOder, zahlFuerEingabe } from '@/gruen/format'
import { ICON, Kopf, Rueckfrage, euroFormat } from './ui'

const EINHEITEN = ['Stück', 'm', 'm²', 'Pauschale']

export function neueBeseitigungsId(): string {
  return `bes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function beseitigungSumme(positionen: BeseitigungsPosition[]): number {
  return positionen.reduce((s, p) => s + p.menge * p.einzelpreis * p.faktor, 0)
}

export function BeseitigungFormular({
  bearbeiten,
  vorlage,
  onAbbrechen,
  onFertig,
  onLoeschen,
  fotos,
  abschnittText = 'Beseitigungskosten (Abschnitt 2)',
  einheiten: einheitenListe = EINHEITEN,
  bausteine,
}: {
  bearbeiten?: BeseitigungsPosition
  /** Vorbelegung beim Hinzufügen (z. B. aus dem Hinweis einer Problempflanze). */
  vorlage?: { gegenstand: string; einheit: string; menge: number }
  onAbbrechen: () => void
  onFertig: (pos: BeseitigungsPosition) => void
  onLoeschen?: () => void
  /** Fotos dieser Position (nur beim Ändern); werden sofort gespeichert, unabhängig von „Speichern“. */
  fotos?: ReactNode
  /** Untertitel auf dem Tablet (Standard: Abschnitt 2, Grün). */
  abschnittText?: string
  /** Auswahl der Einheiten (Standard: Stück, m, m², Pauschale). */
  einheiten?: readonly string[]
  /** Textbausteine der Vorlage als Vorschläge für „Gegenstand“; bei Treffer werden Einheit und Preis vorbelegt. */
  bausteine?: readonly { text: string; einheit?: string; preis?: number }[]
}) {
  const id = useId()
  const [gegenstand, setGegenstand] = useState(bearbeiten?.gegenstand ?? vorlage?.gegenstand ?? '')
  const [menge, setMenge] = useState(bearbeiten ? zahlFuerEingabe(bearbeiten.menge) : vorlage ? zahlFuerEingabe(vorlage.menge) : '1')
  const [einheit, setEinheit] = useState(bearbeiten?.einheit ?? vorlage?.einheit ?? 'Stück')
  const [einzelpreis, setEinzelpreis] = useState(bearbeiten ? zahlFuerEingabe(bearbeiten.einzelpreis) : '')
  const [faktor, setFaktor] = useState(bearbeiten ? zahlFuerEingabe(bearbeiten.faktor) : '1')
  const [begruendung, setBegruendung] = useState(bearbeiten?.begruendung ?? '')
  const [frage, setFrage] = useState(false)

  const faktorZahl = leseZahlOder(faktor, 1)
  const gesamt = leseZahlOder(menge, 0) * leseZahlOder(einzelpreis, 0) * faktorZahl
  const einheiten = einheitenListe.includes(einheit) ? einheitenListe : [...einheitenListe, einheit]
  const ungueltig = !gegenstand.trim() || !Number.isFinite(leseZahl(menge)) || (einzelpreis.trim() !== '' && !Number.isFinite(leseZahl(einzelpreis)))

  function bestaetigen() {
    onFertig({
      ...bearbeiten,
      id: bearbeiten?.id ?? neueBeseitigungsId(),
      gegenstand: gegenstand.trim(),
      menge: leseZahlOder(menge, 0),
      einheit,
      einzelpreis: leseZahlOder(einzelpreis, 0),
      faktor: faktorZahl,
      begruendung: faktorZahl > 1 && begruendung.trim() ? begruendung.trim() : undefined,
    })
  }

  const titel = bearbeiten ? 'Beseitigung ändern' : 'Beseitigung hinzufügen'

  return (
    <div className="hinzufuegen bearbeiten" data-schritt="formular">
      <Kopf
        titel={titel}
        unter={abschnittText.startsWith('Beseitigungskosten (') ? 'Beseitigung' : 'Beseitigung Bau'}
        links={
          <button type="button" className="textknopf" onClick={onAbbrechen}>
            Abbrechen
          </button>
        }
      />
      <header className="seitenkopf nur-tablet">
        <div>
          <h1 className="h1">{titel}</h1>
          <p className="neben">{abschnittText}</p>
        </div>
        <button type="button" className="knopf" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </header>

      <div className="split">
        <section className="split-formular" aria-label="Beseitigung">
          <div className="formular formular-pos">
            <div className="feld">
              <label className="label" htmlFor={`${id}-geg`}>
                Gegenstand / Beschreibung
              </label>
              <input
                id={`${id}-geg`}
                type="text"
                className="eingabe"
                value={gegenstand}
                onChange={(e) => {
                  setGegenstand(e.target.value)
                  const treffer = bausteine?.find((b) => b.text === e.target.value)
                  if (treffer) {
                    if (treffer.einheit) setEinheit(treffer.einheit)
                    if (treffer.preis !== undefined && einzelpreis.trim() === '') setEinzelpreis(zahlFuerEingabe(treffer.preis))
                  }
                }}
                list={bausteine ? `${id}-bausteine` : undefined}
                placeholder={bausteine ? 'Textbaustein wählen oder eigenen Text schreiben' : 'z. B. Japanischer Knöterich entfernen'}
                autoFocus={!bearbeiten}
              />
              {bausteine && (
                <datalist id={`${id}-bausteine`}>
                  {bausteine.map((b) => (
                    <option key={b.text} value={b.text} />
                  ))}
                </datalist>
              )}
            </div>

            <div className="feld-reihe">
              <div className="feld">
                <label className="label" htmlFor={`${id}-menge`}>
                  Menge
                </label>
                <input
                  id={`${id}-menge`}
                  type="text"
                  inputMode="decimal"
                  className="eingabe"
                  value={menge}
                  onChange={(e) => setMenge(e.target.value)}
                />
              </div>
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
            </div>

            <div className="feld-reihe">
              <div className="feld">
                <label className="label" htmlFor={`${id}-preis`}>
                  Einzelpreis (€)
                </label>
                <input
                  id={`${id}-preis`}
                  type="text"
                  inputMode="decimal"
                  className="eingabe"
                  value={einzelpreis}
                  onChange={(e) => setEinzelpreis(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="feld">
                <label className="label" htmlFor={`${id}-faktor`}>
                  Faktor (Standard 1)
                </label>
                <input
                  id={`${id}-faktor`}
                  type="text"
                  inputMode="decimal"
                  className="eingabe"
                  value={faktor}
                  onChange={(e) => setFaktor(e.target.value)}
                />
              </div>
            </div>

            {faktorZahl > 1 && (
              <div className="feld">
                <label className="label" htmlFor={`${id}-begr`}>
                  Begründung (Faktor &gt; 1)
                </label>
                <input
                  id={`${id}-begr`}
                  type="text"
                  className="eingabe"
                  value={begruendung}
                  onChange={(e) => setBegruendung(e.target.value)}
                />
              </div>
            )}

            {bearbeiten && fotos}

            {bearbeiten && onLoeschen && (
              <button type="button" className="knopf knopf-loeschen knopf-breit" onClick={() => setFrage(true)}>
                <Trash2 {...ICON} />
                Löschen
              </button>
            )}

            <div className="formular-fuss">
              <div className="summe summe-klein">
                <span>Gesamt</span>
                <span className="zahl">{euroFormat(gesamt)}</span>
              </div>
              <button type="button" className="knopf knopf-primaer knopf-breit" disabled={ungueltig} onClick={bestaetigen}>
                {bearbeiten ? 'Speichern' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {frage && onLoeschen && (
        <Rueckfrage
          titel="Beseitigung löschen?"
          text={`„${gegenstand.trim() || bearbeiten?.gegenstand}“ wird aus der Liste entfernt. Das lässt sich nicht rückgängig machen.`}
          onAbbrechen={() => setFrage(false)}
          onBestaetigen={onLoeschen}
        />
      )}
    </div>
  )
}
