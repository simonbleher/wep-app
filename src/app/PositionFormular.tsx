// Formular einer Position (Außenanlagen / Aufwuchs): Bezeichnung, Anzahl, Einheit,
// Zustand, Preis (Vorschlag oder überschrieben). Dient zum Hinzufügen und – mit
// `bearbeiten` – zum Ändern einer vorhandenen Position, dann mit „Löschen“ unten.
import { useId, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import type { Position, Wep } from '@/model'
import { ZUSTANDSSTUFEN } from '@/model'
import type { EigenePosition, Position as KatalogPosition, Variante as KatalogVariante } from '@/katalog'
import { berechnePreisvorschlag } from '@/gruen/preisvorschlag'
import { berechneRegelhinweise } from '@/gruen/regelhinweise'
import { OBST_ID, formAusBezeichnung, obstBezeichnung, obstHoechstwert, staffelSeite, OBST_ALTER } from '@/gruen/baumMass'
import { kurzeBezeichnung, leseZahl, leseZahlOder, variantenMerkmale, zahlDe, zahlFuerEingabe } from '@/gruen/format'
import { INVASIVE_ARTEN, KATALOG_POSITIONEN, PROBLEMPFLANZEN } from './katalogDaten'
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
  /** Gemerkte eigene Position (Freitext mit Bezeichnung, Einheit und Preis vorbelegt) */
  eigene?: EigenePosition
}

/** Was „als eigene Position merken“ speichern soll (der Abschnitt kommt von der Suche). */
export interface MerkeDaten {
  bezeichnung: string
  einheit: string
  /** Nur, wenn ein eigener Preis eingetragen ist */
  einzelpreis?: number
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
  fotos,
}: {
  auswahl: Auswahl
  wep: Wep
  /** Vorhandene Position ändern statt neu anlegen */
  bearbeiten?: Position
  onFertig: (pos: Position, merken?: MerkeDaten) => void
  /** Nur beim Ändern: Position nach der Rückfrage löschen */
  onLoeschen?: () => void
  /** Fotos dieser Position (nur beim Ändern); werden sofort gespeichert, unabhängig von „Speichern“. */
  fotos?: ReactNode
}) {
  const { position: katalogPos, variante, art, eigene } = auswahl
  const id = useId()

  // Obstgehölze: Baumform + Alter in Jahren → Altersstufe und Höchstwert (BewRL S. 16). Ältere Positionen ohne
  // Baumform: Form aus der Bezeichnung lesen; ohne Alter bleibt ihr bisheriger Höchstwert.
  const obstVarianten = KATALOG_POSITIONEN.find((p) => p.id === OBST_ID)?.varianten ?? []
  const istObst = (bearbeiten ? bearbeiten.katalogId : katalogPos?.id) === OBST_ID
  const baumform = istObst
    ? (bearbeiten?.baumform ?? (bearbeiten ? formAusBezeichnung(obstVarianten, bearbeiten.bezeichnung) : variante?.form))
    : undefined
  const [alter, setAlter] = useState(bearbeiten?.alterJahre !== undefined ? zahlFuerEingabe(bearbeiten.alterJahre) : '')
  const alterZahl = alter.trim() ? leseZahl(alter) : undefined
  const alterGueltig = alterZahl !== undefined && Number.isFinite(alterZahl) && alterZahl >= 0 ? Math.floor(alterZahl) : undefined
  const mitAlter = istObst && Boolean(baumform)
  const hoechstwert = mitAlter
    ? alterGueltig !== undefined
      ? obstHoechstwert(obstVarianten, baumform, alterGueltig)
      : bearbeiten && !bearbeiten.baumform
        ? bearbeiten.hoechstwert // ältere Position: unverändert, nur Hinweis
        : undefined
    : bearbeiten
      ? bearbeiten.hoechstwert
      : (variante?.hoechstwert ?? katalogPos?.hoechstwert)
  // Baumform und Alter mitspeichern – bei einer älteren Position erst, wenn ein Alter eingetragen ist (sonst bleibt sie unverändert)
  const formSpeichern = mitAlter && (!bearbeiten || Boolean(bearbeiten.baumform) || alterGueltig !== undefined)
  // Name vor Form/Alter, z. B. „Apfel“ aus „Apfel, Halbstamm, 12 J.“
  const obstName = bearbeiten ? bearbeiten.bezeichnung.split(',')[0]!.trim() : (art ?? 'Obstgehölz')

  const [bezeichnung, setBezeichnung] = useState(
    bearbeiten?.bezeichnung ??
      (katalogPos ? (mitAlter ? obstBezeichnung(obstName, baumform, undefined) : kurzeBezeichnung(katalogPos, variante, art)) : (eigene?.bezeichnung ?? '')),
  )
  // Bezeichnung folgt dem Alter, solange sie nicht von Hand geändert wurde
  const [bezeichnungEigen, setBezeichnungEigen] = useState(false)
  function aendereAlter(wert: string) {
    setAlter(wert)
    if (bezeichnungEigen) return
    const n = wert.trim() ? leseZahl(wert) : undefined
    setBezeichnung(obstBezeichnung(obstName, baumform, n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined))
  }
  const [anzahl, setAnzahl] = useState(bearbeiten ? zahlFuerEingabe(bearbeiten.anzahl) : '1')
  const [einheit, setEinheit] = useState<string>(bearbeiten?.einheit ?? katalogPos?.einheit ?? eigene?.einheit ?? 'Stück')
  const [zustand, setZustand] = useState<Zustand | undefined>(bearbeiten ? bearbeiten.zustand : 'gut')
  // Eine Position, deren Preis vom Vorschlag abweicht, bleibt beim Ändern ein eigener Preis
  const [preisManuell, setPreisManuell] = useState(
    bearbeiten
      ? bearbeiten.preisManuell || Math.abs(berechnePreisvorschlag(bearbeiten) - bearbeiten.einzelpreis) >= 0.005
      : eigene?.einzelpreis !== undefined,
  )
  const [preisEingabe, setPreisEingabe] = useState(
    bearbeiten && preisManuell
      ? zahlFuerEingabe(bearbeiten.einzelpreis)
      : eigene?.einzelpreis !== undefined
        ? zahlFuerEingabe(eigene.einzelpreis)
        : '',
  )
  // Freitext neu anlegen: optional als eigene Position merken (Standard an)
  const merkenMoeglich = !katalogPos && !bearbeiten && !eigene
  const [merken, setMerken] = useState(true)
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
    ...(formSpeichern ? { baumform, alterJahre: alterGueltig } : {}),
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
    PROBLEMPFLANZEN,
  )
  // Richtlinien-Erläuterungen stehen nur hier im Formular, nicht in der Positionsliste
  const richtlinie = [katalogPos?.regeln, ...vorschauHinweise.filter((h) => h.schwere === 'info').map((h) => h.text)].filter(
    (t, i, alle): t is string => Boolean(t) && alle.indexOf(t) === i,
  )

  const stufe = zustand ? ZUSTANDSSTUFEN[zustand] : undefined
  // Außenanlagen: Die Alterswertminderung (S. 12) steckt im Zustand, ein Alter wird nicht erfasst
  const istAussenanlage = (bearbeiten?.katalogId ?? katalogPos?.id)?.startsWith('aa-') ?? false
  const einheiten = EINHEITEN.includes(einheit) ? EINHEITEN : [...EINHEITEN, einheit]
  const ungueltig =
    !bezeichnung.trim() ||
    !(leseZahl(anzahl) > 0) ||
    (alter.trim() !== '' && alterGueltig === undefined) ||
    (preisManuell && !Number.isFinite(leseZahl(preisEingabe)))

  function bestaetigen() {
    onFertig(
      {
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
        ...(formSpeichern ? { baumform, alterJahre: alterGueltig } : {}),
      },
      merkenMoeglich && merken
        ? { bezeichnung: bezeichnung.trim(), einheit, einzelpreis: preisManuell ? einzelpreis : undefined }
        : undefined,
    )
  }

  return (
    <div className="formular formular-pos">
      {katalogPos ? (
        <p className="neben quelle">
          Katalog: {katalogPos.bezeichnung}
          {variante ? ` · ${variantenMerkmale(variante)}` : ''} · BewRL S. {katalogPos.seite}
        </p>
      ) : (
        <p className="neben quelle">{eigene ? 'Eigene Position (gemerkt)' : 'Eigene Position (Freitext)'}</p>
      )}

      <div className="feld">
        <label className="label" htmlFor={`${id}-bez`}>
          Bezeichnung (steht so im Protokoll)
        </label>
        <input
          id={`${id}-bez`}
          className="eingabe"
          value={bezeichnung}
          placeholder="z. B. Kirschbaum, alt"
          autoFocus={!katalogPos && !bearbeiten && !eigene}
          onChange={(e) => {
            setBezeichnung(e.target.value)
            setBezeichnungEigen(true)
          }}
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

      {mitAlter && (
        <div className="feld">
          <label className="label" htmlFor={`${id}-alter`}>
            Alter in Jahren (Pflichtangabe)
          </label>
          <input
            id={`${id}-alter`}
            className="eingabe"
            inputMode="numeric"
            value={alter}
            placeholder="z. B. 12"
            autoFocus={!bearbeiten}
            onChange={(e) => aendereAlter(e.target.value)}
          />
          <span className="neben">
            {alterGueltig !== undefined
              ? `${baumform}, ${zahlDe(alterGueltig)} Jahre → bis ${euroFormat(hoechstwert ?? 0)} (BewRL S. ${OBST_ALTER.seite})`
              : alter.trim()
                ? 'Bitte das Alter als Zahl eintragen.'
                : `${baumform}: Altersstufe und Höchstwert ergeben sich aus dem Alter (${staffelSeite(OBST_ALTER)}).`}
          </span>
        </div>
      )}

      <fieldset className="feld fieldset">
        <legend className="label">Zustand</legend>
        {istAussenanlage && <span className="neben">Alter und Abnutzung über den Zustand berücksichtigen – mind. 3 % je Jahr (BewRL S. 12).</span>}
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
                {katalogPos?.id === 'aw-baum-geschuetzt' || vorschauPos.katalogId === 'aw-baum-geschuetzt'
                  ? 'Geschützter Baum: fest 1,00 € je Stück, unabhängig vom Zustand (BewRL S. 16).'
                  : mitAlter && alterGueltig === undefined && hoechstwert === undefined
                  ? 'Maß fehlt: Alter eintragen, dann erscheint der Vorschlag.'
                  : stufe?.festpreis !== undefined
                  ? `Vorschlag: Erinnerungswert ${euroFormat(stufe.festpreis)} bei schlechtem Zustand`
                  : hoechstwert === undefined
                    ? 'Kein Höchstwert im Katalog – Preis bitte über „Überschreiben“ eintragen.'
                    : !stufe || !zustand
                      ? 'Zustand wählen, dann erscheint der Vorschlag.'
                      : `Vorschlag: Höchstwert ${euroFormat(hoechstwert)} × ${zahlDe(stufe.faktor)} (${zustand})`}
              </span>
            </>
          )}
        </div>
      </div>

      {merkenMoeglich && (
        <div>
          <label className="schalter-zeile" htmlFor={`${id}-merken`}>
            <span>Als eigene Position merken</span>
            <input
              id={`${id}-merken`}
              type="checkbox"
              role="switch"
              className="schalter"
              checked={merken}
              onChange={(e) => setMerken(e.target.checked)}
            />
          </label>
          <p className="neben">Erscheint künftig in der Suche und wird mit deinen anderen Geräten abgeglichen.</p>
        </div>
      )}

      <WarnListe hinweise={vorschauHinweise} />

      {richtlinie.length > 0 && (
        <details className="details">
          <summary>Richtlinie</summary>
          {richtlinie.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </details>
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
