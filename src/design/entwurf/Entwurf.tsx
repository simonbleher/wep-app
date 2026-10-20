// Design-Entwurf (Beta 2, Schritt 4): drei Bildschirme mit erfundenen Daten.
// Nur Vorschau – die echte App (src/app) bleibt unverändert.
//
// URL-Parameter (für Screenshots und Links):
//   ?b=liste | aufwuchs | suche | formular   Bildschirm bzw. Schritt
//   &leiste=0                                 Vorschau-Leiste ausblenden
//   &thema=hell | dunkel                      Farbschema erzwingen

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CircleUser,
  Fence,
  FileSpreadsheet,
  FileText,
  PencilRuler,
  Plus,
  Search,
  Shovel,
  Sprout,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Katalog, Position as KatalogPosition, Variante as KatalogVariante } from '@/katalog'
import { sucheKatalog } from '@/katalog'
import { ZUSTANDSSTUFEN } from '@/model'
import { berechnePreisvorschlag } from '@/gruen/preisvorschlag'
import { gefundeneArt, kurzeBezeichnung, leseZahlOder, variantenMerkmale } from '@/gruen/format'
import katalogRaw from '../../../data/katalog.json'
import {
  ABSCHNITTE,
  AUFWUCHS,
  KONTO,
  WEPS,
  euro,
  summe,
  zahl,
  type AbschnittId,
} from './daten'

const KATALOG_AUFWUCHS = (katalogRaw as unknown as Katalog).positionen.filter(
  (p) => p.abschnitt === 'III. Aufwuchs',
)

type Bildschirm = 'liste' | 'aufwuchs' | 'hinzufuegen'
type Schritt = 'suche' | 'formular'
type Zustand = keyof typeof ZUSTANDSSTUFEN

const ICON = { size: 22, strokeWidth: 1.75, 'aria-hidden': true } as const

const ABSCHNITT_ICONS: Record<AbschnittId, LucideIcon> = {
  formalien: FileText,
  aussenanlagen: Fence,
  aufwuchs: Sprout,
  beseitigung: Shovel,
  skizze: PencilRuler,
}

function ausUrl() {
  const p = new URLSearchParams(window.location.search)
  const b = p.get('b')
  return {
    bildschirm: (b === 'aufwuchs' ? 'aufwuchs' : b === 'suche' || b === 'formular' ? 'hinzufuegen' : 'liste') as Bildschirm,
    schritt: (b === 'formular' ? 'formular' : 'suche') as Schritt,
    leiste: p.get('leiste') !== '0',
    thema: p.get('thema'),
  }
}

export function Entwurf() {
  const start = useMemo(ausUrl, [])
  const [bildschirm, setBildschirm] = useState<Bildschirm>(start.bildschirm)
  const [dunkel, setDunkel] = useState(start.thema === 'dunkel')

  useEffect(() => {
    document.documentElement.dataset.thema = dunkel ? 'dunkel' : 'hell'
  }, [dunkel])

  return (
    <>
      {start.leiste && (
        <div className="v-leiste" role="toolbar" aria-label="Entwurf: Bildschirm wählen">
          <span className="v-titel">Entwurf</span>
          {(
            [
              ['liste', 'WEP-Liste'],
              ['aufwuchs', 'Erfassung Aufwuchs'],
              ['hinzufuegen', 'Position hinzufügen'],
            ] as const
          ).map(([b, text]) => (
            <button
              key={b}
              type="button"
              className="v-knopf"
              aria-pressed={bildschirm === b}
              onClick={() => setBildschirm(b)}
            >
              {text}
            </button>
          ))}
          <button type="button" className="v-knopf v-thema" aria-pressed={dunkel} onClick={() => setDunkel(!dunkel)}>
            Dunkel
          </button>
        </div>
      )}
      {bildschirm === 'liste' && <WepListe onOeffnen={() => setBildschirm('aufwuchs')} />}
      {bildschirm === 'aufwuchs' && (
        <ErfassungAufwuchs
          onZurueck={() => setBildschirm('liste')}
          onHinzufuegen={() => setBildschirm('hinzufuegen')}
        />
      )}
      {bildschirm === 'hinzufuegen' && (
        <PositionHinzufuegen startSchritt={start.schritt} onFertig={() => setBildschirm('aufwuchs')} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// 1. WEP-Liste (Startseite)
// ---------------------------------------------------------------------------

function StatusZeile() {
  return (
    <div className="e-status" aria-live="polite">
      <span>
        {KONTO}
        <br />
        Abgeglichen um 14:32
        <br />1 Änderung wartet auf Upload
      </span>
      <button type="button" className="e-textknopf">
        Abgleichen
      </button>
    </div>
  )
}

function WepListe({ onOeffnen }: { onOeffnen: () => void }) {
  return (
    <div className="e-rahmen">
      <aside className="e-seitenleiste" aria-label="Navigation">
        <div className="e-sl-app">WEP</div>
        <nav className="e-sl-nav">
          <button type="button" className="e-sl-eintrag" aria-current="page">
            <FileText {...ICON} />
            <span>Protokolle</span>
          </button>
          <button type="button" className="e-sl-eintrag">
            <CircleUser {...ICON} />
            <span>Profil und Einstellungen</span>
          </button>
        </nav>
        <div className="e-sl-fuss">
          <StatusZeile />
        </div>
      </aside>

      <main className="e-inhalt">
        <header className="e-seitenkopf">
          <h1 className="e-h1">Protokolle</h1>
          <button type="button" className="e-symbolknopf nur-handy" aria-label="Profil und Einstellungen">
            <CircleUser {...ICON} size={26} />
          </button>
          <button type="button" className="e-knopf e-knopf-primaer nur-tablet">
            <Plus {...ICON} />
            Neues WEP
          </button>
        </header>

        <div className="nur-handy e-block">
          <StatusZeile />
          <button type="button" className="e-knopf e-knopf-primaer e-knopf-breit">
            <Plus {...ICON} />
            Neues WEP
          </button>
        </div>

        <ul className="e-liste" aria-label="Protokolle">
          {WEPS.map((w) => {
            const titel = [w.anlage, w.parzelle].filter(Boolean).join(' · ')
            const neben = [w.id, w.unterpaechter, w.datum].filter(Boolean).join(' · ')
            return (
              <li key={w.id}>
                <button type="button" className="e-zeile" onClick={onOeffnen}>
                  <span className="e-zeile-text">
                    <span className={titel ? 'e-zeile-titel' : 'e-zeile-titel e-leer'}>
                      {titel || 'ohne Bezeichnung'}
                    </span>
                    <span className="e-zeile-neben">{neben}</span>
                  </span>
                  <ChevronRight {...ICON} className="e-chevron" />
                </button>
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rahmen der Erfassung: Seitenleiste (Tablet) bzw. Kopf + untere Leiste (Handy)
// ---------------------------------------------------------------------------

function WepSeitenleiste({ aktiv, onZurueck }: { aktiv: AbschnittId; onZurueck: () => void }) {
  return (
    <aside className="e-seitenleiste" aria-label="Abschnitte">
      <button type="button" className="e-zurueck" onClick={onZurueck}>
        <ChevronLeft {...ICON} />
        Protokolle
      </button>
      <div className="e-sl-wep">
        <span className="e-sl-wep-titel">Parzelle 42</span>
        <span className="e-zeile-neben">KGA Testgarten · 2026-007</span>
      </div>
      <nav className="e-sl-nav">
        {ABSCHNITTE.map((a) => {
          const Icon = ABSCHNITT_ICONS[a.id]
          return (
            <button key={a.id} type="button" className="e-sl-eintrag" aria-current={a.id === aktiv ? 'page' : undefined}>
              <Icon {...ICON} />
              <span>{a.titel}</span>
              {a.summe !== undefined && <span className="e-zahl e-sl-summe">{euro(a.summe)}</span>}
            </button>
          )
        })}
      </nav>
      <nav className="e-sl-nav e-sl-trenner">
        <button type="button" className="e-sl-eintrag">
          <FileSpreadsheet {...ICON} />
          <span>Export als Excel</span>
        </button>
      </nav>
    </aside>
  )
}

function UntereLeiste({ aktiv }: { aktiv: AbschnittId }) {
  return (
    <nav className="e-unten nur-handy" aria-label="Abschnitte">
      {ABSCHNITTE.map((a) => {
        const Icon = ABSCHNITT_ICONS[a.id]
        return (
          <button key={a.id} type="button" className="e-unten-knopf" aria-label={a.titel} aria-current={a.id === aktiv ? 'page' : undefined}>
            <Icon {...ICON} />
            <span>{a.kurz}</span>
          </button>
        )
      })}
    </nav>
  )
}

function WepKopf({ links, rechts }: { links: ReactNode; rechts?: ReactNode }) {
  return (
    <header className="e-kopf nur-handy">
      <div className="e-kopf-links">{links}</div>
      <div className="e-kopf-mitte">
        <span className="e-kopf-titel">Parzelle 42</span>
        <span className="e-kopf-unter">KGA Testgarten</span>
      </div>
      <div className="e-kopf-rechts">{rechts}</div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// 2. Erfassung Aufwuchs
// ---------------------------------------------------------------------------

function ErfassungAufwuchs({ onZurueck, onHinzufuegen }: { onZurueck: () => void; onHinzufuegen: () => void }) {
  return (
    <div className="e-rahmen e-mit-unten">
      <WepSeitenleiste aktiv="aufwuchs" onZurueck={onZurueck} />

      <main className="e-inhalt">
        <WepKopf
          links={
            <button type="button" className="e-zurueck" onClick={onZurueck}>
              <ChevronLeft {...ICON} />
              Protokolle
            </button>
          }
          rechts={
            <button type="button" className="e-textknopf">
              Export
            </button>
          }
        />

        <header className="e-seitenkopf">
          <div>
            <h1 className="e-h1">Aufwuchs</h1>
            <p className="e-zeile-neben">{AUFWUCHS.length} Positionen</p>
          </div>
          <button type="button" className="e-knopf e-knopf-primaer" onClick={onHinzufuegen}>
            <Plus {...ICON} />
            Hinzufügen
          </button>
        </header>

        <button type="button" className="e-zeile e-feldzeile">
          <span className="e-zeile-text">
            <span className="e-zeile-titel">Beschreibung</span>
            <span className="e-zeile-neben e-einzeilig">
              Gepflegter Obst- und Ziergarten, Rasen mit Wildkräutern, Hecke zum Weg
            </span>
          </span>
          <ChevronRight {...ICON} className="e-chevron" />
        </button>

        <div className="e-tabelle" role="table" aria-label="Positionen Aufwuchs">
          <div className="e-pos e-pos-kopf nur-tablet" role="row">
            <span role="columnheader" className="e-zahl">Anzahl</span>
            <span role="columnheader">Einheit</span>
            <span role="columnheader">Bezeichnung</span>
            <span role="columnheader">Zustand</span>
            <span role="columnheader" className="e-zahl">Einzelpreis</span>
            <span role="columnheader" className="e-zahl">Summe</span>
          </div>
          {AUFWUCHS.map((p) => (
            <div key={p.id} className="e-pos-gruppe" role="rowgroup">
              <button type="button" className="e-pos" role="row">
                <span role="cell" className="e-zahl c-anzahl">{zahl(p.anzahl)}</span>
                <span role="cell" className="c-einheit">{p.einheit}</span>
                <span role="cell" className="c-bez">
                  {p.bezeichnung}
                  <span className="c-neben nur-handy">
                    {zahl(p.anzahl)}{'\u00a0'}{p.einheit} · {p.zustand} · je {euro(p.einzelpreis)}
                    {p.manuell ? ' · manuell' : ''}
                  </span>
                </span>
                <span role="cell" className="c-zustand">{p.zustand}</span>
                <span role="cell" className="e-zahl c-preis">
                  {euro(p.einzelpreis)}
                  {p.manuell && <span className="c-manuell">manuell</span>}
                </span>
                <span role="cell" className="e-zahl c-summe">{euro(p.anzahl * p.einzelpreis)}</span>
              </button>
              {p.warnung && (
                <p className="e-warnung" role="note">
                  <TriangleAlert {...ICON} size={20} />
                  <span>{p.warnung}</span>
                </p>
              )}
            </div>
          ))}
          <div className="e-summe" role="row">
            <span role="cell">Summe Aufwuchs</span>
            <span role="cell" className="e-zahl">{euro(summe(AUFWUCHS))}</span>
          </div>
        </div>

        <button type="button" className="e-zeile e-zeile-akzent" onClick={onHinzufuegen}>
          <Plus {...ICON} />
          <span className="e-zeile-titel">Position hinzufügen</span>
        </button>
      </main>

      <UntereLeiste aktiv="aufwuchs" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Position hinzufügen (Suche → Formular)
// ---------------------------------------------------------------------------

interface Auswahl {
  position?: KatalogPosition
  variante?: KatalogVariante
  art?: string
}

function trefferText(a: Auswahl): string {
  if (!a.position) return ''
  return a.variante ? kurzeBezeichnung(a.position, a.variante, a.art) : a.position.bezeichnung
}

/** Ein Suchtreffer mit allen Varianten: Die Varianten stehen gleich in der Liste. */
interface TrefferGruppe {
  position: KatalogPosition
  art?: string
  eintraege: Auswahl[]
}

function gruppiere(suchbegriff: string): TrefferGruppe[] {
  return sucheKatalog(KATALOG_AUFWUCHS, suchbegriff, { limit: 8 }).map((t) => {
    const art = gefundeneArt(t.position, suchbegriff)
    const varianten = t.variante ? [t.variante] : (t.position.varianten ?? [undefined])
    return {
      position: t.position,
      art,
      eintraege: varianten.map((variante) => ({ position: t.position, variante, art })),
    }
  })
}

const schluessel = (a: Auswahl) => `${a.position?.id}|${JSON.stringify(a.variante ?? '')}`

function PositionHinzufuegen({ startSchritt, onFertig }: { startSchritt: Schritt; onFertig: () => void }) {
  const [schritt, setSchritt] = useState<Schritt>(startSchritt)
  const [suchbegriff, setSuchbegriff] = useState('apfel')
  const gruppen = gruppiere(suchbegriff)
  const anzahlTreffer = gruppen.reduce((n, g) => n + g.eintraege.length, 0)

  // Vorauswahl für den Entwurf: Apfel, Halbstamm, 5–30 J.
  const [auswahl, setAuswahl] = useState<Auswahl | null>(
    () =>
      gruppiere('apfel')
        .flatMap((g) => g.eintraege)
        .find((e) => e.variante?.form === 'Halbstamm' && e.variante.altersstufe === '5 bis 30 Jahre') ?? null,
  )

  const waehle = (a: Auswahl | null) => {
    setAuswahl(a)
    setSchritt('formular')
  }

  return (
    <div className="e-rahmen e-hinzufuegen" data-schritt={schritt}>
      <WepSeitenleiste aktiv="aufwuchs" onZurueck={onFertig} />

      <main className="e-inhalt e-inhalt-breit">
        {/* Handy: eigener Kopf je Schritt */}
        <header className="e-kopf nur-handy">
          <div className="e-kopf-links">
            {schritt === 'suche' ? (
              <button type="button" className="e-textknopf" onClick={onFertig}>
                Abbrechen
              </button>
            ) : (
              <button type="button" className="e-zurueck" onClick={() => setSchritt('suche')}>
                <ChevronLeft {...ICON} />
                Suche
              </button>
            )}
          </div>
          <div className="e-kopf-mitte">
            <span className="e-kopf-titel">Position hinzufügen</span>
            <span className="e-kopf-unter">Aufwuchs</span>
          </div>
          <div className="e-kopf-rechts" />
        </header>

        <header className="e-seitenkopf nur-tablet">
          <h1 className="e-h1">Position hinzufügen</h1>
          <button type="button" className="e-knopf" onClick={onFertig}>
            Abbrechen
          </button>
        </header>

        <div className="e-split">
          <section className="e-split-suche" aria-label="Suche im Katalog">
            <div className="e-suchfeld">
              <Search {...ICON} className="e-suchfeld-icon" />
              <input
                type="search"
                className="e-eingabe"
                aria-label="Katalog durchsuchen"
                placeholder="Pflanze oder Bezeichnung"
                value={suchbegriff}
                onChange={(e) => setSuchbegriff(e.target.value)}
                enterKeyHint="search"
                autoComplete="off"
              />
              {suchbegriff && (
                <button type="button" className="e-symbolknopf e-suchfeld-leeren" aria-label="Suche leeren" onClick={() => setSuchbegriff('')}>
                  <X {...ICON} />
                </button>
              )}
            </div>

            <p className="e-gruppenkopf">
              {suchbegriff ? `${anzahlTreffer} Treffer im Katalog` : 'Häufig verwendet'}
            </p>
            {gruppen.map((g) => (
              <div key={g.position.id} className="e-treffergruppe">
                {g.eintraege.length > 1 && (
                  <p className="e-gruppentitel">
                    {g.art ? `${g.art} – ` : ''}
                    {g.position.bezeichnung}
                    <span className="e-zeile-neben"> · BewRL S. {g.position.seite}</span>
                  </p>
                )}
                <ul className="e-liste">
                  {g.eintraege.map((e) => {
                    const hoechst = e.variante?.hoechstwert ?? e.position?.hoechstwert
                    const aktiv = auswahl !== null && schluessel(auswahl) === schluessel(e)
                    return (
                      <li key={schluessel(e)}>
                        <button type="button" className="e-zeile" aria-current={aktiv ? 'true' : undefined} onClick={() => waehle(e)}>
                          <span className="e-zeile-text">
                            <span className="e-zeile-titel">{trefferText(e)}</span>
                            {g.eintraege.length === 1 && (
                              <span className="e-zeile-neben">{g.position.kategorie}</span>
                            )}
                          </span>
                          {hoechst !== undefined && <span className="e-zahl e-zeile-neben">bis {euro(hoechst)}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            <ul className="e-liste e-liste-frei">
              <li>
                <button type="button" className="e-zeile e-zeile-akzent" aria-current={auswahl === null ? 'true' : undefined} onClick={() => waehle(null)}>
                  <Plus {...ICON} />
                  <span className="e-zeile-titel">Eigene Position (Freitext)</span>
                </button>
              </li>
            </ul>
          </section>

          <section className="e-split-formular" aria-label="Position">
            <PositionFormular key={auswahl ? schluessel(auswahl) : 'frei'} auswahl={auswahl ?? {}} onHinzufuegen={onFertig} />
          </section>
        </div>
      </main>
    </div>
  )
}

const EINHEITEN = ['Stück', 'm', 'm²', 'm³', 'lfdm', 'Pauschale']
const ZUSTAENDE = Object.keys(ZUSTANDSSTUFEN) as Zustand[]

function PositionFormular({ auswahl, onHinzufuegen }: { auswahl: Auswahl; onHinzufuegen: () => void }) {
  const { position, variante } = auswahl
  const hoechstwert = variante?.hoechstwert ?? position?.hoechstwert
  const [bezeichnung, setBezeichnung] = useState(trefferText(auswahl))
  const [anzahl, setAnzahl] = useState('2')
  const [einheit, setEinheit] = useState<string>(position?.einheit ?? 'Stück')
  const [zustand, setZustand] = useState<Zustand>('gut')
  const [ueberschrieben, setUeberschrieben] = useState<string | null>(null)

  const vorschlag = berechnePreisvorschlag({
    id: 'vorschau',
    bezeichnung,
    anzahl: 1,
    einheit,
    zustand,
    hoechstwert,
    einzelpreis: 0,
    preisManuell: false,
    hinweise: [],
  })
  const preis = ueberschrieben === null ? vorschlag : leseZahlOder(ueberschrieben, 0)
  const gesamt = leseZahlOder(anzahl, 0) * preis
  const stufe = ZUSTANDSSTUFEN[zustand]

  return (
    <div className="e-formular">
      {position && (
        <p className="e-zeile-neben e-quelle">
          Katalog: {position.bezeichnung}
          {variante ? ` · ${variantenMerkmale(variante)}` : ''} · BewRL S. {position.seite}
        </p>
      )}

      <div className="e-feld">
        <label className="e-label" htmlFor="f-bez">Bezeichnung</label>
        <input id="f-bez" className="e-eingabe" value={bezeichnung} placeholder="z. B. Kirschbaum, alt" onChange={(e) => setBezeichnung(e.target.value)} />
      </div>

      <div className="e-feld-reihe">
        <div className="e-feld">
          <label className="e-label" htmlFor="f-anz">Anzahl</label>
          <input id="f-anz" className="e-eingabe e-zahl" inputMode="decimal" value={anzahl} onChange={(e) => setAnzahl(e.target.value)} />
        </div>
        <div className="e-feld">
          <label className="e-label" htmlFor="f-einh">Einheit</label>
          <select id="f-einh" className="e-eingabe" value={einheit} onChange={(e) => setEinheit(e.target.value)}>
            {EINHEITEN.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="e-feld e-fieldset">
        <legend className="e-label">Zustand</legend>
        <div className="e-segmente">
          {ZUSTAENDE.map((z) => (
            <button key={z} type="button" className="e-segment" aria-pressed={z === zustand} onClick={() => setZustand(z)}>
              {z}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="e-feld">
        <span className="e-label" id="f-preis-label">Einzelpreis</span>
        <div className="e-preis">
          {ueberschrieben === null ? (
            <>
              <div className="e-preis-zeile">
                <span className="e-preis-wert e-zahl" aria-labelledby="f-preis-label">{euro(vorschlag)}</span>
                <button type="button" className="e-knopf" onClick={() => setUeberschrieben(zahl(vorschlag).replace(/\./g, ''))}>
                  Überschreiben
                </button>
              </div>
              <span className="e-zeile-neben">
                {hoechstwert === undefined
                  ? 'Kein Höchstwert im Katalog – Preis bitte eintragen.'
                  : stufe.festpreis !== undefined
                    ? `Vorschlag: Erinnerungswert bei schlechtem Zustand`
                    : `Vorschlag: Höchstwert ${euro(hoechstwert)} × ${zahl(stufe.faktor)} (${zustand})`}
              </span>
            </>
          ) : (
            <>
              <div className="e-preis-zeile">
                <div className="e-euro-eingabe">
                  <input
                    className="e-eingabe e-zahl"
                    inputMode="decimal"
                    aria-labelledby="f-preis-label"
                    value={ueberschrieben}
                    onChange={(e) => setUeberschrieben(e.target.value)}
                    autoFocus
                  />
                  <span aria-hidden="true">€</span>
                </div>
                <button type="button" className="e-textknopf" onClick={() => setUeberschrieben(null)}>
                  Vorschlag {euro(vorschlag)}
                </button>
              </div>
              <span className="e-zeile-neben">Eigener Preis – wird im WEP als „manuell“ vermerkt.</span>
            </>
          )}
        </div>
      </div>

      {position?.regeln && (
        <details className="e-details">
          <summary>Richtlinie</summary>
          <p>{position.regeln}</p>
        </details>
      )}

      <div className="e-formular-fuss">
        <div className="e-summe e-summe-klein">
          <span>Gesamt</span>
          <span className="e-zahl">{euro(gesamt)}</span>
        </div>
        <button type="button" className="e-knopf e-knopf-primaer e-knopf-breit" onClick={onHinzufuegen}>
          Hinzufügen
        </button>
      </div>
    </div>
  )
}
