// WepDetail – Erfassung eines Wertermittlungsprotokolls.
//
// Abschnitte: Formalien | Außenanlagen | Aufwuchs | Beseitigung | Skizze.
// Handy: Kopfzeile (Zurück, Titel, Export, Menü „⋯“) und untere Leiste mit den
// fünf Abschnitten. Tablet (≥ 900 px): Seitenleiste mit Abschnitten, Summen und Export.
// Export ist eine Aktion, kein Abschnitt. Löschen liegt im Menü „⋯“ mit Rückfrage.
// Jede Änderung wird sofort in IndexedDB gespeichert.

import { useState, useEffect, useCallback, useRef, useId, type ChangeEvent } from 'react'
import {
  Check,
  ChevronLeft,
  Ellipsis,
  Fence,
  FileSpreadsheet,
  FileText,
  PencilRuler,
  Plus,
  Shovel,
  Sprout,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { Wep, Position, BeseitigungsPosition, Formalien } from '@/model'
import { loescheWep, ladeWep, speichereWep } from './db'
import { SkizzeTab } from './SkizzeTab'
import { PositionenAbschnitt } from './Positionen'
import { PositionHinzufuegen } from './PositionHinzufuegen'
import type { Abschnitt } from './katalogDaten'
import { ICON, Kopf, SlEintrag, euroFormat } from './ui'
import { skizzeAlsPng } from '@/skizze/skizzePng'
import { skizzeDatenZuFormen, type Kasten } from '@/export/skizzeFormen'
import { svgZuPngBrowser } from '@/export/svgRaster'
import { exportWep, type ExportResult } from '@/export'
import { exportNachOneDrive } from '@/sync'
import { berechneAbschnittSumme } from '@/gruen/summen'
import { leseZahl, leseZahlOder, zahlDe, zahlFuerEingabe } from '@/gruen/format'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

type Bereich = 'formalien' | 'aussenanlagen' | 'aufwuchs' | 'beseitigung' | 'skizze'
type Tab = Bereich | 'export'

type ExportZustand =
  | { typ: 'idle' }
  | { typ: 'laedt' }
  | { typ: 'fertig'; result: ExportResult; oneDrive?: string }
  | { typ: 'fehler'; meldung: string }

interface Props {
  wepId: string
  onZurueck: () => void
}

const BEREICHE: { id: Bereich; titel: string; kurz: string; icon: LucideIcon }[] = [
  { id: 'formalien', titel: 'Formalien', kurz: 'Formalien', icon: FileText },
  { id: 'aussenanlagen', titel: 'Außenanlagen', kurz: 'Außen', icon: Fence },
  { id: 'aufwuchs', titel: 'Aufwuchs', kurz: 'Aufwuchs', icon: Sprout },
  { id: 'beseitigung', titel: 'Beseitigung', kurz: 'Beseitigung', icon: Shovel },
  { id: 'skizze', titel: 'Skizze', kurz: 'Skizze', icon: PencilRuler },
]

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function neueBeseitigungsId(): string {
  return `bes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function beseitigungSumme(positionen: BeseitigungsPosition[]): number {
  return positionen.reduce((s, p) => s + p.menge * p.einzelpreis * p.faktor, 0)
}

function bereichSumme(wep: Wep, b: Bereich): number | undefined {
  if (b === 'aussenanlagen') return berechneAbschnittSumme(wep.gruen.aussenanlagen)
  if (b === 'aufwuchs') return berechneAbschnittSumme(wep.gruen.aufwuchs)
  if (b === 'beseitigung') return beseitigungSumme(wep.gruen.beseitigungAA)
  return undefined
}

/** Titel für Kopf und Seitenleiste: die Parzelle, sonst die Vorgangs-Nr. */
function wepTitel(wep: Wep): string {
  return wep.formalien.parzelle.trim() || `WEP ${wep.id}`
}

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export function WepDetail({ wepId, onZurueck }: Props) {
  const [wep, setWep] = useState<Wep | null>(null)
  const [tab, setTab] = useState<Tab>('formalien')
  const [hinzufuegen, setHinzufuegen] = useState<Abschnitt | null>(null)
  const [loeschFrage, setLoeschFrage] = useState(false)
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

  const wechsle = useCallback((t: Tab) => {
    setTab(t)
    setHinzufuegen(null)
    window.scrollTo(0, 0)
  }, [])

  const zurueckKnopf = (
    <button type="button" className="zurueck" onClick={onZurueck}>
      <ChevronLeft {...ICON} />
      Protokolle
    </button>
  )

  if (!wep) {
    return (
      <div className="rahmen">
        <main className="inhalt">
          <Kopf titel={`WEP ${wepId}`} links={zurueckKnopf} />
          <div className="seitenkopf nur-tablet">{zurueckKnopf}</div>
          <p className="leertext">Lade …</p>
        </main>
      </div>
    )
  }

  const titel = wepTitel(wep)

  async function loeschen() {
    await loescheWep(wepId)
    setLoeschFrage(false)
    onZurueck()
  }

  function fuegePositionHinzu(abschnitt: Abschnitt, pos: Position) {
    const liste = abschnitt === 'aussenanlagen' ? wep!.gruen.aussenanlagen : wep!.gruen.aufwuchs
    void speichere({ ...wep!, gruen: { ...wep!.gruen, [abschnitt]: [...liste, pos] } })
    setHinzufuegen(null)
    window.scrollTo(0, document.body.scrollHeight)
  }

  return (
    <div className={hinzufuegen ? 'rahmen' : 'rahmen mit-unten'}>
      <aside className="seitenleiste" aria-label="Abschnitte">
        {zurueckKnopf}
        <div className="sl-wep">
          <div className="sl-wep-text">
            <span className="sl-wep-titel">{titel}</span>
            <span className="neben">
              {wep.formalien.kleingartenanlage.trim() && `${wep.formalien.kleingartenanlage.trim()} · `}
              <span className="nowrap">{wep.id}</span>
            </span>
          </div>
          <WepMenue onLoeschen={() => setLoeschFrage(true)} />
        </div>
        <nav className="sl-nav">
          {BEREICHE.map((b) => {
            const summe = bereichSumme(wep, b.id)
            return (
              <SlEintrag
                key={b.id}
                icon={b.icon}
                text={b.titel}
                wert={summe === undefined ? undefined : euroFormat(summe)}
                aktiv={tab === b.id}
                onClick={() => wechsle(b.id)}
              />
            )
          })}
        </nav>
        <nav className="sl-nav sl-trenner">
          <SlEintrag icon={FileSpreadsheet} text="Export als Excel" aktiv={tab === 'export'} onClick={() => wechsle('export')} />
        </nav>
      </aside>

      <main className={hinzufuegen ? 'inhalt inhalt-breit' : 'inhalt'}>
        {hinzufuegen ? (
          <PositionHinzufuegen
            abschnitt={hinzufuegen}
            wep={wep}
            onAbbrechen={() => setHinzufuegen(null)}
            onHinzufuegen={(pos) => fuegePositionHinzu(hinzufuegen, pos)}
          />
        ) : (
          <>
            <Kopf
              titel={titel}
              unter={wep.formalien.kleingartenanlage.trim() || undefined}
              links={zurueckKnopf}
              rechts={
                <>
                  <button
                    type="button"
                    className="textknopf"
                    aria-current={tab === 'export' ? 'page' : undefined}
                    onClick={() => wechsle('export')}
                  >
                    Export
                  </button>
                  <WepMenue onLoeschen={() => setLoeschFrage(true)} />
                </>
              }
            />

            {tab === 'formalien' && <FormalienTab wep={wep} onSpeichern={speichere} />}
            {(tab === 'aussenanlagen' || tab === 'aufwuchs') && (
              <PositionenAbschnitt
                key={tab}
                wep={wep}
                abschnitt={tab}
                onSpeichern={speichere}
                onHinzufuegen={() => {
                  setHinzufuegen(tab)
                  window.scrollTo(0, 0)
                }}
              />
            )}
            {tab === 'beseitigung' && <BeseitigungTab wep={wep} onSpeichern={speichere} />}
            {tab === 'skizze' && <SkizzeTab wep={wep} onSpeichern={speichere} />}
            {tab === 'export' && (
              <ExportTab
                wep={wep}
                exportZustand={exportZustand}
                setExportZustand={setExportZustand}
                bauExcelRef={bauExcelRef}
              />
            )}
          </>
        )}
      </main>

      {!hinzufuegen && (
        <nav className="unten nur-handy" aria-label="Abschnitte">
          {BEREICHE.map((b) => (
            <button
              key={b.id}
              type="button"
              className="unten-knopf"
              aria-label={b.titel}
              aria-current={tab === b.id ? 'page' : undefined}
              onClick={() => wechsle(b.id)}
            >
              <b.icon {...ICON} />
              <span>{b.kurz}</span>
            </button>
          ))}
        </nav>
      )}

      {loeschFrage && (
        <LoeschFrage wepId={wep.id} titel={titel} onAbbrechen={() => setLoeschFrage(false)} onLoeschen={() => void loeschen()} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Menü „⋯“ und Rückfrage beim Löschen
// ---------------------------------------------------------------------------

function WepMenue({ onLoeschen }: { onLoeschen: () => void }) {
  const [offen, setOffen] = useState(false)
  const id = useId()

  useEffect(() => {
    if (!offen) return
    const taste = (e: KeyboardEvent) => e.key === 'Escape' && setOffen(false)
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [offen])

  return (
    <div className="menue-anker">
      <button
        type="button"
        className="symbolknopf"
        aria-label="Weitere Aktionen"
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={offen ? id : undefined}
        onClick={() => setOffen(!offen)}
      >
        <Ellipsis {...ICON} />
      </button>
      {offen && (
        <>
          <button type="button" className="menue-hintergrund" aria-hidden="true" tabIndex={-1} onClick={() => setOffen(false)} />
          <ul className="menue" role="menu" id={id}>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="menue-eintrag menue-gefahr"
                autoFocus
                onClick={() => {
                  setOffen(false)
                  onLoeschen()
                }}
              >
                <Trash2 {...ICON} />
                WEP löschen …
              </button>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}

function LoeschFrage({
  wepId,
  titel,
  onAbbrechen,
  onLoeschen,
}: {
  wepId: string
  titel: string
  onAbbrechen: () => void
  onLoeschen: () => void
}) {
  const id = useId()
  return (
    <div className="dialog-hintergrund">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
        <h2 className="h2" id={`${id}-t`}>
          WEP {wepId} löschen?
        </h2>
        <p id={`${id}-d`}>
          {titel !== `WEP ${wepId}` ? `„${titel}“ wird` : 'Das Protokoll wird'} auf diesem Gerät gelöscht. Das lässt
          sich nicht rückgängig machen. Eine Kopie in OneDrive bleibt erhalten.
        </p>
        <div className="dialog-knoepfe">
          <button type="button" className="knopf" autoFocus onClick={onAbbrechen}>
            Abbrechen
          </button>
          <button type="button" className="knopf knopf-gefahr" onClick={onLoeschen}>
            Löschen
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formalien
// ---------------------------------------------------------------------------

function FormalienTab({ wep, onSpeichern }: { wep: Wep; onSpeichern: (wep: Wep) => Promise<void> }) {
  function setFeld(key: keyof Formalien, wert: string | number) {
    void onSpeichern({ ...wep, formalien: { ...wep.formalien, [key]: wert } })
  }

  const f = wep.formalien

  return (
    <>
      <header className="seitenkopf">
        <h1 className="h1">Formalien</h1>
      </header>
      <section className="formular">
        <Eingabe label="Kleingartenanlage" wert={f.kleingartenanlage} onChange={(v) => setFeld('kleingartenanlage', v)} />
        <div className="feld-reihe">
          <Eingabe label="Parzelle" wert={f.parzelle} onChange={(v) => setFeld('parzelle', v)} />
          <Eingabe label="Weg (optional)" wert={f.weg ?? ''} onChange={(v) => setFeld('weg', v)} />
        </div>
        <Eingabe label="Unterpächter" wert={f.unterpaechter} onChange={(v) => setFeld('unterpaechter', v)} />
        <div className="feld-reihe">
          <ZahlEingabe
            label="Parzellenfläche (m²)"
            wert={f.parzellenflaecheM2 || undefined}
            onChange={(v) => setFeld('parzellenflaecheM2', v ?? 0)}
          />
          <Eingabe
            label="Wertermittlung am"
            typ="date"
            wert={f.wertermittlungAm}
            onChange={(v) => setFeld('wertermittlungAm', v)}
          />
        </div>
        <Eingabe
          label="Wertermittler Außenanlagen & Aufwuchs"
          wert={f.wertermittlerAussenAufwuchs}
          onChange={(v) => setFeld('wertermittlerAussenAufwuchs', v)}
        />
        <Eingabe label="Auftraggeber" wert={f.auftraggeber} onChange={(v) => setFeld('auftraggeber', v)} />
        <Eingabe label="Anwesend für den Verein" wert={f.anwesendVerein} onChange={(v) => setFeld('anwesendVerein', v)} />
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
        <Eingabe label="Vorgangs-Nr." wert={f.vorgangsNr} onChange={(v) => setFeld('vorgangsNr', v)} />
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Beseitigung
// ---------------------------------------------------------------------------

function BeseitigungTab({ wep, onSpeichern }: { wep: Wep; onSpeichern: (wep: Wep) => Promise<void> }) {
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
    void onSpeichern({ ...wep, gruen: { ...wep.gruen, beseitigungAA: [...positionen, pos] } })
    setOffen(false)
    setGegenstand('')
    setMenge('1')
    setEinzelpreis('')
    setFaktor('1')
    setBegruendung('')
  }

  function loeschen(posId: string) {
    void onSpeichern({ ...wep, gruen: { ...wep.gruen, beseitigungAA: positionen.filter((p) => p.id !== posId) } })
  }

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Beseitigung</h1>
          <p className="neben">Beseitigungskosten (Abschnitt 2)</p>
        </div>
        {!offen && (
          <button type="button" className="knopf knopf-primaer" onClick={() => setOffen(true)}>
            <Plus {...ICON} />
            Hinzufügen
          </button>
        )}
      </header>
      <p className="neben block">
        Kosten für Beseitigungen (z. B. invasive Arten, regelwidrige Anlagen). Die Richtlinie sieht für
        Fällen/Roden ein saisonales Verbot (1. März – 30. September) vor.
      </p>

      <ul className="liste">
        {positionen.length === 0 && <li className="leertext">Noch keine Beseitigungspositionen.</li>}
        {positionen.map((pos) => (
          <li key={pos.id} className="zeile">
            <span className="zeile-text">
              <span className="zeile-titel">{pos.gegenstand}</span>
              <span className="neben">
                {zahlDe(pos.menge)}&nbsp;{pos.einheit} · je {euroFormat(pos.einzelpreis)} · Faktor {zahlDe(pos.faktor)}
              </span>
              {pos.begruendung && <span className="neben">Begründung: {pos.begruendung}</span>}
            </span>
            <span className="zahl c-summe">{euroFormat(pos.menge * pos.einzelpreis * pos.faktor)}</span>
            <button
              type="button"
              className="symbolknopf"
              aria-label={`${pos.gegenstand} löschen`}
              onClick={() => loeschen(pos.id)}
            >
              <Trash2 {...ICON} />
            </button>
          </li>
        ))}
      </ul>
      <div className="summe">
        <span>Summe Beseitigung</span>
        <span className="zahl">{euroFormat(beseitigungSumme(positionen))}</span>
      </div>

      {offen && (
        <section className="formular" aria-labelledby={`${id}-titel`}>
          <div className="beschreibung-kopf">
            <h2 className="h2" id={`${id}-titel`}>
              Beseitigungsposition
            </h2>
            <button type="button" className="textknopf" onClick={() => setOffen(false)}>
              Abbrechen
            </button>
          </div>

          <div className="feld">
            <label className="label" htmlFor={`${id}-geg`}>
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
                {['Stück', 'm', 'm²', 'Pauschale'].map((u) => (
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

          <button type="button" className="knopf knopf-primaer knopf-breit" disabled={!gegenstand.trim()} onClick={fuegeHinzu}>
            Hinzufügen
          </button>
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Export (Aktion oben rechts bzw. in der Seitenleiste)
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
  // Standard: Skizze als bearbeitbare Excel-Formen; Fallback: Bild (PNG)
  const [skizzeAlsBild, setSkizzeAlsBild] = useState(false)

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

      // Skizze (falls gezeichnet) ins Blatt „Skizze Außenanlage-Aufwuchs“: als bearbeitbare
      // Excel-Formen (Standard), die vorhandene Bau-Skizze bleibt unverändert. Fallback: PNG
      // (der Export entscheidet, ob es transparent sein muss).
      const skizze = wep.skizze
      const hatSkizze = Boolean(skizze?.elemente.length)
      const skizzeFormen =
        hatSkizze && skizze
          ? {
              elemente: ({ zeichenbereich }: { zeichenbereich: Kasten }) => skizzeDatenZuFormen(skizze, zeichenbereich),
              rasterisiere: svgZuPngBrowser,
            }
          : undefined
      const skizzePng =
        hatSkizze && skizze
          ? async (o: { transparent: boolean }) => (await skizzeAlsPng(skizze, undefined, undefined, o)).arrayBuffer()
          : undefined

      const result = await exportWep(wep, sourceBuffer, { skizzeFormen, skizzePng, skizzeAlsBild })

      // Datei-Download auslösen
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)

      // Zusätzlich nach OneDrive (Exporte/): sofort oder, ohne Netz, per Warteschlange.
      // Ein Fehler hier darf den fertigen Download nicht entwerten.
      let oneDrive: string | undefined
      try {
        const status = await exportNachOneDrive(result.filename, result.blob)
        if (status === 'hochgeladen') oneDrive = 'Auch in OneDrive abgelegt (Ordner Exporte).'
        else if (status === 'wartet') {
          oneDrive = 'OneDrive: wartet auf Netz und wird beim nächsten Abgleich hochgeladen.'
        }
      } catch (e) {
        oneDrive = `OneDrive: ${e instanceof Error ? e.message : String(e)}`
      }

      setExportZustand({ typ: 'fertig', result, oneDrive })
    } catch (err) {
      setExportZustand({
        typ: 'fehler',
        meldung: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <>
      <header className="seitenkopf">
        <h1 className="h1">Export als Excel</h1>
      </header>
      <section className="formular">
        <p className="neben">
          Die App schreibt die Grün-Daten in die WEP-Vorlage. Bau-Blätter werden nicht verändert. Falls der
          Bau-Wertermittler seine Excel-Datei bereits ausgefüllt hat, diese hier hochladen – andernfalls wird die
          leere Vorlage verwendet.
        </p>

        <div className="feld">
          <label className="label" htmlFor="bau-excel">
            Bau-Excel (optional, bereits ausgefüllte Vorlage)
          </label>
          <input id="bau-excel" type="file" className="eingabe" accept=".xlsx" onChange={onBauExcelChange} />
        </div>

        {wep.skizze?.elemente.length ? (
          <label className="ankreuzen">
            <input type="checkbox" checked={skizzeAlsBild} onChange={(e) => setSkizzeAlsBild(e.target.checked)} />
            <span>Skizze als Bild statt als bearbeitbare Formen einfügen</span>
          </label>
        ) : null}

        <button
          type="button"
          className="knopf knopf-primaer knopf-breit"
          disabled={exportZustand.typ === 'laedt'}
          onClick={() => void exportieren()}
        >
          <FileSpreadsheet {...ICON} />
          {exportZustand.typ === 'laedt' ? 'Exportiere …' : 'Excel exportieren'}
        </button>

        {exportZustand.typ === 'fehler' && (
          <p className="warnung" role="alert">
            <TriangleAlert {...ICON} size={20} />
            <span>Fehler: {exportZustand.meldung}</span>
          </p>
        )}

        {exportZustand.typ === 'fertig' && (
          <div className="block">
            <p className="ok zeile">
              <Check {...ICON} />
              <span>Export erfolgreich: {exportZustand.result.filename}</span>
            </p>
            {exportZustand.oneDrive && <p className="neben">{exportZustand.oneDrive}</p>}
            {exportZustand.result.skizzeEingefuegt && (
              <p className="neben">
                Skizze ins Blatt „Skizze Außenanlage-Aufwuchs“ eingefügt
                {exportZustand.result.skizzeFormen ? ' (bearbeitbare Excel-Formen).' : ' (als Bild).'}
              </p>
            )}

            {exportZustand.result.konflikte.length > 0 && (
              <div className="warnung" role="note">
                <TriangleAlert {...ICON} size={20} />
                <div>
                  <p>
                    Folgende Formalien-Felder waren in der Bau-Excel bereits gefüllt und wurden nicht überschrieben:
                  </p>
                  <ul>
                    {exportZustand.result.konflikte.map((k) => (
                      <li key={k.feld}>
                        <strong>{k.feld}</strong> (Zelle {k.zelle}): Bau-Excel: „{k.bauExcelWert}“ · App: „{k.appWert}“
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {exportZustand.result.aufwuchsUeberlauf && (
              <p className="warnung" role="note">
                <TriangleAlert {...ICON} size={20} />
                <span>
                  Aufwuchs-Positionen laufen auf Anlage III a (Aufwuchs II) über (mehr als 28 Positionen in Aufwuchs I).
                </span>
              </p>
            )}

            {exportZustand.result.aufwuchsAbgeschnitten && (
              <p className="warnung" role="note">
                <TriangleAlert {...ICON} size={20} />
                <span>
                  Es gibt mehr als 64 Aufwuchs-Positionen. Überschüssige Positionen wurden nicht exportiert –
                  Positionen zusammenfassen.
                </span>
              </p>
            )}
          </div>
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Wiederverwendbare Eingaben
// ---------------------------------------------------------------------------

function Eingabe({
  label,
  wert,
  onChange,
  typ = 'text',
}: {
  label: string
  wert: string
  onChange: (v: string) => void
  typ?: string
}) {
  const id = useId()
  return (
    <div className="feld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} type={typ} className="eingabe" value={wert} onChange={(e) => onChange(e.target.value)} />
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
    <div className="feld">
      <label className="label" htmlFor={id}>
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
