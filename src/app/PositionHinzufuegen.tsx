// „Position hinzufügen“ für Außenanlagen und Aufwuchs.
// Handy: Suche → Formular (eigener Bildschirm, Fuß mit Gesamt und „Hinzufügen“).
// Tablet: Suche links, Formular rechts. Die Varianten einer Katalog-Position stehen
// direkt in den Suchtreffern – einen eigenen Variantenschritt gibt es nicht mehr.
import { useState } from 'react'
import { ChevronLeft, Plus, Search, X } from 'lucide-react'
import type { Position, Wep } from '@/model'
import type { EigenePosition, Position as KatalogPosition, Variante as KatalogVariante } from '@/katalog'
import { aktiveEigene, alsKatalogPosition, EIGEN_PRAEFIX, lokaleEigene, merkeEigenePosition, sucheKatalog } from '@/katalog'
import { merkeZuletztVerwendet, ladeZuletztVerwendet } from '@/gruen/zuletzt'
import { gefundeneArt, kurzeBezeichnung } from '@/gruen/format'
import { altersStaffel, obstFormVarianten } from '@/gruen/baumMass'
import { ABSCHNITT_TITEL, KATALOG_POSITIONEN, type Abschnitt } from './katalogDaten'
import { PositionFormular, type Auswahl, type MerkeDaten } from './PositionFormular'
import { ICON, Kopf, euroFormat } from './ui'

/** Ein Suchtreffer mit allen Varianten, die direkt in der Liste stehen. */
interface TrefferGruppe {
  schluessel: string
  position: KatalogPosition
  art?: string
  eintraege: Auswahl[]
}

const schluessel = (a: Auswahl) => `${a.position?.id ?? (a.eigene ? EIGEN_PRAEFIX + a.eigene.id : 'frei')}|${JSON.stringify(a.variante ?? '')}`

/**
 * Sucht im Katalog und bei den eigenen Positionen des Abschnitts. Eigene Positionen stehen vor
 * gleich guten Katalogtreffern und bekommen den Eintrag `eigene` statt einer Katalog-Position.
 */
export function gruppiere(
  positionen: KatalogPosition[],
  suchbegriff: string,
  zuletzt: string[],
  eigene: EigenePosition[] = [],
): TrefferGruppe[] {
  const eigeneNachId = new Map(eigene.map((e) => [EIGEN_PRAEFIX + e.id, e]))
  const treffer = sucheKatalog([...eigene.map(alsKatalogPosition), ...positionen], suchbegriff, {
    zuletztVerwendet: suchbegriff ? [] : zuletzt,
    limit: 10,
  })
  return treffer.map((t, i) => {
    const meine = eigeneNachId.get(t.position.id)
    if (meine) {
      return {
        schluessel: `${t.position.id}-${i}`,
        position: t.position,
        eintraege: [{ eigene: meine }],
      }
    }
    const art = gefundeneArt(t.position, suchbegriff)
    // Nennt der Treffer schon eine Variante (z. B. „Apfel Halbstamm“), nur diese zeigen
    // Nach Alter gestaffelt (Obst, Beerenobst, weitere Kulturen): nur die Wuchsform wählen bzw. eine einzige Zeile –
    // die Altersstufe folgt aus dem Alter im Formular (BewRL S. 16–17)
    const formen = altersStaffel(t.position.id) ? obstFormVarianten(t.position.varianten ?? []) : []
    const varianten: (KatalogVariante | undefined)[] =
      altersStaffel(t.position.id)
        ? formen.length
          ? formen.filter((v) => !t.variante?.form || v.form === t.variante.form)
          : [undefined]
        : t.variante
          ? [t.variante]
          : t.position.varianten?.length
            ? t.position.varianten
            : [undefined]
    return {
      schluessel: `${t.position.id}-${i}`,
      position: t.position,
      art,
      eintraege: varianten.map((variante) => ({ position: t.position, variante, art })),
    }
  })
}

function trefferText(a: Auswahl): string {
  if (a.eigene) return a.eigene.bezeichnung
  if (!a.position) return ''
  return a.variante ? kurzeBezeichnung(a.position, a.variante, a.art) : a.position.bezeichnung
}

export function PositionHinzufuegen({
  abschnitt,
  wep,
  onAbbrechen,
  onHinzufuegen,
}: {
  abschnitt: Abschnitt
  wep: Wep
  onAbbrechen: () => void
  onHinzufuegen: (pos: Position) => void
}) {
  const [schritt, setSchritt] = useState<'suche' | 'formular'>('suche')
  const [suchbegriff, setSuchbegriff] = useState('')
  const [zuletzt] = useState<string[]>(() => ladeZuletztVerwendet())
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)

  // Eigene Positionen nur im passenden Abschnitt
  const [eigene] = useState<EigenePosition[]>(() => aktiveEigene(lokaleEigene.lade().eintraege, abschnitt))
  const relevante = KATALOG_POSITIONEN.filter((p) =>
    abschnitt === 'aussenanlagen' ? p.abschnitt === 'II. Außenanlagen' : p.abschnitt === 'III. Aufwuchs',
  )
  const gruppen = gruppiere(relevante, suchbegriff, zuletzt, eigene)
  const anzahlTreffer = gruppen.reduce((n, g) => n + g.eintraege.length, 0)

  function waehle(a: Auswahl) {
    if (a.position) merkeZuletztVerwendet(a.position.id)
    if (a.eigene) merkeZuletztVerwendet(EIGEN_PRAEFIX + a.eigene.id)
    setAuswahl(a)
    setSchritt('formular')
  }

  function fertig(pos: Position, merken?: MerkeDaten) {
    if (merken) merkeEigenePosition({ ...merken, abschnitt })
    onHinzufuegen(pos)
  }

  const titel = ABSCHNITT_TITEL[abschnitt]

  return (
    <div className="hinzufuegen" data-schritt={schritt}>
      <Kopf
        titel="Position hinzufügen"
        unter={titel}
        links={
          schritt === 'suche' ? (
            <button type="button" className="textknopf" onClick={onAbbrechen}>
              Abbrechen
            </button>
          ) : (
            <button type="button" className="zurueck" onClick={() => setSchritt('suche')}>
              <ChevronLeft {...ICON} />
              Suche
            </button>
          )
        }
      />

      <header className="seitenkopf nur-tablet">
        <div>
          <h1 className="h1">Position hinzufügen</h1>
          <p className="neben">{titel}</p>
        </div>
        <button type="button" className="knopf" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </header>

      <div className="split">
        <section className="split-suche" aria-label="Suche im Katalog">
          <div className="suchfeld">
            <Search {...ICON} className="suchfeld-icon" />
            <input
              type="search"
              className="eingabe"
              aria-label="Katalog durchsuchen"
              placeholder="Pflanze oder Bezeichnung"
              value={suchbegriff}
              onChange={(e) => setSuchbegriff(e.target.value)}
              enterKeyHint="search"
              autoComplete="off"
              autoFocus
            />
            {suchbegriff && (
              <button
                type="button"
                className="symbolknopf suchfeld-leeren"
                aria-label="Suche leeren"
                onClick={() => setSuchbegriff('')}
              >
                <X {...ICON} />
              </button>
            )}
          </div>

          <p className="gruppenkopf">
            {suchbegriff
              ? `${anzahlTreffer} Treffer${eigene.length ? '' : ' im Katalog'}`
              : zuletzt.length
                ? 'Zuletzt verwendet und häufig'
                : 'Häufig verwendet'}
          </p>
          {gruppen.map((g) => (
            <div key={g.schluessel}>
              {g.eintraege.length > 1 && (
                <p className="gruppentitel">
                  {g.art ? `${g.art} – ` : ''}
                  {g.position.bezeichnung}
                  <span className="neben"> · BewRL S. {g.position.seite}</span>
                </p>
              )}
              <ul className="liste">
                {g.eintraege.map((e) => {
                  const hoechst = e.variante?.hoechstwert ?? e.position?.hoechstwert
                  const gemerkterPreis = e.eigene?.einzelpreis
                  const aktiv = auswahl !== null && schluessel(auswahl) === schluessel(e)
                  return (
                    <li key={schluessel(e)}>
                      <button
                        type="button"
                        className="zeile"
                        aria-current={aktiv ? 'true' : undefined}
                        onClick={() => waehle(e)}
                      >
                        <span className="zeile-text">
                          <span className="zeile-titel">{trefferText(e)}</span>
                          {g.eintraege.length === 1 && (
                            <span className="neben">
                              {e.eigene ? `${e.eigene.einheit}` : g.position.kategorie}
                            </span>
                          )}
                        </span>
                        {e.eigene && <span className="status">Eigene</span>}
                        {gemerkterPreis !== undefined && <span className="zahl neben">{euroFormat(gemerkterPreis)}</span>}
                        {hoechst !== undefined && <span className="zahl neben">bis {euroFormat(hoechst)}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <ul className="liste liste-frei">
            <li>
              <button
                type="button"
                className="zeile zeile-akzent"
                aria-current={auswahl !== null && !auswahl.position ? 'true' : undefined}
                onClick={() => waehle({})}
              >
                <Plus {...ICON} />
                <span className="zeile-titel">Eigene Position (Freitext)</span>
              </button>
            </li>
          </ul>
        </section>

        <section className="split-formular" aria-label="Position">
          {auswahl ? (
            <PositionFormular key={schluessel(auswahl)} auswahl={auswahl} wep={wep} onFertig={fertig} />
          ) : (
            <p className="formular-leer">
              Position aus dem Katalog wählen oder eine eigene Position (Freitext) anlegen.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
