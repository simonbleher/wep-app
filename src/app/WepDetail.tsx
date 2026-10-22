// WepDetail – Erfassung eines Wertermittlungsprotokolls.
//
// Abschnitte: Formalien | Außenanlagen | Aufwuchs | Beseitigung | Fotos | Skizze (Grün-Teil) und
// Baulichkeiten | Mängel | Abwasser | Beseitigung Bau | Skizze Bau (Bau-Teil).
// Welche Abschnitte und welchen Export es gibt, bestimmt die Rolle (Profil, pro WEP umschaltbar).
// Handy: Kopfzeile (Zurück, Titel, Export, Menü „⋯“) und untere Leiste (bei „Beides“ wischbar). Tablet (≥ 900 px): Seitenleiste mit Abschnitten, Summen und Export.
// Export ist eine Aktion, kein Abschnitt. Löschen liegt im Menü „⋯“ mit Rückfrage.
// Positionen (Außenanlagen, Aufwuchs, Beseitigung) werden per Antippen geändert; Formular
// und „Löschen“ (mit Rückfrage) sind eigene Bildschirme, ohne untere Leiste.
// Jede Änderung wird sofort in IndexedDB gespeichert.

import { useState, useEffect, useCallback, useRef, useId } from 'react'
import {
  Camera,
  Check,
  CircleCheck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Ellipsis,
  Fence,
  Building2,
  Droplets,
  Hammer,
  Ruler,
  TriangleAlert,
  FileSpreadsheet,
  FileText,
  PencilRuler,
  Plus,
  Shovel,
  Sprout,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { dupliziereWep, hatBauTeil, type BauteilArt, hatGruenTeil, naechsteVorgangsNr, rolleAusTeilen, wepRolle, wepStatus, type Rolle, type Wep, type Position, type BeseitigungsPosition, type Formalien, type WepStatus } from '@/model'
import { PAPIERKORB_TAGE, belegteNummern, ladeKonflikt, loescheWep } from '@/sync/aktionen'
import type { KonfliktInfo } from '@/sync/types'
import { KonfliktHinweis } from './KonfliktHinweis'
import { ladeWep, speichereWep } from './db'
import { SkizzeTab } from './SkizzeTab'
import { SkizzeBauTab } from './SkizzeBauTab'
import { BauExcelBereich, useBauNachladen, useBauStand, type BauNachladeStand, type BauStand } from './BauExcel'
import { bauExcelFuerExport } from '@/bauexcel'
import { FotoGruppe, FotosTab, useFotoNachladen, useFotoRecords } from './Fotos'
import { fotoOrdnerName, sammleExportFotos, zipDateien } from '@/fotos/exportOrdner'
import { dbAblage } from '@/fotos/ablage'
import { loeseFotosVonPosition, type WepAendern } from '@/fotos'
import { PositionenAbschnitt } from './Positionen'
import { PositionHinzufuegen } from './PositionHinzufuegen'
import { PositionBearbeiten } from './PositionBearbeiten'
import { BeseitigungFormular, beseitigungSumme } from './BeseitigungFormular'
import { BaulichkeitenTab, BauteilFormular } from './BauBaulichkeiten'
import { MaengelTab } from './BauMaengel'
import { AbwasserTab } from './BauAbwasser'
import { BeseitigungBauTab, EINHEITEN_BAU } from './BauBeseitigung'
import { aendereBauTeil, bauFuerExport, entferneBauteil, ersetzeBauteil, neuesBauteil } from './bauHelfer'
import { BESEITIGUNG_TEXTBAUSTEINE } from '@/bau'
import type { Abschnitt } from './katalogDaten'
import { ICON, Kopf, TEIL_TEXT, Laedt, LeerZustand, Meldung, Rueckfrage, SlEintrag, StatusMarke, TeilMarke, euroFormat } from './ui'
import { lokalesProfil } from '@/profil'
import { skizzeAlsPng } from '@/skizze/skizzePng'
import { skizzeDatenZuFormen, type Kasten } from '@/export/skizzeFormen'
import { grundrissZuFormen } from '@/export/grundrissFormen'
import { svgZuPngBrowser } from '@/export/svgRaster'
import { exportWep, type ExportResult } from '@/export'
import { exportFotosNachOneDrive, exportNachOneDrive, ladeBauExcelAusOneDrive, ladeFotoAusOneDrive } from '@/sync'
import { berechneAbschnittSumme } from '@/gruen/summen'
import { Capacitor } from '@capacitor/core'
import { speichereDatei, speicherText } from './dateiSpeichern'
import { leseZahl, zahlDe, zahlFuerEingabe } from '@/gruen/format'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

type GruenBereich = 'aussenanlagen' | 'aufwuchs' | 'beseitigung' | 'skizze'
type BauBereich = 'baulichkeiten' | 'maengel' | 'abwasser' | 'beseitigungBau' | 'skizzeBau'
type Bereich = 'formalien' | 'fotos' | GruenBereich | BauBereich
type Tab = Bereich | 'export'

type ExportZustand =
  | { typ: 'idle' }
  | { typ: 'laedt' }
  | { typ: 'fertig'; result: ExportResult; datei?: string; oneDrive?: string; fotos?: string }
  | { typ: 'fehler'; meldung: string }

/** Bildschirm statt Abschnitt: Position hinzufügen/ändern, Beseitigung hinzufügen/ändern. */
type Maske =
  | { art: 'hinzufuegen'; abschnitt: Abschnitt }
  | { art: 'position'; abschnitt: Abschnitt; id: string }
  | { art: 'beseitigung'; id?: string; vorlage?: { gegenstand: string; einheit: string; menge: number } }
  | { art: 'bauteil'; id?: string; bauteilArt?: BauteilArt }
  | { art: 'bauBeseitigung'; id?: string }

interface Props {
  wepId: string
  onZurueck: () => void
  /** Öffnet ein anderes WEP (z. B. die Kopie nach „Duplizieren“). */
  onOeffnen?: (wepId: string) => void
}

/** `teil`: zu welchem Teil der Abschnitt gehört; `titelMitTeil`: Titel, wenn beide Teile sichtbar sind (sonst nicht eindeutig). */
const BEREICHE: { id: Bereich; titel: string; kurz: string; icon: LucideIcon; teil: 'alle' | 'gruen' | 'bau'; titelMitTeil?: string }[] = [
  { id: 'formalien', titel: 'Formalien', kurz: 'Formalien', icon: FileText, teil: 'alle' },
  { id: 'aussenanlagen', titel: 'Außenanlagen', kurz: 'Außen', icon: Fence, teil: 'gruen' },
  { id: 'aufwuchs', titel: 'Aufwuchs', kurz: 'Aufwuchs', icon: Sprout, teil: 'gruen' },
  { id: 'beseitigung', titel: 'Beseitigung', kurz: 'Beseitigung', icon: Shovel, teil: 'gruen', titelMitTeil: 'Beseitigung Grün' },
  { id: 'baulichkeiten', titel: 'Baulichkeiten', kurz: 'Bauten', icon: Building2, teil: 'bau' },
  { id: 'maengel', titel: 'Mängel', kurz: 'Mängel', icon: TriangleAlert, teil: 'bau' },
  { id: 'abwasser', titel: 'Abwasser', kurz: 'Abwasser', icon: Droplets, teil: 'bau' },
  { id: 'beseitigungBau', titel: 'Beseitigung Bau', kurz: 'Beseitigung', icon: Hammer, teil: 'bau', titelMitTeil: 'Beseitigung Bau' },
  { id: 'fotos', titel: 'Fotos', kurz: 'Fotos', icon: Camera, teil: 'alle' },
  { id: 'skizze', titel: 'Skizze', kurz: 'Skizze', icon: PencilRuler, teil: 'gruen', titelMitTeil: 'Skizze Grün' },
  { id: 'skizzeBau', titel: 'Skizze Bau', kurz: 'Skizze', icon: Ruler, teil: 'bau', titelMitTeil: 'Skizze Bau' },
]

/** Abschnitte, die zur Rolle passen (Reihenfolge wie in BEREICHE). */
export function bereicheFuerRolle(rolle: Rolle): typeof BEREICHE {
  return BEREICHE.filter((b) => b.teil === 'alle' || (b.teil === 'gruen' ? hatGruenTeil(rolle) : hatBauTeil(rolle)))
}

/** Titel eines Abschnitts; bei „Grün + Bau“ mit Teil, wo sonst zwei gleich hießen. */
function bereichTitel(b: (typeof BEREICHE)[number], beides: boolean): string {
  return beides && b.titelMitTeil ? b.titelMitTeil : b.titel
}

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
  const [konflikt, setKonflikt] = useState<KonfliktInfo | undefined>()
  // Rolle aus dem Profil dieses Geräts; das WEP kann abweichen (`wep.rolle`)
  const [profilRolle] = useState<Rolle>(() => lokalesProfil.lade().profil.rolle)
  // Baupreisindex-Werte aus dem Profil dieses Geräts (überschreiben die Tabelle der App)
  const [profilIndex] = useState<Record<string, number> | undefined>(() => lokalesProfil.lade().profil.baupreisindex)
  const [maengelStart, setMaengelStart] = useState<string | undefined>()
  // Immer der neueste Stand: Fotos werden asynchron (nach dem Verkleinern) eingetragen
  const wepRef = useRef<Wep | null>(null)
  const fotoRecords = useFotoRecords(wepId)
  const fotoNachladen = useFotoNachladen(wep, fotoRecords)
  const bauStand = useBauStand(wep)
  const bauNachladen = useBauNachladen(wep, bauStand)

  // WEP aus IndexedDB laden
  useEffect(() => {
    void ladeWep(wepId).then((geladen) => {
      if (geladen) {
        wepRef.current = geladen
        setWep(geladen)
      }
    })
    void ladeKonflikt(wepId).then(setKonflikt)
  }, [wepId])

  // Speichert und aktualisiert den Zustand gleichzeitig
  const speichere = useCallback(async (neu: Wep): Promise<void> => {
    wepRef.current = neu
    setWep(neu)
    await speichereWep(neu)
  }, [])

  // Änderung auf Basis des neuesten Stands (für Fotos, die erst nach dem Verkleinern eingetragen werden)
  const aendere = useCallback<WepAendern>(
    async (fn) => {
      if (wepRef.current) await speichere(fn(wepRef.current))
    },
    [speichere],
  )

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
  const rolle = wepRolle(wep, profilRolle)
  const bereiche = bereicheFuerRolle(rolle)
  const beides = rolle === 'beides'
  // Schaltet den Grün- oder Bau-Teil für dieses WEP (die Rolle steht immer am WEP)
  function setzeTeil(teil: 'gruen' | 'bau', an: boolean) {
    const neu = rolleAusTeilen(teil === 'gruen' ? an : hatGruenTeil(rolle), teil === 'bau' ? an : hatBauTeil(rolle))
    const naechste = { ...wep!, rolle: neu }
    // War der sichtbare Abschnitt Teil des abgeschalteten Teils, geht es zurück zu den Formalien
    if (!bereicheFuerRolle(neu).some((b) => b.id === tab) && tab !== 'export') setTab('formalien')
    setExportZustand({ typ: 'idle' })
    void speichere(naechste)
  }

  async function setzeStatus(status: WepStatus) {
    await speichere({ ...wep!, status })
  }

  async function duplizieren() {
    const kopie = dupliziereWep(wep!, naechsteVorgangsNr(await belegteNummern()))
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
    const name = positionen(abschnitt).find((p) => p.id === posId)?.bezeichnung ?? ''
    // Fotos der Position bleiben erhalten (hängen danach am WEP allgemein)
    void speichere(
      loeseFotosVonPosition(
        { ...wep!, gruen: { ...wep!.gruen, [abschnitt]: positionen(abschnitt).filter((p) => p.id !== posId) } },
        posId,
        name,
      ),
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
    const name = wep!.gruen.beseitigungAA.find((p) => p.id === posId)?.gegenstand ?? ''
    void speichere(
      loeseFotosVonPosition(
        { ...wep!, gruen: { ...wep!.gruen, beseitigungAA: wep!.gruen.beseitigungAA.filter((p) => p.id !== posId) } },
        posId,
        name,
      ),
    )
    setMaske(null)
  }

  // Die zu ändernde Position kann inzwischen fehlen (z. B. nach einem Abgleich) – dann zurück zur Liste
  const bearbeitePos = maske?.art === 'position' ? positionen(maske.abschnitt).find((p) => p.id === maske.id) : undefined
  const bearbeiteBes =
    maske?.art === 'beseitigung' && maske.id ? wep.gruen.beseitigungAA.find((p) => p.id === maske.id) : undefined
  const bearbeiteBauteil = maske?.art === 'bauteil' && maske.id ? wep.bau?.bauteile.find((b) => b.id === maske.id) : undefined
  const bearbeiteBauBes = maske?.art === 'bauBeseitigung' && maske.id ? wep.bau?.beseitigung.find((p) => p.id === maske.id) : undefined
  const maskeSichtbar =
    maske !== null &&
    (maske.art === 'hinzufuegen' ||
      (maske.art === 'bauteil' && (Boolean(maske.bauteilArt) || Boolean(bearbeiteBauteil))) ||
      maske.art === 'bauBeseitigung' || (maske.art === 'position' && bearbeitePos) || (maske.art === 'beseitigung' && (!maske.id || bearbeiteBes)))

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
              <TeilMarke rolle={rolle} />
              <StatusMarke status={wepStatus(wep)} />
            </span>
          </div>
          <WepMenue status={wepStatus(wep)} onStatus={(st) => void setzeStatus(st)} onDuplizieren={() => void duplizieren()} onLoeschen={() => setLoeschFrage(true)} />
        </div>
        <nav className="sl-nav">
          {bereiche.map((b) => {
            const summe = bereichSumme(wep, b.id)
            return (
              <SlEintrag
                key={b.id}
                icon={b.icon}
                text={bereichTitel(b, beides)}
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

      <main className={maskeSichtbar && maske?.art !== 'beseitigung' && maske?.art !== 'bauteil' && maske?.art !== 'bauBeseitigung' ? 'inhalt inhalt-breit' : 'inhalt'}>
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
            fotos={
              <FotoGruppe
                wep={wep}
                positionId={bearbeitePos.id}
                aendere={aendere}
                records={fotoRecords}
                titel="Fotos zu dieser Position"
              />
            }
          />
        ) : maskeSichtbar && maske?.art === 'beseitigung' ? (
          <BeseitigungFormular
            key={maske.id ?? 'neu'}
            bearbeiten={bearbeiteBes}
            vorlage={maske.vorlage}
            onAbbrechen={() => setMaske(null)}
            onFertig={speichereBeseitigung}
            onLoeschen={bearbeiteBes ? () => loescheBeseitigung(bearbeiteBes.id) : undefined}
            fotos={
              bearbeiteBes && (
                <FotoGruppe
                  wep={wep}
                  positionId={bearbeiteBes.id}
                  aendere={aendere}
                  records={fotoRecords}
                  titel="Fotos zu dieser Position"
                />
              )
            }
          />
        ) : maskeSichtbar && maske?.art === 'bauteil' ? (
          <BauteilFormular
            key={bearbeiteBauteil?.id ?? 'neu'}
            wep={wep}
            start={bearbeiteBauteil ?? neuesBauteil(maske.bauteilArt ?? 'laube', wep.bau?.bauteile ?? [])}
            neu={!bearbeiteBauteil}
            profilIndex={profilIndex}
            onAbbrechen={() => setMaske(null)}
            onFertig={(b) => {
              void aendere((w) => aendereBauTeil(w, (d) => ersetzeBauteil(d, b)))
              setMaske(null)
            }}
            onLoeschen={() => {
              void aendere((w) => aendereBauTeil(w, (d) => entferneBauteil(d, maske.id ?? '')))
              setMaske(null)
            }}
            onMaengel={(b) => {
              void aendere((w) => aendereBauTeil(w, (d) => ersetzeBauteil(d, b)))
              setMaengelStart(b.id)
              setMaske(null)
              setTab('maengel')
            }}
          />
        ) : maskeSichtbar && maske?.art === 'bauBeseitigung' ? (
          <BeseitigungFormular
            key={maske.id ?? 'neu'}
            bearbeiten={bearbeiteBauBes}
            abschnittText="Beseitigungskosten Bau (Abschnitt 1, Anlage 4)"
            einheiten={EINHEITEN_BAU}
            bausteine={BESEITIGUNG_TEXTBAUSTEINE}
            onAbbrechen={() => setMaske(null)}
            onFertig={(p) => {
              void aendere((w) =>
                aendereBauTeil(w, (d) => ({ ...d, beseitigung: d.beseitigung.some((x) => x.id === p.id) ? d.beseitigung.map((x) => (x.id === p.id ? p : x)) : [...d.beseitigung, p] })),
              )
              setMaske(null)
            }}
            onLoeschen={
              bearbeiteBauBes
                ? () => {
                    void aendere((w) => aendereBauTeil(w, (d) => ({ ...d, beseitigung: d.beseitigung.filter((x) => x.id !== bearbeiteBauBes.id) })))
                    setMaske(null)
                  }
                : undefined
            }
          />
        ) : (
          <>
            <Kopf
              titel={titel}
              unter={[wep.formalien.kleingartenanlage.trim(), TEIL_TEXT[rolle], wepStatus(wep)].filter(Boolean).join(' · ')}
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

            {konflikt && (
              <KonfliktHinweis
                wepId={wep.id}
                wep={wep}
                konflikt={konflikt}
                onGeloest={(neu) => {
                  setKonflikt(undefined)
                  if (neu) setWep(neu)
                  else onZurueck() // „Doch löschen“: das WEP liegt jetzt im Papierkorb
                }}
              />
            )}

            {tab === 'formalien' && (
              <FormalienTab
                wep={wep}
                onSpeichern={speichere}
                aendere={aendere}
                leseWep={() => wepRef.current}
                bauStand={bauStand}
                bauNachladen={bauNachladen}
                rolle={rolle}
                profilRolle={profilRolle}
                onTeil={setzeTeil}
              />
            )}
            {(tab === 'aussenanlagen' || tab === 'aufwuchs') && (
              <PositionenAbschnitt
                key={tab}
                wep={wep}
                abschnitt={tab}
                onSpeichern={speichere}
                onHinzufuegen={() => oeffneMaske({ art: 'hinzufuegen', abschnitt: tab })}
                onBearbeiten={(id) => oeffneMaske({ art: 'position', abschnitt: tab, id })}
                onBeseitigung={(vorlage) => {
                  setTab('beseitigung')
                  oeffneMaske({ art: 'beseitigung', vorlage })
                }}
              />
            )}
            {tab === 'beseitigung' && (
              <BeseitigungTab
                wep={wep}
                onHinzufuegen={() => oeffneMaske({ art: 'beseitigung' })}
                onBearbeiten={(id) => oeffneMaske({ art: 'beseitigung', id })}
              />
            )}
            {tab === 'baulichkeiten' && bereiche.some((b) => b.id === tab) && (
              <BaulichkeitenTab
                wep={wep}
                aendere={aendere}
                profilIndex={profilIndex}
                onOeffnen={(ziel) => oeffneMaske('id' in ziel ? { art: 'bauteil', id: ziel.id } : { art: 'bauteil', bauteilArt: ziel.neu })}
              />
            )}
            {tab === 'maengel' && bereiche.some((b) => b.id === tab) && <MaengelTab wep={wep} aendere={aendere} profilIndex={profilIndex} start={maengelStart} />}
            {tab === 'abwasser' && bereiche.some((b) => b.id === tab) && <AbwasserTab wep={wep} aendere={aendere} profilIndex={profilIndex} />}
            {tab === 'beseitigungBau' && bereiche.some((b) => b.id === tab) && <BeseitigungBauTab wep={wep} aendere={aendere} profilIndex={profilIndex} onOeffnen={(id) => oeffneMaske({ art: 'bauBeseitigung', id })} />}
            {tab === 'skizzeBau' && bereiche.some((b) => b.id === tab) && <SkizzeBauTab wep={wep} aendere={aendere} />}
            {tab === 'fotos' && <FotosTab wep={wep} aendere={aendere} records={fotoRecords} nachladen={fotoNachladen} />}
            {tab === 'skizze' && <SkizzeTab wep={wep} onSpeichern={speichere} />}
            {tab === 'export' && (
              <ExportTab
                wep={wep}
                onSpeichern={speichere}
                exportZustand={exportZustand}
                setExportZustand={setExportZustand}
                aendere={aendere}
                leseWep={() => wepRef.current}
                bauStand={bauStand}
                bauNachladen={bauNachladen}
                rolle={rolle}
                profilIndex={profilIndex}
              />
            )}
          </>
        )}
      </main>

      {!maskeSichtbar && (
        <nav className={beides ? 'unten unten-scroll nur-handy' : 'unten nur-handy'} aria-label="Abschnitte">
          {bereiche.map((b) => (
            <button
              key={b.id}
              type="button"
              className="unten-knopf"
              aria-label={bereichTitel(b, beides)}
              aria-current={tab === b.id ? 'page' : undefined}
              onClick={() => wechsle(b.id)}
            >
              <b.icon {...ICON} />
              <span>{beides && b.titelMitTeil ? b.titelMitTeil.replace('Beseitigung', 'Besei.') : b.kurz}</span>
            </button>
          ))}
        </nav>
      )}

      {loeschFrage && (
        <Rueckfrage
          titel={`WEP ${wep.id} in den Papierkorb?`}
          text={`${titel !== `WEP ${wep.id}` ? `„${titel}“ wird` : 'Das Protokoll wird'} auf allen deinen Geräten entfernt. Du findest es ${PAPIERKORB_TAGE} Tage lang im Papierkorb und kannst es dort wiederherstellen.`}
          bestaetigen="In den Papierkorb"
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
                In den Papierkorb …
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

function FormalienTab({
  wep,
  onSpeichern,
  aendere,
  leseWep,
  bauStand,
  bauNachladen,
  rolle,
  profilRolle,
  onTeil,
}: {
  wep: Wep
  onSpeichern: (wep: Wep) => Promise<void>
  aendere: WepAendern
  leseWep: () => Wep | null
  bauStand: BauStand
  bauNachladen: BauNachladeStand
  rolle: Rolle
  profilRolle: Rolle
  onTeil: (teil: 'gruen' | 'bau', an: boolean) => void
}) {
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

      {hatGruenTeil(rolle) && (
        <BauExcelBereich wep={wep} aendere={aendere} leseWep={leseWep} stand={bauStand} nachladen={bauNachladen} />
      )}

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
          {hatBauTeil(rolle) && (
            <Eingabe
              label="Wertermittler Baulichkeiten"
              wert={f.wertermittlerBaulichkeiten}
              onChange={(v) => setFeld('wertermittlerBaulichkeiten', v)}
            />
          )}
          {hatGruenTeil(rolle) && (
            <Eingabe
              label="Wertermittler Außenanlagen & Aufwuchs"
              wert={f.wertermittlerAussenAufwuchs}
              onChange={(v) => setFeld('wertermittlerAussenAufwuchs', v)}
            />
          )}
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

      <section className="abschnitt" aria-labelledby={`${id}-teil`}>
        <h2 className="gruppenkopf" id={`${id}-teil`}>
          Bearbeiteter Teil
        </h2>
        <p className="neben block">
          Aus dem Profil: {TEIL_TEXT[profilRolle]}. {wep.rolle ? `Für dieses WEP: ${TEIL_TEXT[wep.rolle]}.` : 'Für Sonderfälle lässt sich dieses WEP umschalten.'}
        </p>
        <label className="schalter-zeile">
          <span>Dieses WEP als Grün bearbeiten</span>
          <input
            type="checkbox"
            className="schalter"
            checked={hatGruenTeil(rolle)}
            disabled={!hatBauTeil(rolle)}
            onChange={(e) => onTeil('gruen', e.target.checked)}
          />
        </label>
        <label className="schalter-zeile">
          <span>Dieses WEP als Bau bearbeiten</span>
          <input
            type="checkbox"
            className="schalter"
            checked={hatBauTeil(rolle)}
            disabled={!hatGruenTeil(rolle)}
            onChange={(e) => onTeil('bau', e.target.checked)}
          />
        </label>
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

/**
 * Fotos zum Export: In OneDrive als Ordner Exporte/<Nr>_Fotos (sprechende Dateinamen, Nummer =
 * Positionsnummer), ohne Konto als ZIP zum Herunterladen. Nicht in der Excel-Datei.
 */
async function exportiereFotos(wep: Wep): Promise<string> {
  const ordner = fotoOrdnerName(wep.id)
  const { dateien, fehlen } = await sammleExportFotos(wep, dbAblage, ladeFotoAusOneDrive)
  const fehlt = fehlen.length ? ` ${fehlen.length} Foto${fehlen.length === 1 ? ' fehlt' : 's fehlen'} (noch nicht auf diesem Gerät).` : ''
  if (!dateien.length) return `Keine Fotos exportiert.${fehlt}`
  const od = await exportFotosNachOneDrive(ordner, dateien)
  if (od === 'ohne-konto') {
    const zip = await zipDateien(dateien)
    const e = await speichereDatei(zip, `${ordner}.zip`)
    if (e === 'abgebrochen') return `Fotos: ${speicherText(e, `${ordner}.zip`)}.${fehlt}`
    const verb = e === 'gespeichert' ? 'gespeichert' : 'heruntergeladen'
    return `${dateien.length} Foto${dateien.length === 1 ? '' : 's'} als ZIP ${verb} (${ordner}.zip).${fehlt}`
  }
  if (od.status === 'hochgeladen') return `${dateien.length} Foto${dateien.length === 1 ? '' : 's'} in OneDrive abgelegt (Ordner Exporte/${ordner}).${fehlt}`
  return `Fotos: ${od.wartend} Datei${od.wartend === 1 ? '' : 'en'} warten auf Netz und gehen beim nächsten Abgleich nach OneDrive (Exporte/${ordner}).${fehlt}`
}

function ExportTab({
  wep,
  onSpeichern,
  exportZustand,
  setExportZustand,
  aendere,
  leseWep,
  bauStand,
  bauNachladen,
  rolle,
  profilIndex,
}: {
  wep: Wep
  onSpeichern: (wep: Wep) => Promise<void>
  profilIndex?: Record<string, number>
  exportZustand: ExportZustand
  setExportZustand: (z: ExportZustand) => void
  aendere: WepAendern
  leseWep: () => Wep | null
  bauStand: BauStand
  bauNachladen: BauNachladeStand
  rolle: Rolle
}) {
  // Nur Bau: eigener Export mit Bau-Blättern und Formalien, ohne Grün-Teil und ohne Bau-Excel
  const nurBau = rolle === 'bau'
  // Standard: Skizze als bearbeitbare Excel-Formen; Fallback: Bild (PNG)
  const [skizzeAlsBild, setSkizzeAlsBild] = useState(false)
  const id = useId()

  async function exportieren() {
    setExportZustand({ typ: 'laedt' })
    try {
      // Die am WEP gemerkte Bau-Excel (lokal, sonst aus OneDrive geholt); ohne sie die leere Vorlage
      let sourceBuffer = nurBau ? undefined : await bauExcelFuerExport({ wep, quelle: { hole: ladeBauExcelAusOneDrive } })
      if (!sourceBuffer) {
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

      // Bau-Teil: Index am WEP merken, Baubeschreibung aktualisieren
      const wepFuerExport = hatBauTeil(rolle) ? bauFuerExport(wep, profilIndex) : wep
      // Grundriss (Paket 3) als bearbeitbare Formen ins Blatt „Skizze Bau“
      const grundriss = hatBauTeil(rolle) ? wepFuerExport.grundriss : undefined
      const grundrissFormen =
        grundriss && grundriss.teile.length
          ? { elemente: ({ zeichenbereich }: { zeichenbereich: Kasten }) => grundrissZuFormen(grundriss, zeichenbereich, wepFuerExport.bau?.bauteile ?? []) }
          : undefined
      const result = await exportWep(wepFuerExport, sourceBuffer, {
        profilIndex,
        grundrissFormen,
        skizzeFormen,
        skizzePng,
        skizzeAlsBild,
        formalienAbgeglichen: wep.bauExcel?.abgeglichen === true,
        teil: rolle,
      })

      // Datei an den Nutzer: im Browser als Download, im Windows-Programm über „Speichern unter…“.
      // In der Android-App geht sie mit Konto nur nach OneDrive (kein Dialog bei jedem Export),
      // ohne Konto über „Speichern unter…“.
      const nativ = Capacitor.isNativePlatform()
      let datei: string | undefined
      if (!nativ) {
        const e = await speichereDatei(result.blob, result.filename)
        if (e === 'abgebrochen') datei = speicherText(e, result.filename) + '.'
      }

      // Zusätzlich nach OneDrive (Exporte/): sofort oder, ohne Netz, per Warteschlange.
      // Ein Fehler hier darf den fertigen Download nicht entwerten.
      let oneDrive: string | undefined
      try {
        const status = await exportNachOneDrive(result.filename, result.blob)
        if (status === 'ohne-konto' && nativ) {
          oneDrive = `Ohne Konto: ${speicherText(await speichereDatei(result.blob, result.filename), result.filename)}.`
        } else if (status === 'hochgeladen') oneDrive = nativ ? 'In OneDrive abgelegt (Ordner Exporte).' : 'Auch in OneDrive abgelegt (Ordner Exporte).'
        else if (status === 'wartet') {
          oneDrive = 'OneDrive: wartet auf Netz und wird beim nächsten Abgleich hochgeladen.'
        }
      } catch (e) {
        oneDrive = `OneDrive: ${e instanceof Error ? e.message : String(e)}`
      }

      // Fotos: Ordner Exporte/<Nr>_Fotos in OneDrive, ohne Konto ein ZIP zum Herunterladen
      let fotos: string | undefined
      if (wep.fotos?.length) {
        try {
          fotos = await exportiereFotos(wep)
        } catch (e) {
          fotos = `Fotos: ${e instanceof Error ? e.message : String(e)}`
        }
      }

      // Nach gelungenem Export gilt das WEP als „exportiert“ (im Menü „⋯“ zurücksetzbar)
      await onSpeichern({ ...wepFuerExport, status: 'exportiert' })

      setExportZustand({ typ: 'fertig', result, datei, oneDrive, fotos })
    } catch (err) {
      setExportZustand({
        typ: 'fehler',
        meldung: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const hatSkizze = !nurBau && Boolean(wep.skizze?.elemente.length)
  const ergebnis = exportZustand.typ === 'fertig' ? exportZustand : null

  return (
    <>
      <header className="seitenkopf">
        <h1 className="h1">Export als Excel</h1>
      </header>

      <p className="neben block">
        {nurBau
          ? 'Die App schreibt die Bau-Blätter und die Formalien in die WEP-Vorlage (Datei „…_WEP_Bau.xlsx“). Die Grün-Blätter bleiben leer.'
          : rolle === 'beides'
            ? wep.bau
              ? 'Die App schreibt Grün- und Bau-Daten in die WEP-Vorlage. Die Bau-Blätter werden aus den Bau-Eingaben der App gefüllt (auch in einer eingelesenen Bau-Excel).'
              : 'Die App schreibt die Grün-Daten in die WEP-Vorlage (oder in die eingelesene Bau-Excel). Die Bau-Blätter bleiben, wie sie sind.'
            : 'Die App schreibt die Grün-Daten in die WEP-Vorlage. Bau-Blätter werden nicht verändert.'}
      </p>

      {!nurBau && (
        <BauExcelBereich wep={wep} aendere={aendere} leseWep={leseWep} stand={bauStand} nachladen={bauNachladen} />
      )}

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
          {ergebnis.datei && <p className="neben">{ergebnis.datei}</p>}
          {ergebnis.oneDrive && <p className="neben">{ergebnis.oneDrive}</p>}
          {ergebnis.fotos && <p className="neben">{ergebnis.fotos}</p>}
          {ergebnis.result.skizzeEingefuegt && (
            <p className="neben">
              Skizze ins Blatt „Skizze Außenanlage-Aufwuchs“ eingefügt
              {ergebnis.result.skizzeFormen ? ' (bearbeitbare Excel-Formen).' : ' (als Bild).'}
            </p>
          )}

          {ergebnis.result.grundriss && (
            <p className="neben">Grundriss ins Blatt „Skizze Bau“ eingefügt (bearbeitbare Excel-Formen mit Maßketten und Massenberechnung).</p>
          )}
          {ergebnis.result.grundriss && ergebnis.result.grundriss.fremdeFormen > 0 && (
            <Meldung>
              <p>
                Das Blatt „Skizze Bau“ hatte schon {ergebnis.result.grundriss.fremdeFormen} eigene Formen (z. B. eine von Hand gezeichnete Skizze). Sie sind unverändert; der Grundriss der App liegt
                darüber – bitte im Excel prüfen und ggf. eine der beiden Skizzen löschen.
              </p>
            </Meldung>
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

          {ergebnis.result.bau && <BauExportHinweise bau={ergebnis.result.bau} />}

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

/** Hinweise zum Bau-Export: korrigierte Formeln der Vorlage, Bauteile ohne Platz, gekürzte Texte. */
function BauExportHinweise({ bau }: { bau: NonNullable<ExportResult['bau']> }) {
  return (
    <>
      {bau.index && (
        <p className="neben">
          Baupreisindex {bau.index.jahr}: {zahlDe(bau.index.wert, 1)} ({bau.index.quelle})
        </p>
      )}
      {bau.korrekturen.length > 0 && (
        <Meldung>
          <p>Die App hat offensichtliche Fehler in den Formeln der Vorlage in dieser Datei korrigiert:</p>
          <ul className="meldung-liste">
            {bau.korrekturen.map((k) => (
              <li key={`${k.blatt}${k.zelle}`}>
                <strong>
                  {k.blatt} {k.zelle}
                </strong>
                : {k.grund}
              </li>
            ))}
          </ul>
        </Meldung>
      )}
      {bau.nichtExportiert.length > 0 && (
        <Meldung>
          <p>
            Für {bau.nichtExportiert.map((b) => b.kuerzel).join(', ')} hat die Vorlage keinen Platz; {bau.nichtExportiert.length === 1 ? 'das Bauteil wurde' : 'die Bauteile wurden'} nicht exportiert.
          </p>
        </Meldung>
      )}
      {bau.beschreibungGekuerzt > 0 && (
        <Meldung>
          <p>Die Baubeschreibung ist länger als das Feld in der Vorlage: {bau.beschreibungGekuerzt} Zeilen fehlen am Ende.</p>
        </Meldung>
      )}
      {bau.beseitigungGekuerzt > 0 && (
        <Meldung>
          <p>Die Vorlage hat nur 11 Zeilen für Beseitigungskosten Bau: {bau.beseitigungGekuerzt} Position(en) wurden nicht exportiert.</p>
        </Meldung>
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
  // Ändert sich der Wert von außen (z. B. aus der Bau-Excel übernommen), zeigt das Feld ihn an;
  // eigenes Tippen (z. B. „35,“) bleibt unberührt, solange es denselben Wert ergibt
  useEffect(() => {
    const aktuell = text.trim() === '' ? undefined : leseZahl(text)
    if (aktuell !== wert) setText(wert === undefined ? '' : zahlFuerEingabe(wert))
    // nur auf Änderungen des Werts reagieren
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert])
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
