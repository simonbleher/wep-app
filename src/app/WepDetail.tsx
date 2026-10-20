// WepDetail – Erfassung eines Wertermittlungsprotokolls.
//
// Abschnitte: Formalien | Außenanlagen | Aufwuchs | Beseitigung | Skizze.
// Handy: Kopfzeile (Zurück, Titel, Export, Menü „⋯“) und untere Leiste mit den
// fünf Abschnitten. Tablet (≥ 900 px): Seitenleiste mit Abschnitten, Summen und Export.
// Export ist eine Aktion, kein Abschnitt. Löschen liegt im Menü „⋯“ mit Rückfrage.
// Positionen (Außenanlagen, Aufwuchs, Beseitigung) werden per Antippen geändert; Formular
// und „Löschen“ (mit Rückfrage) sind eigene Bildschirme, ohne untere Leiste.
// Jede Änderung wird sofort in IndexedDB gespeichert.

import { useState, useEffect, useCallback, useRef, useId, type ChangeEvent } from 'react'
import {
  Check,
  CircleCheck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Ellipsis,
  Fence,
  FileSpreadsheet,
  FileText,
  PencilRuler,
  Plus,
  Shovel,
  Sprout,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { dupliziereWep, naechsteVorgangsNr, wepStatus, type Wep, type Position, type BeseitigungsPosition, type Formalien, type WepStatus } from '@/model'
import { alleWeps, loescheWep, ladeWep, speichereWep } from './db'
import { SkizzeTab } from './SkizzeTab'
import { PositionenAbschnitt } from './Positionen'
import { PositionHinzufuegen } from './PositionHinzufuegen'
import { PositionBearbeiten } from './PositionBearbeiten'
import { BeseitigungFormular, beseitigungSumme } from './BeseitigungFormular'
import type { Abschnitt } from './katalogDaten'
import { ICON, Kopf, Laedt, LeerZustand, Meldung, Rueckfrage, SlEintrag, StatusMarke, euroFormat } from './ui'
import { skizzeAlsPng } from '@/skizze/skizzePng'
import { skizzeDatenZuFormen, type Kasten } from '@/export/skizzeFormen'
import { svgZuPngBrowser } from '@/export/svgRaster'
import { exportWep, type ExportResult } from '@/export'
import { exportNachOneDrive } from '@/sync'
import { berechneAbschnittSumme } from '@/gruen/summen'
import { leseZahl, zahlDe, zahlFuerEingabe } from '@/gruen/format'

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

/** Bildschirm statt Abschnitt: Position hinzufügen/ändern, Beseitigung hinzufügen/ändern. */
type Maske =
  | { art: 'hinzufuegen'; abschnitt: Abschnitt }
  | { art: 'position'; abschnitt: Abschnitt; id: string }
  | { art: 'beseitigung'; id?: string }

interface Props {
  wepId: string
  onZurueck: () => void
  /** Öffnet ein anderes WEP (z. B. die Kopie nach „Duplizieren“). */
  onOeffnen?: (wepId: string) => void
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

export function WepDetail({ wepId, onZurueck, onOeffnen }: Props) {
  const [wep, setWep] = useState<Wep | null>(null)
  const [tab, setTab] = useState<Tab>('formalien')
  const [maske, setMaske] = useState<Maske | null>(null)
  const [loeschFrage, setLoeschFrage] = useState(false)
  const [exportZustand, setExportZustand] = useState<ExportZustand>({ typ: 'idle' })
  const [bauExcel, setBauExcel] = useState<File | null>(null)

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
    setMaske(null)
    window.scrollTo(0, 0)
  }, [])

  const oeffneMaske = useCallback((m: Maske) => {
    setMaske(m)
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
          <Laedt />
        </main>
      </div>
    )
  }

  const titel = wepTitel(wep)

  async function setzeStatus(status: WepStatus) {
    await speichere({ ...wep!, status })
  }

  async function duplizieren() {
    const kopie = dupliziereWep(wep!, naechsteVorgangsNr(await alleWeps()))
    await speichereWep(kopie)
    onOeffnen?.(kopie.id)
  }

  async function loeschen() {
    await loescheWep(wepId)
    setLoeschFrage(false)
    onZurueck()
  }

  function positionen(abschnitt: Abschnitt): Position[] {
    return abschnitt === 'aussenanlagen' ? wep!.gruen.aussenanlagen : wep!.gruen.aufwuchs
  }

  function setzePositionen(abschnitt: Abschnitt, liste: Position[]) {
    void speichere({ ...wep!, gruen: { ...wep!.gruen, [abschnitt]: liste } })
  }

  function fuegePositionHinzu(abschnitt: Abschnitt, pos: Position) {
    setzePositionen(abschnitt, [...positionen(abschnitt), pos])
    setMaske(null)
    window.scrollTo(0, document.body.scrollHeight)
  }

  function aenderePosition(abschnitt: Abschnitt, pos: Position) {
    setzePositionen(
      abschnitt,
      positionen(abschnitt).map((p) => (p.id === pos.id ? pos : p)),
    )
    setMaske(null)
  }

  function loeschePosition(abschnitt: Abschnitt, posId: string) {
    setzePositionen(
      abschnitt,
      positionen(abschnitt).filter((p) => p.id !== posId),
    )
    setMaske(null)
  }

  function speichereBeseitigung(pos: BeseitigungsPosition) {
    const liste = wep!.gruen.beseitigungAA
    const neu = liste.some((p) => p.id === pos.id) ? liste.map((p) => (p.id === pos.id ? pos : p)) : [...liste, pos]
    void speichere({ ...wep!, gruen: { ...wep!.gruen, beseitigungAA: neu } })
    setMaske(null)
  }

  function loescheBeseitigung(posId: string) {
    void speichere({ ...wep!, gruen: { ...wep!.gruen, beseitigungAA: wep!.gruen.beseitigungAA.filter((p) => p.id !== posId) } })
    setMaske(null)
  }

  // Die zu ändernde Position kann inzwischen fehlen (z. B. nach einem Abgleich) – dann zurück zur Liste
  const bearbeitePos = maske?.art === 'position' ? positionen(maske.abschnitt).find((p) => p.id === maske.id) : undefined
  const bearbeiteBes =
    maske?.art === 'beseitigung' && maske.id ? wep.gruen.beseitigungAA.find((p) => p.id === maske.id) : undefined
  const maskeSichtbar =
    maske !== null &&
    (maske.art === 'hinzufuegen' || (maske.art === 'position' && bearbeitePos) || (maske.art === 'beseitigung' && (!maske.id || bearbeiteBes)))

  return (
    <div className={maskeSichtbar ? 'rahmen' : 'rahmen mit-unten'}>
      <aside className="seitenleiste" aria-label="Abschnitte">
        {zurueckKnopf}
        <div className="sl-wep">
          <div className="sl-wep-text">
            <span className="sl-wep-titel">{titel}</span>
            <span className="neben">
              {wep.formalien.kleingartenanlage.trim() && `${wep.formalien.kleingartenanlage.trim()} · `}
              <span className="nowrap">{wep.id}</span>
            </span>
            <span className="sl-status">
              <StatusMarke status={wepStatus(wep)} />
            </span>
          </div>
          <WepMenue status={wepStatus(wep)} onStatus={(st) => void setzeStatus(st)} onDuplizieren={() => void duplizieren()} onLoeschen={() => setLoeschFrage(true)} />
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

      <main className={maskeSichtbar && maske?.art !== 'beseitigung' ? 'inhalt inhalt-breit' : 'inhalt'}>
        {maskeSichtbar && maske?.art === 'hinzufuegen' ? (
          <PositionHinzufuegen
            abschnitt={maske.abschnitt}
            wep={wep}
            onAbbrechen={() => setMaske(null)}
            onHinzufuegen={(pos) => fuegePositionHinzu(maske.abschnitt, pos)}
          />
        ) : maskeSichtbar && maske?.art === 'position' && bearbeitePos ? (
          <PositionBearbeiten
            abschnitt={maske.abschnitt}
            pos={bearbeitePos}
            wep={wep}
            onAbbrechen={() => setMaske(null)}
            onSpeichern={(pos) => aenderePosition(maske.abschnitt, pos)}
            onLoeschen={() => loeschePosition(maske.abschnitt, bearbeitePos.id)}
          />
        ) : maskeSichtbar && maske?.art === 'beseitigung' ? (
          <BeseitigungFormular
            key={maske.id ?? 'neu'}
            bearbeiten={bearbeiteBes}
            onAbbrechen={() => setMaske(null)}
            onFertig={speichereBeseitigung}
            onLoeschen={bearbeiteBes ? () => loescheBeseitigung(bearbeiteBes.id) : undefined}
          />
        ) : (
          <>
            <Kopf
              titel={titel}
              unter={[wep.formalien.kleingartenanlage.trim(), wepStatus(wep)].filter(Boolean).join(' · ')}
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
                  <WepMenue status={wepStatus(wep)} onStatus={(st) => void setzeStatus(st)} onDuplizieren={() => void duplizieren()} onLoeschen={() => setLoeschFrage(true)} />
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
                onHinzufuegen={() => oeffneMaske({ art: 'hinzufuegen', abschnitt: tab })}
                onBearbeiten={(id) => oeffneMaske({ art: 'position', abschnitt: tab, id })}
              />
            )}
            {tab === 'beseitigung' && (
              <BeseitigungTab
                wep={wep}
                onHinzufuegen={() => oeffneMaske({ art: 'beseitigung' })}
                onBearbeiten={(id) => oeffneMaske({ art: 'beseitigung', id })}
              />
            )}
            {tab === 'skizze' && <SkizzeTab wep={wep} onSpeichern={speichere} />}
            {tab === 'export' && (
              <ExportTab
                wep={wep}
                onSpeichern={speichere}
                exportZustand={exportZustand}
                setExportZustand={setExportZustand}
                bauExcel={bauExcel}
                setBauExcel={setBauExcel}
              />
            )}
          </>
        )}
      </main>

      {!maskeSichtbar && (
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
        <Rueckfrage
          titel={`WEP ${wep.id} löschen?`}
          text={`${titel !== `WEP ${wep.id}` ? `„${titel}“ wird` : 'Das Protokoll wird'} auf diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen. Eine Kopie in OneDrive bleibt erhalten.`}
          onAbbrechen={() => setLoeschFrage(false)}
          onBestaetigen={() => void loeschen()}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Menü „⋯“ und Rückfrage beim Löschen
// ---------------------------------------------------------------------------

function WepMenue({
  status,
  onStatus,
  onDuplizieren,
  onLoeschen,
}: {
  status: WepStatus
  onStatus: (status: WepStatus) => void
  onDuplizieren: () => void
  onLoeschen: () => void
}) {
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
            {status !== 'fertig' && (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="menue-eintrag"
                  autoFocus
                  onClick={() => {
                    setOffen(false)
                    onStatus('fertig')
                  }}
                >
                  <CircleCheck {...ICON} />
                  Als fertig markieren
                </button>
              </li>
            )}
            {status !== 'in Arbeit' && (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="menue-eintrag"
                  autoFocus={status === 'fertig'}
                  onClick={() => {
                    setOffen(false)
                    onStatus('in Arbeit')
                  }}
                >
                  <RotateCcw {...ICON} />
                  Zurück auf „In Arbeit“
                </button>
              </li>
            )}
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="menue-eintrag"
                onClick={() => {
                  setOffen(false)
                  onDuplizieren()
                }}
              >
                <CopyPlus {...ICON} />
                Duplizieren
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="menue-eintrag menue-gefahr"
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

// ---------------------------------------------------------------------------
// Formalien
// ---------------------------------------------------------------------------

function FormalienTab({ wep, onSpeichern }: { wep: Wep; onSpeichern: (wep: Wep) => Promise<void> }) {
  function setFeld(key: keyof Formalien, wert: string | number) {
    void onSpeichern({ ...wep, formalien: { ...wep.formalien, [key]: wert } })
  }

  const f = wep.formalien
  const id = useId()

  return (
    <>
      <header className="seitenkopf">
        <h1 className="h1">Formalien</h1>
      </header>

      <section className="abschnitt" aria-labelledby={`${id}-anlage`}>
        <h2 className="gruppenkopf" id={`${id}-anlage`}>
          Anlage und Parzelle
        </h2>
        <div className="formular">
          <Eingabe label="Kleingartenanlage" wert={f.kleingartenanlage} onChange={(v) => setFeld('kleingartenanlage', v)} />
          <div className="feld-reihe">
            <Eingabe label="Parzelle" wert={f.parzelle} onChange={(v) => setFeld('parzelle', v)} />
            <Eingabe label="Weg (optional)" wert={f.weg ?? ''} onChange={(v) => setFeld('weg', v)} />
          </div>
          <ZahlEingabe
            label="Parzellenfläche (m²)"
            wert={f.parzellenflaecheM2 || undefined}
            onChange={(v) => setFeld('parzellenflaecheM2', v ?? 0)}
          />
        </div>
      </section>

      <section className="abschnitt" aria-labelledby={`${id}-beteiligte`}>
        <h2 className="gruppenkopf" id={`${id}-beteiligte`}>
          Beteiligte
        </h2>
        <div className="formular">
          <Eingabe label="Unterpächter" wert={f.unterpaechter} onChange={(v) => setFeld('unterpaechter', v)} />
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
        </div>
      </section>

      <section className="abschnitt" aria-labelledby={`${id}-wert`}>
        <h2 className="gruppenkopf" id={`${id}-wert`}>
          Wertermittlung
        </h2>
        <div className="formular">
          <Eingabe
            label="Wertermittler Außenanlagen & Aufwuchs"
            wert={f.wertermittlerAussenAufwuchs}
            onChange={(v) => setFeld('wertermittlerAussenAufwuchs', v)}
          />
          <div className="feld-reihe">
            <Eingabe
              label="Wertermittlung am"
              typ="date"
              wert={f.wertermittlungAm}
              onChange={(v) => setFeld('wertermittlungAm', v)}
            />
            <Eingabe label="Vorgangs-Nr." wert={f.vorgangsNr} onChange={(v) => setFeld('vorgangsNr', v)} />
          </div>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Beseitigung (Liste; Formular: BeseitigungFormular.tsx)
// ---------------------------------------------------------------------------

function BeseitigungTab({
  wep,
  onHinzufuegen,
  onBearbeiten,
}: {
  wep: Wep
  onHinzufuegen: () => void
  onBearbeiten: (id: string) => void
}) {
  const positionen = wep.gruen.beseitigungAA

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Beseitigung</h1>
          <p className="neben">{positionen.length === 1 ? '1 Position' : `${positionen.length} Positionen`}</p>
        </div>
        <button type="button" className="knopf knopf-primaer" onClick={onHinzufuegen}>
          <Plus {...ICON} />
          Hinzufügen
        </button>
      </header>
      <p className="neben block">
        Kosten für Beseitigungen (z. B. invasive Arten, regelwidrige Anlagen). Die Richtlinie sieht für
        Fällen/Roden ein saisonales Verbot (1. März – 30. September) vor.
      </p>

      {positionen.length === 0 ? (
        <LeerZustand
          icon={Shovel}
          titel="Noch keine Positionen"
          text="Hier stehen die Kosten für zu beseitigende Anlagen und Pflanzen, zum Beispiel invasive Arten."
        />
      ) : (
        <>
          <ul className="liste" aria-label="Beseitigungspositionen">
            {positionen.map((pos) => (
              <li key={pos.id}>
                <button type="button" className="zeile" onClick={() => onBearbeiten(pos.id)}>
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
            <span>Summe Beseitigung</span>
            <span className="zahl">{euroFormat(beseitigungSumme(positionen))}</span>
          </div>
        </>
      )}

      <button type="button" className="zeile zeile-akzent" onClick={onHinzufuegen}>
        <Plus {...ICON} />
        <span className="zeile-titel">Position hinzufügen</span>
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------
// Export (Aktion oben rechts bzw. in der Seitenleiste)
// ---------------------------------------------------------------------------

function ExportTab({
  wep,
  onSpeichern,
  exportZustand,
  setExportZustand,
  bauExcel,
  setBauExcel,
}: {
  wep: Wep
  onSpeichern: (wep: Wep) => Promise<void>
  exportZustand: ExportZustand
  setExportZustand: (z: ExportZustand) => void
  bauExcel: File | null
  setBauExcel: (datei: File | null) => void
}) {
  // Standard: Skizze als bearbeitbare Excel-Formen; Fallback: Bild (PNG)
  const [skizzeAlsBild, setSkizzeAlsBild] = useState(false)
  const dateiRef = useRef<HTMLInputElement>(null)
  const id = useId()

  function onBauExcelChange(e: ChangeEvent<HTMLInputElement>) {
    setBauExcel(e.target.files?.[0] ?? null)
    // gleiche Datei erneut wählbar machen
    e.target.value = ''
  }

  async function exportieren() {
    setExportZustand({ typ: 'laedt' })
    try {
      let sourceBuffer: ArrayBuffer

      if (bauExcel) {
        // Bau-Excel hochgeladen
        sourceBuffer = await bauExcel.arrayBuffer()
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

      // Nach gelungenem Export gilt das WEP als „exportiert“ (im Menü „⋯“ zurücksetzbar)
      await onSpeichern({ ...wep, status: 'exportiert' })

      setExportZustand({ typ: 'fertig', result, oneDrive })
    } catch (err) {
      setExportZustand({
        typ: 'fehler',
        meldung: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const hatSkizze = Boolean(wep.skizze?.elemente.length)
  const ergebnis = exportZustand.typ === 'fertig' ? exportZustand : null

  return (
    <>
      <header className="seitenkopf">
        <h1 className="h1">Export als Excel</h1>
      </header>

      <p className="neben block">
        Die App schreibt die Grün-Daten in die WEP-Vorlage. Bau-Blätter werden nicht verändert.
      </p>

      <section className="abschnitt" aria-labelledby={`${id}-bau`}>
        <h2 className="gruppenkopf" id={`${id}-bau`}>
          Bau-Excel
        </h2>
        <p className="neben">
          Falls der Bau-Wertermittler seine Excel-Datei bereits ausgefüllt hat, diese hier wählen. Ohne Datei wird die
          leere Vorlage verwendet.
        </p>
        <input
          ref={dateiRef}
          id="bau-excel"
          type="file"
          hidden
          accept=".xlsx"
          aria-label="Bau-Excel (optional, bereits ausgefüllte Vorlage)"
          onChange={onBauExcelChange}
        />
        {bauExcel ? (
          <div className="zeile datei">
            <FileSpreadsheet {...ICON} />
            <span className="zeile-text">
              <span className="zeile-titel einzeilig">{bauExcel.name}</span>
              <span className="neben">{Math.max(1, Math.round(bauExcel.size / 1024))} KB · wird mit den Grün-Daten befüllt</span>
            </span>
            <button type="button" className="symbolknopf" aria-label="Bau-Excel entfernen" onClick={() => setBauExcel(null)}>
              <X {...ICON} />
            </button>
          </div>
        ) : (
          <button type="button" className="knopf knopf-breit" onClick={() => dateiRef.current?.click()}>
            <Upload {...ICON} />
            Bau-Excel auswählen (optional)
          </button>
        )}
      </section>

      {hatSkizze && (
        <section className="abschnitt" aria-labelledby={`${id}-skizze`}>
          <h2 className="gruppenkopf" id={`${id}-skizze`}>
            Skizze
          </h2>
          <label className="schalter-zeile">
            <span>Als Bild statt als bearbeitbare Formen einfügen</span>
            <input
              type="checkbox"
              className="schalter"
              checked={skizzeAlsBild}
              onChange={(e) => setSkizzeAlsBild(e.target.checked)}
            />
          </label>
        </section>
      )}

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
        <div className="ergebnis">
          <Meldung alarm>
            <p>Der Export hat nicht geklappt: {exportZustand.meldung}</p>
            <p>Die Daten im WEP sind unverändert. Bitte noch einmal versuchen.</p>
          </Meldung>
        </div>
      )}

      {ergebnis && (
        <div className="ergebnis" aria-live="polite">
          <p className="ok zeile">
            <Check {...ICON} />
            <span>Export erfolgreich: {ergebnis.result.filename}</span>
          </p>
          {ergebnis.oneDrive && <p className="neben">{ergebnis.oneDrive}</p>}
          {ergebnis.result.skizzeEingefuegt && (
            <p className="neben">
              Skizze ins Blatt „Skizze Außenanlage-Aufwuchs“ eingefügt
              {ergebnis.result.skizzeFormen ? ' (bearbeitbare Excel-Formen).' : ' (als Bild).'}
            </p>
          )}

          {ergebnis.result.konflikte.length > 0 && (
            <Meldung>
              <p>Folgende Formalien-Felder waren in der Bau-Excel bereits gefüllt und wurden nicht überschrieben:</p>
              <ul className="meldung-liste">
                {ergebnis.result.konflikte.map((k) => (
                  <li key={k.feld}>
                    <strong>{k.feld}</strong> (Zelle {k.zelle}): Bau-Excel: „{k.bauExcelWert}“ · App: „{k.appWert}“
                  </li>
                ))}
              </ul>
            </Meldung>
          )}

          {ergebnis.result.aufwuchsUeberlauf && (
            <Meldung>
              <p>Aufwuchs-Positionen laufen auf Anlage III a (Aufwuchs II) über (mehr als 28 Positionen in Aufwuchs I).</p>
            </Meldung>
          )}

          {ergebnis.result.aufwuchsAbgeschnitten && (
            <Meldung>
              <p>
                Es gibt mehr als 64 Aufwuchs-Positionen. Überschüssige Positionen wurden nicht exportiert – Positionen
                zusammenfassen.
              </p>
            </Meldung>
          )}
        </div>
      )}
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
