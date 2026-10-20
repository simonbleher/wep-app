// Formular einer Position (Außenanlagen / Aufwuchs): Bezeichnung, Anzahl, Einheit,
// Zustand, Preis (Vorschlag oder überschrieben). Dient zum Hinzufügen und – mit
// `bearbeiten` – zum Ändern einer vorhandenen Position, dann mit „Löschen“ unten.
import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Position, Wep } from '@/model'
import { ZUSTANDSSTUFEN } from '@/model'
import type { Position as KatalogPosition, Variante as KatalogVariante } from '@/katalog'
import { berechnePreisvorschlag } from '@/gruen/preisvorschlag'
import { berechneRegelhinweise } from '@/gruen/regelhinweise'
import { kurzeBezeichnung, leseZahl, leseZahlOder, variantenMerkmale, zahlDe, zahlFuerEingabe } from '@/gruen/format'
import { INVASIVE_ARTEN, KATALOG_POSITIONEN } from './katalogDaten'
import { WarnListe } from './Positionen'
import { ICON, Rueckfrage, euroFormat } from './ui'

type Zustand = NonNullable<Position['zustand']>
const ZUSTAENDE = Object.keys(ZUSTANDSSTUFEN) as Zustand[]
const EINHEITEN = ['Stück', 'm', 'm²', 'm³', 'lfdm', 'Pauschale']

/** Gewählter Eintrag: Katalog-Position (ggf. mit Variante) oder Freitext ({}). */
export interface Auswahl {
  position?: KatalogPosition
  variante?: KatalogVariante
  /** Über die Suche gefundene Art, z. B. „Liguster“ bei der Hecke */
  art?: string
}

function neuePositionId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Katalog-Eintrag einer vorhandenen Position (nur für Quelle und Richtlinie). */
export function auswahlFuerPosition(pos: Position): Auswahl {
  return { position: KATALOG_POSITIONEN.find((p) => p.id === pos.katalogId) }
}

export function PositionFormular({
  auswahl,
  wep,
  bearbeiten,
  onFertig,
  onLoeschen,
}: {
  auswahl: Auswahl
  wep: Wep
  /** Vorhandene Position ändern statt neu anlegen */
  bearbeiten?: Position
  onFertig: (pos: Position) => void
  /** Nur beim Ändern: Position nach der Rückfrage löschen */
  onLoeschen?: () => void
}) {
  const { position: katalogPos, variante, art } = auswahl
  const hoechstwert = bearbeiten ? bearbeiten.hoechstwert : (variante?.hoechstwert ?? katalogPos?.hoechstwert)
  const id = useId()

  const [bezeichnung, setBezeichnung] = useState(
    bearbeiten?.bezeichnung ?? (katalogPos ? kurzeBezeichnung(katalogPos, variante, art) : ''),
  )
  const [anzahl, setAnzahl] = useState(bearbeiten ? zahlFuerEingabe(bearbeiten.anzahl) : '1')
  const [einheit, setEinheit] = useState<string>(bearbeiten?.einheit ?? katalogPos?.einheit ?? 'Stück')
  const [zustand, setZustand] = useState<Zustand | undefined>(bearbeiten ? bearbeiten.zustand : 'gut')
  // Eine Position, deren Preis vom Vorschlag abweicht, bleibt beim Ändern ein eigener Preis
  const [preisManuell, setPreisManuell] = useState(
    bearbeiten ? bearbeiten.preisManuell || Math.abs(berechnePreisvorschlag(bearbeiten) - bearbeiten.einzelpreis) >= 0.005 : false,
  )
  const [preisEingabe, setPreisEingabe] = useState(
    bearbeiten && preisManuell ? zahlFuerEingabe(bearbeiten.einzelpreis) : '',
  )
  const [frage, setFrage] = useState(false)

  // Vorgeschlagener Preis: Höchstwert × Zustandsstufe
  const vorschauPos: Position = {
    id: bearbeiten?.id ?? 'tmp',
    katalogId: bearbeiten?.katalogId ?? katalogPos?.id,
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
  // Richtlinien-Erläuterungen stehen nur hier im Formular, nicht in der Positionsliste
  const richtlinie = [katalogPos?.regeln, ...vorschauHinweise.filter((h) => h.schwere === 'info').map((h) => h.text)].filter(
    (t, i, alle): t is string => Boolean(t) && alle.indexOf(t) === i,
  )

  const stufe = zustand ? ZUSTANDSSTUFEN[zustand] : undefined
  const einheiten = EINHEITEN.includes(einheit) ? EINHEITEN : [...EINHEITEN, einheit]
  const ungueltig =
    !bezeichnung.trim() ||
    !(leseZahl(anzahl) > 0) ||
    (preisManuell && !Number.isFinite(leseZahl(preisEingabe)))

  function bestaetigen() {
    onFertig({
      ...bearbeiten,
      id: bearbeiten?.id ?? neuePositionId(),
      katalogId: bearbeiten ? bearbeiten.katalogId : katalogPos?.id,
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
          autoFocus={!katalogPos && !bearbeiten}
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
            {einheiten.map((u) => (
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
                    autoFocus={!bearbeiten}
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
                  : !stufe || !zustand
                    ? 'Zustand wählen, dann erscheint der Vorschlag.'
                    : stufe.festpreis !== undefined
                      ? `Vorschlag: Erinnerungswert ${euroFormat(stufe.festpreis)} bei schlechtem Zustand`
                      : `Vorschlag: Höchstwert ${euroFormat(hoechstwert)} × ${zahlDe(stufe.faktor)} (${zustand})`}
              </span>
            </>
          )}
        </div>
      </div>

      <WarnListe hinweise={vorschauHinweise} />

      {richtlinie.length > 0 && (
        <details className="details">
          <summary>Richtlinie</summary>
          {richtlinie.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </details>
      )}

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

      {frage && onLoeschen && (
        <Rueckfrage
          titel="Position löschen?"
          text={`„${bezeichnung.trim() || bearbeiten?.bezeichnung}“ wird aus der Liste entfernt. Das lässt sich nicht rückgängig machen.`}
          onAbbrechen={() => setFrage(false)}
          onBestaetigen={onLoeschen}
        />
      )}
    </div>
  )
}
