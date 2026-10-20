// „Position hinzufügen“ für Außenanlagen und Aufwuchs.
// Handy: Suche → Formular (eigener Bildschirm, Fuß mit Gesamt und „Hinzufügen“).
// Tablet: Suche links, Formular rechts. Die Varianten einer Katalog-Position stehen
// direkt in den Suchtreffern – einen eigenen Variantenschritt gibt es nicht mehr.
import { useId, useState } from 'react'
import { ChevronLeft, Plus, Search, X } from 'lucide-react'
import type { Position, Wep } from '@/model'
import { ZUSTANDSSTUFEN } from '@/model'
import type { Position as KatalogPosition, Variante as KatalogVariante } from '@/katalog'
import { sucheKatalog } from '@/katalog'
import { berechnePreisvorschlag } from '@/gruen/preisvorschlag'
import { berechneRegelhinweise } from '@/gruen/regelhinweise'
import { merkeZuletztVerwendet, ladeZuletztVerwendet } from '@/gruen/zuletzt'
import {
  gefundeneArt,
  kurzeBezeichnung,
  leseZahl,
  leseZahlOder,
  variantenMerkmale,
  zahlDe,
  zahlFuerEingabe,
} from '@/gruen/format'
import { ABSCHNITT_TITEL, INVASIVE_ARTEN, KATALOG_POSITIONEN, type Abschnitt } from './katalogDaten'
import { HinweisListe } from './Positionen'
import { ICON, Kopf, euroFormat } from './ui'

type Zustand = NonNullable<Position['zustand']>
const ZUSTAENDE = Object.keys(ZUSTANDSSTUFEN) as Zustand[]
const EINHEITEN = ['Stück', 'm', 'm²', 'm³', 'lfdm', 'Pauschale']

/** Gewählter Eintrag: Katalog-Position (ggf. mit Variante) oder Freitext ({}). */
interface Auswahl {
  position?: KatalogPosition
  variante?: KatalogVariante
  /** Über die Suche gefundene Art, z. B. „Liguster“ bei der Hecke */
  art?: string
}

/** Ein Suchtreffer mit allen Varianten, die direkt in der Liste stehen. */
interface TrefferGruppe {
  schluessel: string
  position: KatalogPosition
  art?: string
  eintraege: Auswahl[]
}

const schluessel = (a: Auswahl) => `${a.position?.id ?? 'frei'}|${JSON.stringify(a.variante ?? '')}`

export function gruppiere(positionen: KatalogPosition[], suchbegriff: string, zuletzt: string[]): TrefferGruppe[] {
  const treffer = sucheKatalog(positionen, suchbegriff, {
    zuletztVerwendet: suchbegriff ? [] : zuletzt,
    limit: 10,
  })
  return treffer.map((t, i) => {
    const art = gefundeneArt(t.position, suchbegriff)
    // Nennt der Treffer schon eine Variante (z. B. „Apfel Halbstamm“), nur diese zeigen
    const varianten: (KatalogVariante | undefined)[] = t.variante
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

  const relevante = KATALOG_POSITIONEN.filter((p) =>
    abschnitt === 'aussenanlagen' ? p.abschnitt === 'II. Außenanlagen' : p.abschnitt === 'III. Aufwuchs',
  )
  const gruppen = gruppiere(relevante, suchbegriff, zuletzt)
  const anzahlTreffer = gruppen.reduce((n, g) => n + g.eintraege.length, 0)

  function waehle(a: Auswahl) {
    if (a.position) merkeZuletztVerwendet(a.position.id)
    setAuswahl(a)
    setSchritt('formular')
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
              ? `${anzahlTreffer} Treffer im Katalog`
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
                          {g.eintraege.length === 1 && <span className="neben">{g.position.kategorie}</span>}
                        </span>
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
            <PositionFormular key={schluessel(auswahl)} auswahl={auswahl} wep={wep} onHinzufuegen={onHinzufuegen} />
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

function neuePositionId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Formular: Bezeichnung, Anzahl, Einheit, Zustand, Preis (Vorschlag oder überschrieben). */
function PositionFormular({
  auswahl,
  wep,
  onHinzufuegen,
}: {
  auswahl: Auswahl
  wep: Wep
  onHinzufuegen: (pos: Position) => void
}) {
  const { position: katalogPos, variante, art } = auswahl
  const hoechstwert = variante?.hoechstwert ?? katalogPos?.hoechstwert
  const id = useId()

  const [bezeichnung, setBezeichnung] = useState(katalogPos ? kurzeBezeichnung(katalogPos, variante, art) : '')
  const [anzahl, setAnzahl] = useState('1')
  const [einheit, setEinheit] = useState<string>(katalogPos?.einheit ?? 'Stück')
  const [zustand, setZustand] = useState<Zustand>('gut')
  const [preisManuell, setPreisManuell] = useState(false)
  const [preisEingabe, setPreisEingabe] = useState('')

  // Vorgeschlagener Preis: Höchstwert × Zustandsstufe
  const vorschauPos: Position = {
    id: 'tmp',
    bezeichnung,
    anzahl: leseZahlOder(anzahl, 0),
    einheit,
    zustand,
    hoechstwert,
    einzelpreis: 0,
    preisManuell: false,
    hinweise: [],
  }
  const preisVorschlag = berechnePreisvorschlag(vorschauPos)
  const einzelpreis = preisManuell ? leseZahlOder(preisEingabe, 0) : preisVorschlag
  const gesamt = leseZahlOder(anzahl, 0) * einzelpreis

  // Regelhinweise für die Vorschau
  const vorschauHinweise = berechneRegelhinweise(
    { ...vorschauPos, einzelpreis },
    wep,
    KATALOG_POSITIONEN,
    INVASIVE_ARTEN,
  )

  const stufe = ZUSTANDSSTUFEN[zustand]
  const ungueltig =
    !bezeichnung.trim() ||
    !(leseZahl(anzahl) > 0) ||
    (preisManuell && !Number.isFinite(leseZahl(preisEingabe)))

  function bestaetigen() {
    onHinzufuegen({
      id: neuePositionId(),
      katalogId: katalogPos?.id,
      bezeichnung: bezeichnung.trim(),
      anzahl: leseZahlOder(anzahl, 0),
      einheit,
      zustand,
      hoechstwert,
      einzelpreis,
      preisManuell,
      hinweise: vorschauHinweise,
    })
  }

  return (
    <div className="formular formular-pos">
      {katalogPos ? (
        <p className="neben quelle">
          Katalog: {katalogPos.bezeichnung}
          {variante ? ` · ${variantenMerkmale(variante)}` : ''} · BewRL S. {katalogPos.seite}
        </p>
      ) : (
        <p className="neben quelle">Eigene Position (Freitext)</p>
      )}

      <div className="feld">
        <label className="label" htmlFor={`${id}-bez`}>
          Bezeichnung (steht so in der Excel)
        </label>
        <input
          id={`${id}-bez`}
          className="eingabe"
          value={bezeichnung}
          placeholder="z. B. Kirschbaum, alt"
          autoFocus={!katalogPos}
          onChange={(e) => setBezeichnung(e.target.value)}
        />
      </div>

      <div className="feld-reihe">
        <div className="feld">
          <label className="label" htmlFor={`${id}-anz`}>
            Anzahl
          </label>
          <input
            id={`${id}-anz`}
            className="eingabe"
            inputMode="decimal"
            value={anzahl}
            onChange={(e) => setAnzahl(e.target.value)}
          />
        </div>
        <div className="feld">
          <label className="label" htmlFor={`${id}-einh`}>
            Einheit
          </label>
          <select id={`${id}-einh`} className="eingabe" value={einheit} onChange={(e) => setEinheit(e.target.value)}>
            {EINHEITEN.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="feld fieldset">
        <legend className="label">Zustand</legend>
        <div className="segmente">
          {ZUSTAENDE.map((z) => (
            <button key={z} type="button" className="segment" aria-pressed={z === zustand} onClick={() => setZustand(z)}>
              {z}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="feld">
        <span className="label" id={`${id}-preis-label`}>
          Einzelpreis
        </span>
        <div className="preis">
          {preisManuell ? (
            <>
              <div className="preis-zeile">
                <div className="euro-eingabe">
                  <input
                    className="eingabe zahl"
                    inputMode="decimal"
                    aria-labelledby={`${id}-preis-label`}
                    value={preisEingabe}
                    placeholder="0,00"
                    onChange={(e) => setPreisEingabe(e.target.value)}
                    autoFocus
                  />
                  <span aria-hidden="true">€</span>
                </div>
                <button
                  type="button"
                  className="textknopf"
                  onClick={() => {
                    setPreisManuell(false)
                    setPreisEingabe('')
                  }}
                >
                  Vorschlag {euroFormat(preisVorschlag)}
                </button>
              </div>
              <span className="neben">Eigener Preis – wird im WEP als „manuell“ vermerkt.</span>
            </>
          ) : (
            <>
              <div className="preis-zeile">
                <span className="preis-wert zahl" aria-labelledby={`${id}-preis-label`}>
                  {euroFormat(preisVorschlag)}
                </span>
                <button
                  type="button"
                  className="knopf"
                  onClick={() => {
                    setPreisManuell(true)
                    setPreisEingabe(zahlFuerEingabe(preisVorschlag))
                  }}
                >
                  Überschreiben
                </button>
              </div>
              <span className="neben">
                {hoechstwert === undefined
                  ? 'Kein Höchstwert im Katalog – Preis bitte über „Überschreiben“ eintragen.'
                  : stufe.festpreis !== undefined
                    ? `Vorschlag: Erinnerungswert ${euroFormat(stufe.festpreis)} bei schlechtem Zustand`
                    : `Vorschlag: Höchstwert ${euroFormat(hoechstwert)} × ${zahlDe(stufe.faktor)} (${zustand})`}
              </span>
            </>
          )}
        </div>
      </div>

      {vorschauHinweise.length > 0 && (
        <div>
          <HinweisListe hinweise={vorschauHinweise} />
        </div>
      )}

      {katalogPos?.regeln && (
        <details className="details">
          <summary>Richtlinie</summary>
          <p>{katalogPos.regeln}</p>
        </details>
      )}

      <div className="formular-fuss">
        <div className="summe summe-klein">
          <span>Gesamt</span>
          <span className="zahl">{euroFormat(gesamt)}</span>
        </div>
        <button type="button" className="knopf knopf-primaer knopf-breit" disabled={ungueltig} onClick={bestaetigen}>
          Hinzufügen
        </button>
      </div>
    </div>
  )
}
