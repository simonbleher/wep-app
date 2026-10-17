// WepDetail – vollständige Erfassungsmaske für ein Wertermittlungsprotokoll.
//
// Abschnitte (Tabs): Formalien | Außenanlagen | Aufwuchs | Beseitigung | Export
// Jede Änderung wird sofort in IndexedDB gespeichert.
// Mobile-optimiert: große Touch-Ziele, hoher Kontrast (CLAUDE.md).

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useId,
  type ChangeEvent,
} from 'react'
import type {
  Wep,
  Position,
  BeseitigungsPosition,
  Formalien,
  Hinweis,
} from '@/model'
import { ZUSTANDSSTUFEN } from '@/model'
// Katalog-Typen aus @/katalog (kompatibel mit sucheKatalog / istInvasiv)
import type {
  Position as KatalogPosition,
  Variante as KatalogVariante,
  InvasiveListe,
} from '@/katalog'
import { sucheKatalog } from '@/katalog'
import { ladeWep, speichereWep } from './db'
import { SkizzeTab } from './SkizzeTab'
import { skizzeAlsPng } from '@/skizze/skizzePng'
import { exportWep, type ExportResult } from '@/export'
import { berechnePreisvorschlag } from '@/gruen/preisvorschlag'
import { berechneRegelhinweise } from '@/gruen/regelhinweise'
import { berechneAbschnittSumme } from '@/gruen/summen'
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

// Statische Daten (wird einmalig beim Modulladen gelesen)
import katalogRaw from '../../data/katalog.json'
import invasiveRaw from '../../data/invasive.json'
import type { Katalog } from '@/katalog'

const KATALOG_POSITIONEN = (katalogRaw as unknown as Katalog).positionen
const INVASIVE_ARTEN = (invasiveRaw as unknown as InvasiveListe).arten

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

type Tab = 'formalien' | 'aussenanlagen' | 'aufwuchs' | 'beseitigung' | 'skizze' | 'export'

type Abschnitt = 'aussenanlagen' | 'aufwuchs'

/** Zustand des „Position hinzufügen"-Dialogs für Außenanlagen/Aufwuchs. */
type HinzufuegenDialog =
  | { schritt: 'suche'; abschnitt: Abschnitt }
  | {
      schritt: 'variante'
      abschnitt: Abschnitt
      katalogPos: KatalogPosition
      /** Über die Suche gefundene Art, z. B. „Liguster“ bei der Hecke */
      art?: string
    }
  | {
      schritt: 'formular'
      abschnitt: Abschnitt
      katalogPos?: KatalogPosition
      variante?: KatalogVariante
      art?: string
    }

type ExportZustand =
  | { typ: 'idle' }
  | { typ: 'laedt' }
  | { typ: 'fertig'; result: ExportResult }
  | { typ: 'fehler'; meldung: string }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  wepId: string
  onZurueck: () => void
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function neuePositionId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function neueBeseitigungsId(): string {
  return `bes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function euroFormat(wert: number): string {
  return wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export function WepDetail({ wepId, onZurueck }: Props) {
  const [wep, setWep] = useState<Wep | null>(null)
  const [aktuellerTab, setAktuellerTab] = useState<Tab>('formalien')
  const [dialog, setDialog] = useState<HinzufuegenDialog | null>(null)
  const [exportZustand, setExportZustand] = useState<ExportZustand>({ typ: 'idle' })
  const bauExcelRef = useRef<File | null>(null)

  // WEP aus IndexedDB laden
  useEffect(() => {
    void ladeWep(wepId).then((geladen) => {
      if (geladen) setWep(geladen)
    })
  }, [wepId])

  // Speichert und aktualisiert den Zustand gleichzeitig
  const speichere = useCallback(async (neu: Wep): Promise<void> => {
    setWep(neu)
    await speichereWep(neu)
  }, [])

  if (!wep) {
    return (
      <main className="seite">
        <header className="kopf">
          <button type="button" className="btn btn-gross" onClick={onZurueck}>
            ← zurück
          </button>
        </header>
        <p className="hinweis">Lade …</p>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // Tab-Inhalt
  // ---------------------------------------------------------------------------

  return (
    <main className="seite">
      <header className="kopf">
        <button type="button" className="btn btn-gross" onClick={onZurueck}>
          ← zurück
        </button>
        <h1>WEP {wep.id}</h1>
      </header>

      {/* Tab-Navigation */}
      <TabLeiste aktiv={aktuellerTab} onChange={setAktuellerTab} />

      {/* Tab-Inhalte */}
      {aktuellerTab === 'formalien' && (
        <FormalienTab wep={wep} onSpeichern={speichere} />
      )}
      {aktuellerTab === 'aussenanlagen' && (
        <PositionenTab
          wep={wep}
          abschnitt="aussenanlagen"
          dialog={dialog}
          setDialog={setDialog}
          onSpeichern={speichere}
        />
      )}
      {aktuellerTab === 'aufwuchs' && (
        <PositionenTab
          wep={wep}
          abschnitt="aufwuchs"
          dialog={dialog}
          setDialog={setDialog}
          onSpeichern={speichere}
        />
      )}
      {aktuellerTab === 'beseitigung' && (
        <BeseitigungTab wep={wep} onSpeichern={speichere} />
      )}
      {aktuellerTab === 'skizze' && <SkizzeTab wep={wep} onSpeichern={speichere} />}
      {aktuellerTab === 'export' && (
        <ExportTab
          wep={wep}
          exportZustand={exportZustand}
          setExportZustand={setExportZustand}
          bauExcelRef={bauExcelRef}
        />
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Tab-Leiste
// ---------------------------------------------------------------------------

const TAB_LABELS: Record<Tab, string> = {
  formalien: 'Formalien',
  aussenanlagen: 'Außenanlagen',
  aufwuchs: 'Aufwuchs',
  beseitigung: 'Beseitigung',
  skizze: 'Skizze',
  export: 'Export',
}

function TabLeiste({
  aktiv,
  onChange,
}: {
  aktiv: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <nav className="tab-leiste" aria-label="Abschnitte">
      {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          className={`tab-btn${t === aktiv ? ' tab-btn-aktiv' : ''}`}
          onClick={() => onChange(t)}
          aria-current={t === aktiv ? 'page' : undefined}
        >
          {TAB_LABELS[t]}
        </button>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Formalien-Tab
// ---------------------------------------------------------------------------

function FormalienTab({
  wep,
  onSpeichern,
}: {
  wep: Wep
  onSpeichern: (wep: Wep) => Promise<void>
}) {
  function setFeld(key: keyof Formalien, wert: string | number) {
    const neu: Wep = {
      ...wep,
      formalien: { ...wep.formalien, [key]: wert },
    }
    void onSpeichern(neu)
  }

  const f = wep.formalien

  return (
    <section className="formular">
      <h2 className="abschnitt-titel">Formalien</h2>

      <Eingabe
        label="Kleingartenanlage"
        wert={f.kleingartenanlage}
        onChange={(v) => setFeld('kleingartenanlage', v)}
      />
      <Eingabe
        label="Parzelle"
        wert={f.parzelle}
        onChange={(v) => setFeld('parzelle', v)}
      />
      <Eingabe
        label="Weg (optional)"
        wert={f.weg ?? ''}
        onChange={(v) => setFeld('weg', v)}
      />
      <Eingabe
        label="Unterpächter"
        wert={f.unterpaechter}
        onChange={(v) => setFeld('unterpaechter', v)}
      />
      <ZahlEingabe
        label="Parzellenfläche (m²)"
        wert={f.parzellenflaecheM2 || undefined}
        onChange={(v) => setFeld('parzellenflaecheM2', v ?? 0)}
      />
      <Eingabe
        label="Wertermittlung am (Datum)"
        typ="date"
        wert={f.wertermittlungAm}
        onChange={(v) => setFeld('wertermittlungAm', v)}
      />
      <Eingabe
        label="Wertermittler Außenanlagen & Aufwuchs"
        wert={f.wertermittlerAussenAufwuchs}
        onChange={(v) => setFeld('wertermittlerAussenAufwuchs', v)}
      />
      <Eingabe
        label="Auftraggeber"
        wert={f.auftraggeber}
        onChange={(v) => setFeld('auftraggeber', v)}
      />
      <Eingabe
        label="Anwesend für den Verein"
        wert={f.anwesendVerein}
        onChange={(v) => setFeld('anwesendVerein', v)}
      />
      <Eingabe
        label="Anwesend für den Unterpächter"
        wert={f.anwesendUnterpaechter}
        onChange={(v) => setFeld('anwesendUnterpaechter', v)}
      />
      <Eingabe
        label="Anwesend für den Auftraggeber"
        wert={f.anwesendAuftraggeber}
        onChange={(v) => setFeld('anwesendAuftraggeber', v)}
      />
      <Eingabe
        label="Vorgangs-Nr."
        wert={f.vorgangsNr}
        onChange={(v) => setFeld('vorgangsNr', v)}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Positionen-Tab (Außenanlagen / Aufwuchs)
// ---------------------------------------------------------------------------

function PositionenTab({
  wep,
  abschnitt,
  dialog,
  setDialog,
  onSpeichern,
}: {
  wep: Wep
  abschnitt: Abschnitt
  dialog: HinzufuegenDialog | null
  setDialog: (d: HinzufuegenDialog | null) => void
  onSpeichern: (wep: Wep) => Promise<void>
}) {
  const positionen =
    abschnitt === 'aussenanlagen' ? wep.gruen.aussenanlagen : wep.gruen.aufwuchs

  const titel =
    abschnitt === 'aussenanlagen' ? 'Außenanlagen' : 'Aufwuchs'

  const summe = berechneAbschnittSumme(positionen)

  function loeschePosition(posId: string) {
    const neu = positionen.filter((p) => p.id !== posId)
    const neuWep: Wep = {
      ...wep,
      gruen: { ...wep.gruen, [abschnitt]: neu },
    }
    void onSpeichern(neuWep)
  }

  function fuegePositionHinzu(pos: Position) {
    const neu = [...positionen, pos]
    const neuWep: Wep = {
      ...wep,
      gruen: { ...wep.gruen, [abschnitt]: neu },
    }
    void onSpeichern(neuWep)
    setDialog(null)
  }

  function aktuellerDialog() {
    return dialog?.abschnitt === abschnitt ? dialog : null
  }

  return (
    <section className="formular">
      <h2 className="abschnitt-titel">{titel}</h2>

      {/* Beschreibungsfeld */}
      <Eingabe
        label="Beschreibung (optional)"
        mehrzeilig
        wert={
          abschnitt === 'aussenanlagen'
            ? wep.gruen.beschreibungAussen
            : wep.gruen.beschreibungAufwuchs
        }
        onChange={(v) => {
          const feld =
            abschnitt === 'aussenanlagen'
              ? 'beschreibungAussen'
              : 'beschreibungAufwuchs'
          void onSpeichern({ ...wep, gruen: { ...wep.gruen, [feld]: v } })
        }}
      />

      {/* Positionsliste */}
      {positionen.length === 0 ? (
        <p className="hinweis">Noch keine Positionen. Position hinzufügen ↓</p>
      ) : (
        <ul className="pos-liste">
          {positionen.map((pos) => (
            <PositionsKarte
              key={pos.id}
              pos={pos}
              wep={wep}
              onLoeschen={() => loeschePosition(pos.id)}
            />
          ))}
        </ul>
      )}

      {/* Live-Summe */}
      <div className="summen-zeile">
        <span>Summe {titel}:</span>
        <span className="summen-wert">{euroFormat(summe)}</span>
      </div>

      {/* Dialog: Position hinzufügen */}
      {aktuellerDialog() === null ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setDialog({ schritt: 'suche', abschnitt })}
        >
          ➕ Position hinzufügen
        </button>
      ) : (
        <PositionHinzufuegenPanel
          dialog={aktuellerDialog()!}
          setDialog={setDialog}
          abschnitt={abschnitt}
          wep={wep}
          onHinzufuegen={fuegePositionHinzu}
        />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Positions-Karte (Anzeige einer vorhandenen Position)
// ---------------------------------------------------------------------------

function PositionsKarte({
  pos,
  wep,
  onLoeschen,
}: {
  pos: Position
  wep: Wep
  onLoeschen: () => void
}) {
  const hinweise = berechneRegelhinweise(pos, wep, KATALOG_POSITIONEN, INVASIVE_ARTEN)

  return (
    <li className="pos-karte">
      <div className="pos-karte-kopf">
        <div className="pos-karte-info">
          <span className="pos-anzahl">
            {zahlDe(pos.anzahl)} {pos.einheit}
          </span>
          <span className="pos-bezeichnung">{pos.bezeichnung}</span>
          {pos.zustand && (
            <span className="pos-zustand">
              Zustand: {pos.zustand}
            </span>
          )}
          <span className="pos-preis">
            {euroFormat(pos.einzelpreis)} / {pos.einheit}
            {pos.preisManuell ? ' (manuell)' : ' (Vorschlag)'}
          </span>
          <span className="pos-gesamt">
            = {euroFormat(pos.anzahl * pos.einzelpreis)}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-gefahr"
          aria-label={`Position ${pos.bezeichnung} löschen`}
          onClick={onLoeschen}
        >
          🗑️
        </button>
      </div>

      <HinweisListe hinweise={hinweise} />
    </li>
  )
}

// ---------------------------------------------------------------------------
// Panel: Position hinzufügen (Suche → Variante → Formular)
// ---------------------------------------------------------------------------

function PositionHinzufuegenPanel({
  dialog,
  setDialog,
  abschnitt,
  wep,
  onHinzufuegen,
}: {
  dialog: HinzufuegenDialog
  setDialog: (d: HinzufuegenDialog | null) => void
  abschnitt: Abschnitt
  wep: Wep
  onHinzufuegen: (pos: Position) => void
}) {
  const [suchbegriff, setSuchbegriff] = useState('')
  const [zuletzt] = useState<string[]>(() => ladeZuletztVerwendet())

  // Suchtreffer (Katalog gefiltert nach Abschnitt)
  const relevantePositionen = KATALOG_POSITIONEN.filter((p) =>
    abschnitt === 'aussenanlagen'
      ? p.abschnitt === 'II. Außenanlagen'
      : p.abschnitt === 'III. Aufwuchs',
  )

  const treffer = sucheKatalog(relevantePositionen, suchbegriff, {
    zuletztVerwendet: suchbegriff ? [] : zuletzt,
    limit: 10,
  })

  if (dialog.schritt === 'suche') {
    return (
      <div className="panel">
        <div className="panel-kopf">
          <h3 className="panel-titel">Position suchen</h3>
          <button
            type="button"
            className="btn"
            onClick={() => setDialog(null)}
          >
            ✕ Abbrechen
          </button>
        </div>

        <input
          type="search"
          className="eingabe"
          placeholder="Bezeichnung, Pflanze …"
          value={suchbegriff}
          onChange={(e) => setSuchbegriff(e.target.value)}
          autoFocus
        />

        <ul className="suche-liste">
          {treffer.map((t) => (
            <li key={t.position.id + (t.variante ? JSON.stringify(t.variante) : '')}>
              <button
                type="button"
                className="suche-eintrag"
                onClick={() => {
                  merkeZuletztVerwendet(t.position.id)
                  const art = gefundeneArt(t.position, suchbegriff)
                  if (t.variante) {
                    // Suchtreffer nennt schon die Variante (z. B. „Apfel Halbstamm“)
                    setDialog({
                      schritt: 'formular',
                      abschnitt,
                      katalogPos: t.position,
                      variante: t.variante,
                      art,
                    })
                  } else if (t.position.varianten && t.position.varianten.length > 0) {
                    setDialog({ schritt: 'variante', abschnitt, katalogPos: t.position, art })
                  } else {
                    setDialog({ schritt: 'formular', abschnitt, katalogPos: t.position, art })
                  }
                }}
              >
                <span className="suche-bezeichnung">
                  {t.variante
                    ? kurzeBezeichnung(t.position, t.variante, gefundeneArt(t.position, suchbegriff))
                    : t.position.bezeichnung}
                </span>
                <span className="suche-meta">
                  {t.position.kategorie}
                  {(t.variante?.hoechstwert ?? t.position.hoechstwert) !== undefined
                    ? ` · bis ${euroFormat((t.variante?.hoechstwert ?? t.position.hoechstwert) as number)}`
                    : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="btn"
          onClick={() =>
            setDialog({ schritt: 'formular', abschnitt })
          }
        >
          ✏️ Eigene Position (Freitext)
        </button>
      </div>
    )
  }

  if (dialog.schritt === 'variante') {
    const { katalogPos, art } = dialog
    return (
      <div className="panel">
        <div className="panel-kopf">
          <h3 className="panel-titel">
            {art ? `${art} – ${katalogPos.bezeichnung}` : katalogPos.bezeichnung}
          </h3>
          <button
            type="button"
            className="btn"
            onClick={() => setDialog({ schritt: 'suche', abschnitt })}
          >
            ← zurück
          </button>
        </div>

        <p className="hinweis-klein">Variante wählen:</p>
        <ul className="suche-liste">
          {(katalogPos.varianten ?? []).map((v, i) => {
            const merkmale = variantenMerkmale(v)
            return (
              <li key={i}>
                <button
                  type="button"
                  className="suche-eintrag"
                  onClick={() =>
                    setDialog({
                      schritt: 'formular',
                      abschnitt,
                      katalogPos,
                      variante: v,
                      art,
                    })
                  }
                >
                  <span className="suche-bezeichnung">{merkmale || '–'}</span>
                  <span className="suche-meta">bis {euroFormat(v.hoechstwert)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // Schritt: Formular
  return (
    <PositionFormular
      abschnitt={abschnitt}
      katalogPos={dialog.katalogPos}
      variante={dialog.variante}
      art={dialog.art}
      wep={wep}
      onZurueck={() => setDialog({ schritt: 'suche', abschnitt })}
      onAbbrechen={() => setDialog(null)}
      onHinzufuegen={onHinzufuegen}
    />
  )
}

// ---------------------------------------------------------------------------
// Positions-Formular (Anzahl, Einheit, Zustand, Preis)
// ---------------------------------------------------------------------------

function PositionFormular({
  abschnitt: _abschnitt,
  katalogPos,
  variante,
  art,
  wep,
  onZurueck,
  onAbbrechen,
  onHinzufuegen,
}: {
  abschnitt: Abschnitt
  katalogPos?: KatalogPosition
  variante?: KatalogVariante
  art?: string
  wep: Wep
  onZurueck: () => void
  onAbbrechen: () => void
  onHinzufuegen: (pos: Position) => void
}) {
  const hoechstwert = variante?.hoechstwert ?? katalogPos?.hoechstwert
  const id = useId()

  const [bezeichnung, setBezeichnung] = useState(
    katalogPos ? kurzeBezeichnung(katalogPos, variante, art) : '',
  )
  const [anzahl, setAnzahl] = useState('1')
  const [einheit, setEinheit] = useState<string>(katalogPos?.einheit ?? 'Stück')
  const [zustand, setZustand] = useState<Position['zustand']>('gut')
  const [preisManuell, setPreisManuell] = useState(false)
  const [preisEingabe, setPreisEingabe] = useState('')

  // Vorgeschlagener Preis berechnen
  const vorschlauPos: Position = {
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
  const preisVorschlag = berechnePreisvorschlag(vorschlauPos)

  // Regelhinweise für Vorschau
  const vorschauHinweise = berechneRegelhinweise(
    { ...vorschlauPos, einzelpreis: preisManuell ? leseZahlOder(preisEingabe, 0) : preisVorschlag },
    wep,
    KATALOG_POSITIONEN,
    INVASIVE_ARTEN,
  )

  function bestaetigen() {
    const einzelpreis = preisManuell ? leseZahlOder(preisEingabe, 0) : preisVorschlag
    const pos: Position = {
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
    }
    onHinzufuegen(pos)
  }

  return (
    <div className="panel">
      <div className="panel-kopf">
        <h3 className="panel-titel">
          {katalogPos ? kurzeBezeichnung(katalogPos, variante, art) : 'Eigene Position'}
        </h3>
        {katalogPos ? (
          <button type="button" className="btn" onClick={onZurueck}>
            ← zurück
          </button>
        ) : (
          <button type="button" className="btn" onClick={onAbbrechen}>
            ✕ Abbrechen
          </button>
        )}
      </div>

      <div className="eingabe-gruppe">
        <label className="eingabe-label" htmlFor={`${id}-bez`}>
          Bezeichnung (steht so in der Excel)
        </label>
        <input
          id={`${id}-bez`}
          type="text"
          className="eingabe"
          value={bezeichnung}
          onChange={(e) => setBezeichnung(e.target.value)}
          placeholder="z. B. Kirschbaum, alt"
        />
      </div>

      <div className="eingabe-gruppe">
        <label className="eingabe-label" htmlFor={`${id}-anz`}>
          Anzahl / Menge
        </label>
        <input
          id={`${id}-anz`}
          type="text"
          inputMode="decimal"
          className="eingabe"
          value={anzahl}
          onChange={(e) => setAnzahl(e.target.value)}
        />
      </div>

      <div className="eingabe-gruppe">
        <label className="eingabe-label" htmlFor={`${id}-einh`}>
          Einheit
        </label>
        <select
          id={`${id}-einh`}
          className="eingabe"
          value={einheit}
          onChange={(e) => setEinheit(e.target.value)}
        >
          {['Stück', 'm', 'm²', 'm³', 'lfdm', 'Pauschale'].map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      <div className="eingabe-gruppe">
        <label className="eingabe-label" htmlFor={`${id}-zust`}>
          Zustand
        </label>
        <select
          id={`${id}-zust`}
          className="eingabe"
          value={zustand ?? ''}
          onChange={(e) => setZustand(e.target.value as Position['zustand'])}
        >
          {(Object.keys(ZUSTANDSSTUFEN) as NonNullable<Position['zustand']>[]).map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>

      <div className="eingabe-gruppe">
        <label className="eingabe-label" htmlFor={`${id}-preis`}>
          Einzelpreis
        </label>
        {preisManuell ? (
          <div className="preis-zeile">
            <input
              id={`${id}-preis`}
              type="text"
              inputMode="decimal"
              className="eingabe"
              value={preisEingabe}
              onChange={(e) => setPreisEingabe(e.target.value)}
              placeholder="0,00"
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPreisManuell(false)
                setPreisEingabe('')
              }}
            >
              Vorschlag ({euroFormat(preisVorschlag)})
            </button>
          </div>
        ) : (
          <div className="preis-zeile">
            <span className="preis-anzeige">{euroFormat(preisVorschlag)}</span>
            {hoechstwert !== undefined && (
              <span className="preis-basis">
                (Höchstwert {euroFormat(hoechstwert)} × Faktor{' '}
                {zahlDe(ZUSTANDSSTUFEN[zustand ?? 'gut'].faktor)})
              </span>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPreisManuell(true)
                setPreisEingabe(zahlFuerEingabe(preisVorschlag))
              }}
            >
              ✏️ Überschreiben
            </button>
          </div>
        )}
      </div>

      {/* Vorschau-Regelhinweise */}
      <HinweisListe hinweise={vorschauHinweise} />

      <div className="panel-fuss">
        <button
          type="button"
          className="btn btn-primary"
          disabled={
            !bezeichnung.trim() ||
            !(leseZahl(anzahl) > 0) ||
            (preisManuell && !Number.isFinite(leseZahl(preisEingabe)))
          }
          onClick={bestaetigen}
        >
          ✓ Hinzufügen
        </button>
        <button type="button" className="btn" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Beseitigung-Tab
// ---------------------------------------------------------------------------

function BeseitigungTab({
  wep,
  onSpeichern,
}: {
  wep: Wep
  onSpeichern: (wep: Wep) => Promise<void>
}) {
  const [offen, setOffen] = useState(false)
  const [gegenstand, setGegenstand] = useState('')
  const [menge, setMenge] = useState('1')
  const [einheit, setEinheit] = useState('Stück')
  const [einzelpreis, setEinzelpreis] = useState('')
  const [faktor, setFaktor] = useState('1')
  const [begruendung, setBegruendung] = useState('')
  const id = useId()
  const faktorZahl = leseZahlOder(faktor, 1)

  const positionen = wep.gruen.beseitigungAA

  function fuegeHinzu() {
    const pos: BeseitigungsPosition = {
      id: neueBeseitigungsId(),
      gegenstand,
      menge: leseZahlOder(menge, 0),
      einheit,
      einzelpreis: leseZahlOder(einzelpreis, 0),
      faktor: faktorZahl,
      begruendung: faktorZahl > 1 ? begruendung : undefined,
    }
    const neu: Wep = {
      ...wep,
      gruen: { ...wep.gruen, beseitigungAA: [...positionen, pos] },
    }
    void onSpeichern(neu)
    setOffen(false)
    setGegenstand('')
    setMenge('1')
    setEinzelpreis('')
    setFaktor('1')
    setBegruendung('')
  }

  function loeschen(posId: string) {
    const neu: Wep = {
      ...wep,
      gruen: { ...wep.gruen, beseitigungAA: positionen.filter((p) => p.id !== posId) },
    }
    void onSpeichern(neu)
  }

  return (
    <section className="formular">
      <h2 className="abschnitt-titel">Beseitigungskosten (Abschnitt 2)</h2>
      <p className="hinweis-klein">
        Hier werden Kosten für Beseitigungen eingetragen (z. B. invasive Arten,
        regelwidrige Anlagen). Die Richtlinie sieht für Fällen/Roden ein saisonales
        Verbot (1. März – 30. September) vor.
      </p>

      {positionen.length === 0 ? (
        <p className="hinweis">Noch keine Beseitigungspositionen.</p>
      ) : (
        <ul className="pos-liste">
          {positionen.map((pos) => (
            <li key={pos.id} className="pos-karte">
              <div className="pos-karte-kopf">
                <div className="pos-karte-info">
                  <span className="pos-bezeichnung">{pos.gegenstand}</span>
                  <span className="pos-anzahl">
                    {zahlDe(pos.menge)} {pos.einheit}
                  </span>
                  <span className="pos-preis">
                    {euroFormat(pos.einzelpreis)} · Faktor {zahlDe(pos.faktor)}
                  </span>
                  <span className="pos-gesamt">
                    = {euroFormat(pos.menge * pos.einzelpreis * pos.faktor)}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-gefahr"
                  aria-label={`${pos.gegenstand} löschen`}
                  onClick={() => loeschen(pos.id)}
                >
                  🗑️
                </button>
              </div>
              {pos.begruendung && (
                <p className="pos-begruendung">Begründung: {pos.begruendung}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!offen ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOffen(true)}
        >
          ➕ Beseitigungsposition hinzufügen
        </button>
      ) : (
        <div className="panel">
          <div className="panel-kopf">
            <h3 className="panel-titel">Beseitigungsposition</h3>
            <button type="button" className="btn" onClick={() => setOffen(false)}>
              ✕ Abbrechen
            </button>
          </div>

          <div className="eingabe-gruppe">
            <label className="eingabe-label" htmlFor={`${id}-geg`}>
              Gegenstand / Beschreibung
            </label>
            <input
              id={`${id}-geg`}
              type="text"
              className="eingabe"
              value={gegenstand}
              onChange={(e) => setGegenstand(e.target.value)}
              placeholder="z. B. Japanischer Knöterich entfernen"
            />
          </div>

          <div className="eingabe-gruppe">
            <label className="eingabe-label" htmlFor={`${id}-menge`}>
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

          <div className="eingabe-gruppe">
            <label className="eingabe-label" htmlFor={`${id}-einh`}>
              Einheit
            </label>
            <select
              id={`${id}-einh`}
              className="eingabe"
              value={einheit}
              onChange={(e) => setEinheit(e.target.value)}
            >
              {['Stück', 'm', 'm²', 'Pauschale'].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div className="eingabe-gruppe">
            <label className="eingabe-label" htmlFor={`${id}-preis`}>
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

          <div className="eingabe-gruppe">
            <label className="eingabe-label" htmlFor={`${id}-faktor`}>
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

          {faktorZahl > 1 && (
            <div className="eingabe-gruppe">
              <label className="eingabe-label" htmlFor={`${id}-begr`}>
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

          <div className="panel-fuss">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!gegenstand.trim()}
              onClick={fuegeHinzu}
            >
              ✓ Hinzufügen
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Export-Tab
// ---------------------------------------------------------------------------

function ExportTab({
  wep,
  exportZustand,
  setExportZustand,
  bauExcelRef,
}: {
  wep: Wep
  exportZustand: ExportZustand
  setExportZustand: (z: ExportZustand) => void
  bauExcelRef: React.MutableRefObject<File | null>
}) {
  function onBauExcelChange(e: ChangeEvent<HTMLInputElement>) {
    bauExcelRef.current = e.target.files?.[0] ?? null
  }

  async function exportieren() {
    setExportZustand({ typ: 'laedt' })
    try {
      let sourceBuffer: ArrayBuffer

      if (bauExcelRef.current) {
        // Bau-Excel hochgeladen
        sourceBuffer = await bauExcelRef.current.arrayBuffer()
      } else {
        // Leere Vorlage aus public/ laden
        const resp = await fetch('/WEP_Vorlage.xlsx')
        if (!resp.ok) throw new Error(`Vorlage nicht gefunden: ${resp.statusText}`)
        sourceBuffer = await resp.arrayBuffer()
      }

      // Skizze (falls gezeichnet) als PNG mitgeben → Blatt „Skizze Außenanlage-Aufwuchs“.
      // Der Export entscheidet, ob das PNG transparent sein muss (Bau-Formen im Blatt).
      const skizze = wep.skizze
      const skizzePng = skizze?.elemente.length
        ? async (o: { transparent: boolean }) =>
            (await skizzeAlsPng(skizze, undefined, undefined, o)).arrayBuffer()
        : undefined

      const result = await exportWep(wep, sourceBuffer, { skizzePng })

      // Datei-Download auslösen
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)

      setExportZustand({ typ: 'fertig', result })
    } catch (err) {
      setExportZustand({
        typ: 'fehler',
        meldung: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <section className="formular">
      <h2 className="abschnitt-titel">Export als Excel-Datei</h2>

      <p className="hinweis">
        Die App schreibt die Grün-Daten in die WEP-Vorlage. Bau-Blätter werden
        nicht verändert. Falls der Bau-Wertermittler seine Excel-Datei bereits
        ausgefüllt hat, diese hier hochladen – andernfalls wird die leere
        Vorlage verwendet.
      </p>

      <div className="eingabe-gruppe">
        <label className="eingabe-label" htmlFor="bau-excel">
          Bau-Excel (optional, bereits ausgefüllte Vorlage)
        </label>
        <input
          id="bau-excel"
          type="file"
          className="eingabe"
          accept=".xlsx"
          onChange={onBauExcelChange}
        />
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={exportZustand.typ === 'laedt'}
        onClick={() => void exportieren()}
      >
        {exportZustand.typ === 'laedt' ? '⏳ Exportiere …' : '⬇️ Excel exportieren'}
      </button>

      {exportZustand.typ === 'fehler' && (
        <p className="hinweis hinweis-warnung">Fehler: {exportZustand.meldung}</p>
      )}

      {exportZustand.typ === 'fertig' && (
        <div className="export-ergebnis">
          <p className="hinweis hinweis-ok">
            ✅ Export erfolgreich: {exportZustand.result.filename}
          </p>
          {exportZustand.result.skizzeEingefuegt && (
            <p className="hinweis-klein">🖍️ Skizze ins Blatt „Skizze Außenanlage-Aufwuchs“ eingefügt.</p>
          )}

          {exportZustand.result.konflikte.length > 0 && (
            <div>
              <p className="hinweis-klein hinweis-warnung-titel">
                ⚠️ Folgende Formalien-Felder waren in der Bau-Excel bereits
                gefüllt und wurden nicht überschrieben:
              </p>
              <ul className="konflikte-liste">
                {exportZustand.result.konflikte.map((k) => (
                  <li key={k.feld} className="konflikt-eintrag">
                    <strong>{k.feld}</strong> (Zelle {k.zelle}):
                    Bau-Excel: „{k.bauExcelWert}" · App: „{k.appWert}"
                  </li>
                ))}
              </ul>
            </div>
          )}

          {exportZustand.result.aufwuchsUeberlauf && (
            <p className="hinweis hinweis-warnung">
              ⚠️ Aufwuchs-Positionen laufen auf Anlage III a (Aufwuchs II)
              über (mehr als 28 Positionen in Aufwuchs I).
            </p>
          )}

          {exportZustand.result.aufwuchsAbgeschnitten && (
            <p className="hinweis hinweis-warnung">
              ⚠️ Es gibt mehr als 64 Aufwuchs-Positionen. Überschüssige Positionen
              wurden nicht exportiert – Positionen zusammenfassen.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Wiederverwendbare UI-Bausteine
// ---------------------------------------------------------------------------

function Eingabe({
  label,
  wert,
  onChange,
  typ = 'text',
  mehrzeilig = false,
}: {
  label: string
  wert: string
  onChange: (v: string) => void
  typ?: string
  mehrzeilig?: boolean
}) {
  const id = useId()
  return (
    <div className="eingabe-gruppe">
      <label className="eingabe-label" htmlFor={id}>
        {label}
      </label>
      {mehrzeilig ? (
        <textarea
          id={id}
          className="eingabe"
          rows={3}
          value={wert}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={typ}
          className="eingabe"
          value={wert}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

/**
 * Zahlenfeld mit deutschem Komma. Hält den eingegebenen Text lokal, damit
 * „12,“ beim Tippen nicht sofort zu „12“ umformatiert wird.
 */
function ZahlEingabe({
  label,
  wert,
  onChange,
}: {
  label: string
  wert: number | undefined
  onChange: (v: number | undefined) => void
}) {
  const id = useId()
  const [text, setText] = useState(wert === undefined ? '' : zahlFuerEingabe(wert))
  return (
    <div className="eingabe-gruppe">
      <label className="eingabe-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="eingabe"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = leseZahl(e.target.value)
          if (e.target.value.trim() === '') onChange(undefined)
          else if (Number.isFinite(n)) onChange(n)
        }}
      />
    </div>
  )
}

/**
 * Regelhinweise: Warnungen immer sichtbar, reine Info-Texte (Richtlinien-
 * Erläuterungen) eingeklappt, damit die Positionsliste übersichtlich bleibt.
 */
function HinweisListe({ hinweise }: { hinweise: Hinweis[] }) {
  const warnungen = hinweise.filter((h) => h.schwere === 'warnung')
  const infos = hinweise.filter((h) => h.schwere !== 'warnung')
  return (
    <>
      {warnungen.map((h, i) => (
        <HinweisAnzeige key={`w${i}`} hinweis={h} />
      ))}
      {infos.length > 0 && (
        <details className="hinweis-details">
          <summary className="hinweis-klein">
            ℹ️ {infos.length === 1 ? '1 Hinweis' : `${infos.length} Hinweise`} zur Richtlinie
          </summary>
          {infos.map((h, i) => (
            <HinweisAnzeige key={`i${i}`} hinweis={h} />
          ))}
        </details>
      )}
    </>
  )
}

function HinweisAnzeige({ hinweis }: { hinweis: Hinweis }) {
  const klasse =
    hinweis.schwere === 'warnung' ? 'hinweis hinweis-warnung' : 'hinweis hinweis-info'
  const icon = hinweis.schwere === 'warnung' ? '⚠️' : 'ℹ️'
  return (
    <p className={klasse}>
      {icon} {hinweis.text}
    </p>
  )
}
