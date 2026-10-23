/**
 * SkizzeEditor – Hauptkomponente für die Parzellenskizze (Aufgabe S1).
 *
 * Touch-tauglich (Pointer Events), SVG-basierte Zeichenfläche, reines JSON-
 * Datenmodell. Die Komponente darf NICHT WepDetail oder Startseite verändern.
 *
 * Werkzeugleiste und Dialoge im Stil der App (Tokens, lucide-Icons, Berührflächen ≥ 48 px,
 * Klassen in src/app/styles.css). Die Zeichenfläche selbst (SVG) ist davon unberührt.
 */

import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react'
import { Circle, Grid3x3, Magnet, Maximize, MousePointer2, Redo2, Ruler, Slash, Square, Trash2, TreePine, Type, Undo2, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react'
import { Dialog, ICON } from '@/app/ui'
import type { SkizzeDaten, SkizzeElement, SkizzeWerkzeug, SymbolArt } from './types.js'
import { SYMBOL_ARTEN, istGrundlage, leereSkizze, neueId } from './types.js'
import { waehlbareElemente } from './grundlage.js'
import { primsZuSvg, symbolPrims } from './symbole.js'
import { STANDARD_GROESSE } from './szene.js'
import { alleTreffer, elementVerschieben, naechsterTreffer, type Punkt } from './geometrie.js'
import {
  GANZE_SKIZZE,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_SCHRITT,
  bildschirmZuSkizze,
  pixelProEinheit,
  radFaktor,
  verschiebeUmPixel,
  viewBoxText,
  zoomUmMitte,
  zoomUmPunkt,
  zweiFingerAnsicht,
  type Ansicht,
} from './ansicht.js'
import {
  FANG_PIXEL,
  rasteLinienEnde,
  rastePunkt,
  rasteVerschiebung,
  zielLinien,
  type Treffer,
  type ZielLinien,
} from './einrasten.js'
import {
  neuerVerlauf,
  verlaufSchreiben,
  verlaufUndo,
  verlaufRedo,
  kannUndo,
  kannRedo,
} from './verlauf.js'
import type { Verlauf } from './verlauf.js'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SkizzeEditorProps {
  wert: SkizzeDaten
  onAenderung: (neu: SkizzeDaten) => void
}

// ---------------------------------------------------------------------------
// Interner Zustand
// ---------------------------------------------------------------------------

interface EditorZustand {
  elemente: SkizzeElement[]
  ausgewaehlt: string | null // id des ausgewählten Elements
  verlauf: Verlauf
}

type EditorAktion =
  | { typ: 'elemente-setzen'; elemente: SkizzeElement[] }
  | { typ: 'element-hinzufuegen'; element: SkizzeElement }
  | { typ: 'element-aktualisieren'; element: SkizzeElement }
  | { typ: 'element-loeschen'; id: string }
  | { typ: 'element-auswaehlen'; id: string | null }
  /** Zwischenstand beim Ziehen: ersetzt das Element, ohne einen Verlaufsschritt zu schreiben. */
  | { typ: 'verschieben-live'; element: SkizzeElement }
  /** Ende des Ziehens: ein einziger Verlaufsschritt gegenüber dem Stand vor dem Ziehen. */
  | { typ: 'verschieben-fertig'; vorher: SkizzeElement[] }
  | { typ: 'undo' }
  | { typ: 'redo' }

function editorReducer(zustand: EditorZustand, aktion: EditorAktion): EditorZustand {
  switch (aktion.typ) {
    case 'elemente-setzen':
      return { ...zustand, elemente: aktion.elemente, ausgewaehlt: null }

    case 'element-hinzufuegen': {
      const neueElemente = [...zustand.elemente, aktion.element]
      return {
        elemente: neueElemente,
        ausgewaehlt: aktion.element.id,
        verlauf: verlaufSchreiben(zustand.verlauf, zustand.elemente, neueElemente),
      }
    }

    case 'element-aktualisieren': {
      const neueElemente = zustand.elemente.map((el) =>
        el.id === aktion.element.id ? aktion.element : el,
      )
      return {
        elemente: neueElemente,
        ausgewaehlt: zustand.ausgewaehlt,
        verlauf: verlaufSchreiben(zustand.verlauf, zustand.elemente, neueElemente),
      }
    }

    case 'element-loeschen': {
      const neueElemente = zustand.elemente.filter((el) => el.id !== aktion.id)
      return {
        elemente: neueElemente,
        ausgewaehlt: null,
        verlauf: verlaufSchreiben(zustand.verlauf, zustand.elemente, neueElemente),
      }
    }

    case 'element-auswaehlen':
      return { ...zustand, ausgewaehlt: aktion.id }

    case 'verschieben-live':
      return {
        ...zustand,
        elemente: zustand.elemente.map((el) => (el.id === aktion.element.id ? aktion.element : el)),
      }

    case 'verschieben-fertig': {
      if (zustand.elemente === aktion.vorher) return zustand
      return { ...zustand, verlauf: verlaufSchreiben(zustand.verlauf, aktion.vorher, zustand.elemente) }
    }

    case 'undo': {
      const ergebnis = verlaufUndo(zustand.verlauf, zustand.elemente)
      if (!ergebnis) return zustand
      return { elemente: [...ergebnis.elemente], ausgewaehlt: null, verlauf: ergebnis.verlauf }
    }

    case 'redo': {
      const ergebnis = verlaufRedo(zustand.verlauf, zustand.elemente)
      if (!ergebnis) return zustand
      return { elemente: [...ergebnis.elemente], ausgewaehlt: null, verlauf: ergebnis.verlauf }
    }
  }
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen für SVG-Koordinaten
// ---------------------------------------------------------------------------

const EINRASTEN_SCHLUESSEL = 'wep-skizze-einrasten'

/** Einrasten ist eine Geräte-Einstellung (nicht Teil der Skizze); ohne Speicher gilt „an“. */
function einrastenLesen(): boolean {
  try {
    return localStorage.getItem(EINRASTEN_SCHLUESSEL) !== 'aus'
  } catch {
    return true
  }
}

function einrastenSpeichern(an: boolean): void {
  try {
    localStorage.setItem(EINRASTEN_SCHLUESSEL, an ? 'an' : 'aus')
  } catch {
    // Speicher gesperrt: die Einstellung gilt dann nur für diese Sitzung
  }
}

/** Greifradius in Bildschirmpixeln: Finger brauchen mehr Fläche als Maus oder Stift. */
const GREIF_PIXEL_FINGER = 20
const GREIF_PIXEL_MAUS = 8
/** Ab dieser Wegstrecke (Pixel) gilt eine Berührung als Ziehen und nicht mehr als Antippen. */
const ZIEH_SCHWELLE_PIXEL = 6

// ---------------------------------------------------------------------------
// Werkzeug-Metadaten
// ---------------------------------------------------------------------------

const WERKZEUGE: { id: SkizzeWerkzeug; name: string; titel: string; icon: LucideIcon }[] = [
  { id: 'auswahl', name: 'Auswählen', titel: 'Auswählen / Verschieben / Löschen', icon: MousePointer2 },
  { id: 'rechteck', name: 'Rechteck', titel: 'Rechteck zeichnen', icon: Square },
  { id: 'linie', name: 'Linie', titel: 'Linie zeichnen', icon: Slash },
  { id: 'kreis', name: 'Kreis', titel: 'Kreis / Baum zeichnen', icon: Circle },
  { id: 'text', name: 'Text', titel: 'Text einfügen', icon: Type },
  { id: 'massangabe', name: 'Maßangabe', titel: 'Maßangabe zeichnen', icon: Ruler },
  { id: 'symbol', name: 'Symbol', titel: 'Symbol setzen (Baum, Beet, Hecke …)', icon: TreePine },
]

/** Lesbare Namen der Elementarten für die Auswahlzeile. */
const TYP_NAMEN: Record<SkizzeElement['typ'], string> = {
  rechteck: 'Rechteck',
  bauform: 'Bau-Form',
  linie: 'Linie',
  kreis: 'Kreis',
  text: 'Text',
  massangabe: 'Maßangabe',
  symbol: 'Symbol',
}

/** Anzeigenamen der Symbole im Auswahlfeld. */
const SYMBOL_NAMEN: Record<SymbolArt, string> = {
  baum: 'Baum',
  strauch: 'Strauch',
  wildling: 'Wildling',
  kletterpflanze: 'Kletterpflanze / Wein',
  hecke: 'Hecke',
  beet: 'Beet',
  hochbeet: 'Hochbeet',
  blumenbeet: 'Blumenbeet',
  rasen: 'Rasen (Beschriftung)',
  kompost: 'Kompost',
  brunnen: 'Brunnen',
  schacht: 'Schacht',
  weg: 'Weg',
  tor: 'Tor',
  holzpferd: 'Holzpferd',
  schaukel: 'Schaukel',
  gegenstand: 'Gegenstand (mit Name)',
  entfernen: 'Entfernen-Markierung',
  mangelhinweis: 'Mängelhinweis',
}

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export function SkizzeEditor({ wert, onAenderung }: SkizzeEditorProps) {
  const daten = wert.elemente ? wert : leereSkizze()
  const breite = daten.breite ?? 800
  const hoehe = daten.hoehe ?? 600
  const rasterGroesse = daten.rasterGroesse ?? 40
  const grundlageGesperrt = daten.grundlage?.gesperrt === true
  const gesperrtGrundlage = daten.grundlage

  const [zustand, dispatch] = useReducer(editorReducer, {
    elemente: daten.elemente,
    ausgewaehlt: null,
    verlauf: neuerVerlauf(),
  })

  // Zustand nach außen propagieren
  const prevElementeRef = useRef(zustand.elemente)
  useEffect(() => {
    if (prevElementeRef.current !== zustand.elemente) {
      prevElementeRef.current = zustand.elemente
      onAenderung({
        ...daten,
        elemente: zustand.elemente,
      })
    }
  }, [zustand.elemente]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wenn Wert von außen geändert wird (z. B. Laden aus IndexedDB)
  useEffect(() => {
    dispatch({ typ: 'elemente-setzen', elemente: wert.elemente ?? [] })
  }, [wert]) // eslint-disable-line react-hooks/exhaustive-deps

  const [aktivesWerkzeug, setAktivesWerkzeug] = useState<SkizzeWerkzeug>('auswahl')
  const [rasterSichtbar, setRasterSichtbar] = useState(daten.raster ?? true)
  const [symbolArt, setSymbolArt] = useState<SymbolArt>('baum')

  // Zeige Dialog für Text-Eingabe
  const [textDialog, setTextDialog] = useState<{ x: number; y: number } | null>(null)
  const [textEingabe, setTextEingabe] = useState('')
  const [massDialog, setMassDialog] = useState<{
    x1: number; y1: number; x2: number; y2: number
  } | null>(null)
  const [massEingabe, setMassEingabe] = useState('')
  // Beschriftungs-Dialog für neue Kreise und Symbole
  const [kreisLabelDialog, setKreisLabelDialog] = useState<{
    id: string; beschriftung: string
  } | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const editorId = useId()
  const ausgewaehltesEl = zustand.elemente.find((e) => e.id === zustand.ausgewaehlt)

  // Zeichnen-Status
  const zeichnenRef = useRef<{
    aktiv: boolean
    startX: number
    startY: number
    vorschau: SkizzeElement | null
    ziele: ZielLinien
  }>({ aktiv: false, startX: 0, startY: 0, vorschau: null, ziele: { xs: [], ys: [] } })
  const [vorschauElement, setVorschauElement] = useState<SkizzeElement | null>(null)

  // Ansicht (Zoom/Ausschnitt) und Einrasten – beides nur Darstellung bzw. Geräte-Einstellung
  const [ansicht, setAnsicht] = useState<Ansicht>(GANZE_SKIZZE)
  const ansichtRef = useRef<Ansicht>(GANZE_SKIZZE)
  const setzeAnsicht = useCallback((a: Ansicht) => {
    ansichtRef.current = a
    setAnsicht(a)
  }, [])
  const [einrasten, setEinrasten] = useState(einrastenLesen)
  const [hilfslinien, setHilfslinien] = useState<Treffer | null>(null)
  /** Anzahl der Formen an der angetippten Stelle und Position der gewählten (für die Auswahlzeile). */
  const [stapel, setStapel] = useState<{ anzahl: number; index: number } | null>(null)

  const flaeche = { breite, hoehe }

  // Zeiger (Finger/Maus) und Gesten
  const zeigerRef = useRef(new Map<number, Punkt>())
  const gesteRef = useRef<{ ids: [number, number]; start: Ansicht; finger: [Punkt, Punkt] } | null>(null)
  // Nach einer Zwei-Finger-Geste zeichnet/verschiebt der übrig gebliebene Finger nichts mehr
  const gesteVorbeiRef = useRef(false)
  const schwenkRef = useRef<{ id: number; letzte: Punkt } | null>(null)
  // Auswahl vor dem ersten Finger: eine Geste mit zwei Fingern lässt die Auswahl unverändert
  const auswahlVorDownRef = useRef<string | null>(null)

  // Verschieben-/Antipp-Status
  const verschiebenRef = useRef<{
    id: number
    ausgang: SkizzeElement
    vorher: SkizzeElement[]
    startX: number
    startY: number
    startClient: Punkt
    ziele: ZielLinien
    bewegt: boolean
    warAusgewaehlt: boolean
    treffer: SkizzeElement[]
    verschiebbar: boolean
  } | null>(null)

  // ---------------------------------------------------------------------------
  // Tastatur-Shortcuts
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (textDialog || massDialog || kreisLabelDialog) return // Dialog offen: Tasten gehören dem Dialog
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ typ: 'undo' })
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        dispatch({ typ: 'redo' })
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && zustand.ausgewaehlt) {
        const el = zustand.elemente.find((x) => x.id === zustand.ausgewaehlt)
        if (el && !el.fest) dispatch({ typ: 'element-loeschen', id: zustand.ausgewaehlt })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [zustand.ausgewaehlt, zustand.elemente, textDialog, massDialog, kreisLabelDialog])

  // ---------------------------------------------------------------------------
  // Pointer-Ereignisse
  // ---------------------------------------------------------------------------

  const holeKasten = () => svgRef.current!.getBoundingClientRect()
  const zuSkizze = (e: { clientX: number; clientY: number }): Punkt =>
    bildschirmZuSkizze({ x: e.clientX, y: e.clientY }, ansichtRef.current, flaeche, holeKasten())
  const fangSchwelle = () => FANG_PIXEL / pixelProEinheit(ansichtRef.current, flaeche, holeKasten())
  const greifRadius = (e: React.PointerEvent) =>
    (e.pointerType === 'mouse' || e.pointerType === 'pen' ? GREIF_PIXEL_MAUS : GREIF_PIXEL_FINGER) /
    pixelProEinheit(ansichtRef.current, flaeche, holeKasten())
  // Alt gedrückt = Einrasten für diese Bewegung aus (am PC)
  const rastetEin = (e: { altKey: boolean }) => einrasten && !e.altKey

  /** Abbruch laufender Aktionen, z. B. wenn ein zweiter Finger dazukommt. */
  const aktionAbbrechen = () => {
    const v = verschiebenRef.current
    if (v?.bewegt) dispatch({ typ: 'verschieben-live', element: v.ausgang })
    verschiebenRef.current = null
    zeichnenRef.current.aktiv = false
    schwenkRef.current = null
    setVorschauElement(null)
    setHilfslinien(null)
  }

  /** Endpunkt einer Zeichen-Geste mit Einrasten (Rechteck: Ecke, Linie/Maß: gerade Richtung, Kreis: frei). */
  const endpunkt = (roh: Punkt, e: { altKey: boolean }): { punkt: Punkt; treffer: Treffer } => {
    const { startX, startY, ziele } = zeichnenRef.current
    if (!rastetEin(e) || aktivesWerkzeug === 'kreis') return { punkt: roh, treffer: {} }
    if (aktivesWerkzeug === 'linie' || aktivesWerkzeug === 'massangabe') {
      return rasteLinienEnde({ x: startX, y: startY }, roh, ziele, fangSchwelle())
    }
    return rastePunkt(roh, ziele, fangSchwelle())
  }

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      e.currentTarget.setPointerCapture(e.pointerId)
      zeigerRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      // Zweiter Finger: Zoomen/Verschieben statt Zeichnen oder Ziehen
      if (zeigerRef.current.size >= 2) {
        if (verschiebenRef.current || schwenkRef.current) {
          dispatch({ typ: 'element-auswaehlen', id: auswahlVorDownRef.current })
          setStapel(null)
        }
        aktionAbbrechen()
        const ids = [...zeigerRef.current.keys()].slice(0, 2) as [number, number]
        gesteRef.current = {
          ids,
          start: ansichtRef.current,
          finger: [zeigerRef.current.get(ids[0])!, zeigerRef.current.get(ids[1])!],
        }
        gesteVorbeiRef.current = true
        return
      }
      if (gesteVorbeiRef.current) return

      // Mittlere Maustaste: Ausschnitt verschieben
      if (e.pointerType === 'mouse' && e.button === 1) {
        e.preventDefault()
        schwenkRef.current = { id: e.pointerId, letzte: { x: e.clientX, y: e.clientY } }
        return
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return

      const roh = zuSkizze(e)
      const { x, y } = roh

      if (aktivesWerkzeug === 'auswahl') {
        // Gesperrte Grundlage (Bau-Skizze) ist nicht auswählbar; sie bleibt aber Ziel zum Einrasten
        const waehlbar = waehlbareElemente({ elemente: zustand.elemente, grundlage: gesperrtGrundlage })
        const treffer = alleTreffer(waehlbar, roh, greifRadius(e))
        const warAusgewaehlt = treffer.some((t) => t.id === zustand.ausgewaehlt)
        // Ist die gewählte Form hier getroffen, bleibt sie (zum Ziehen); sonst die kleinste Form an dieser Stelle
        const gewaehlt = warAusgewaehlt ? treffer.find((t) => t.id === zustand.ausgewaehlt)! : (treffer[0] ?? null)
        auswahlVorDownRef.current = zustand.ausgewaehlt
        dispatch({ typ: 'element-auswaehlen', id: gewaehlt?.id ?? null })
        setStapel(gewaehlt ? { anzahl: treffer.length, index: treffer.indexOf(gewaehlt) } : null)
        if (!gewaehlt) {
          // Leere Stelle: Ziehen verschiebt den Ausschnitt
          schwenkRef.current = { id: e.pointerId, letzte: { x: e.clientX, y: e.clientY } }
          return
        }
        verschiebenRef.current = {
          id: e.pointerId,
          ausgang: gewaehlt,
          vorher: zustand.elemente,
          startX: x,
          startY: y,
          startClient: { x: e.clientX, y: e.clientY },
          ziele: zielLinien(zustand.elemente, new Set([gewaehlt.id]), breite, hoehe),
          bewegt: false,
          warAusgewaehlt,
          treffer,
          verschiebbar: !gewaehlt.fest,
        }
        return
      }

      const ziele = zielLinien(zustand.elemente, new Set(), breite, hoehe)

      // Symbol setzen: ein Tipp genügt, Größe nach Standard
      if (aktivesWerkzeug === 'symbol') {
        const faktor = breite / 445
        const [sb, sh] = STANDARD_GROESSE[symbolArt]
        let symbol: SkizzeElement = {
          id: neueId(),
          typ: 'symbol',
          art: symbolArt,
          x: x - (sb * faktor) / 2,
          y: y - (sh * faktor) / 2,
          breite: sb * faktor,
          hoehe: sh * faktor,
        }
        if (rastetEin(e)) {
          const r = rasteVerschiebung(symbol, 0, 0, ziele, fangSchwelle())
          symbol = elementVerschieben(symbol, r.dx, r.dy)
        }
        dispatch({ typ: 'element-hinzufuegen', element: symbol })
        setKreisLabelDialog({ id: symbol.id, beschriftung: '' })
        return
      }

      // Zeichnen-Werkzeuge
      if (aktivesWerkzeug === 'text') {
        setTextDialog({ x, y })
        setTextEingabe('')
        return
      }

      const start = rastetEin(e) ? rastePunkt(roh, ziele, fangSchwelle()) : { punkt: roh, treffer: {} }
      setHilfslinien(start.treffer)
      zeichnenRef.current = { aktiv: true, startX: start.punkt.x, startY: start.punkt.y, vorschau: null, ziele }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aktivesWerkzeug, zustand.elemente, zustand.ausgewaehlt, symbolArt, breite, hoehe, einrasten, grundlageGesperrt],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      if (zeigerRef.current.has(e.pointerId)) zeigerRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      // Zwei-Finger-Geste
      const geste = gesteRef.current
      if (geste) {
        const a = zeigerRef.current.get(geste.ids[0])
        const b = zeigerRef.current.get(geste.ids[1])
        if (a && b) setzeAnsicht(zweiFingerAnsicht(geste.start, geste.finger, [a, b], flaeche, holeKasten()))
        return
      }
      if (gesteVorbeiRef.current) return

      // Ausschnitt mit einem Zeiger verschieben (Maus: mittlere Taste oder leere Stelle ziehen)
      const schwenk = schwenkRef.current
      if (schwenk && schwenk.id === e.pointerId) {
        setzeAnsicht(verschiebeUmPixel(ansichtRef.current, e.clientX - schwenk.letzte.x, e.clientY - schwenk.letzte.y, flaeche, holeKasten()))
        schwenk.letzte = { x: e.clientX, y: e.clientY }
        return
      }

      const roh = zuSkizze(e)

      // Verschieben (erst nach einer kleinen Strecke, damit Antippen nichts verrückt)
      const v = verschiebenRef.current
      if (v && v.id === e.pointerId) {
        if (!v.bewegt) {
          if (Math.hypot(e.clientX - v.startClient.x, e.clientY - v.startClient.y) < ZIEH_SCHWELLE_PIXEL) return
          v.bewegt = true
        }
        if (!v.verschiebbar) return
        let dx = roh.x - v.startX
        let dy = roh.y - v.startY
        if (rastetEin(e)) {
          const r = rasteVerschiebung(v.ausgang, dx, dy, v.ziele, fangSchwelle())
          dx = r.dx
          dy = r.dy
          setHilfslinien(r.treffer)
        } else {
          setHilfslinien(null)
        }
        // Zwischenstände ohne Verlaufsschritt; ein Schritt beim Loslassen
        dispatch({ typ: 'verschieben-live', element: elementVerschieben(v.ausgang, dx, dy) })
        return
      }

      if (!zeichnenRef.current.aktiv) return
      const { startX, startY } = zeichnenRef.current
      const ende = endpunkt(roh, e)
      const { x, y } = ende.punkt
      setHilfslinien(ende.treffer)

      // Vorschau berechnen
      let vorschau: SkizzeElement | null = null
      const id = '__vorschau__'

      switch (aktivesWerkzeug) {
        case 'rechteck':
          vorschau = {
            id,
            typ: 'rechteck',
            x: Math.min(startX, x),
            y: Math.min(startY, y),
            breite: Math.abs(x - startX),
            hoehe: Math.abs(y - startY),
          }
          break
        case 'linie':
        case 'massangabe':
          vorschau = {
            id,
            typ: aktivesWerkzeug === 'linie' ? 'linie' : 'massangabe',
            x1: startX,
            y1: startY,
            x2: x,
            y2: y,
            ...(aktivesWerkzeug === 'massangabe' ? { beschriftung: '' } : {}),
          } as SkizzeElement
          break
        case 'kreis': {
          const r = Math.max(4, Math.sqrt((x - startX) ** 2 + (y - startY) ** 2))
          vorschau = { id, typ: 'kreis', cx: startX, cy: startY, radius: r }
          break
        }
        default:
          break
      }

      setVorschauElement(vorschau)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aktivesWerkzeug, zustand.elemente, einrasten, breite, hoehe],
  )

  /** Zeiger los: Gesten und Ziehen beenden. Rückgabe true = Ereignis ist fertig behandelt. */
  const zeigerLoesen = (e: React.PointerEvent<SVGSVGElement>): boolean => {
    zeigerRef.current.delete(e.pointerId)
    const geste = gesteRef.current
    if (geste && (geste.ids[0] === e.pointerId || geste.ids[1] === e.pointerId)) gesteRef.current = null
    if (gesteVorbeiRef.current) {
      if (zeigerRef.current.size === 0) gesteVorbeiRef.current = false
      return true
    }
    if (schwenkRef.current?.id === e.pointerId) {
      schwenkRef.current = null
      return true
    }
    return false
  }

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (zeigerLoesen(e)) return
      aktionAbbrechen()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      if (zeigerLoesen(e)) return
      setHilfslinien(null)

      // Ziehen beenden: ein Verlaufsschritt; reines Antippen einer schon gewählten Form wechselt zur nächsten
      const v = verschiebenRef.current
      if (v && v.id === e.pointerId) {
        verschiebenRef.current = null
        if (v.bewegt) {
          dispatch({ typ: 'verschieben-fertig', vorher: v.vorher })
        } else if (v.warAusgewaehlt && v.treffer.length > 1) {
          const naechste = naechsterTreffer(v.treffer, v.ausgang.id)
          if (naechste) {
            dispatch({ typ: 'element-auswaehlen', id: naechste.id })
            setStapel({ anzahl: v.treffer.length, index: v.treffer.indexOf(naechste) })
          }
        }
        return
      }

      if (!zeichnenRef.current.aktiv) return
      zeichnenRef.current.aktiv = false
      setVorschauElement(null)

      const { startX, startY } = zeichnenRef.current
      const { x, y } = endpunkt(zuSkizze(e), e).punkt
      const minGroesse = 4

      switch (aktivesWerkzeug) {
        case 'rechteck': {
          if (Math.abs(x - startX) < minGroesse || Math.abs(y - startY) < minGroesse) break
          dispatch({
            typ: 'element-hinzufuegen',
            element: {
              id: neueId(),
              typ: 'rechteck',
              x: Math.min(startX, x),
              y: Math.min(startY, y),
              breite: Math.abs(x - startX),
              hoehe: Math.abs(y - startY),
            },
          })
          break
        }
        case 'linie': {
          const laenge = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2)
          if (laenge < minGroesse) break
          dispatch({
            typ: 'element-hinzufuegen',
            element: { id: neueId(), typ: 'linie', x1: startX, y1: startY, x2: x, y2: y },
          })
          break
        }
        case 'kreis': {
          const r = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2)
          if (r < minGroesse) break
          const neuerKreis: SkizzeElement = {
            id: neueId(),
            typ: 'kreis',
            cx: startX,
            cy: startY,
            radius: r,
          }
          dispatch({ typ: 'element-hinzufuegen', element: neuerKreis })
          // Beschriftungs-Dialog öffnen
          setKreisLabelDialog({ id: neuerKreis.id, beschriftung: '' })
          break
        }
        case 'massangabe': {
          const laenge = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2)
          if (laenge < minGroesse) break
          // Dialog für Beschriftung öffnen
          setMassDialog({ x1: startX, y1: startY, x2: x, y2: y })
          setMassEingabe('')
          break
        }
        default:
          break
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aktivesWerkzeug, einrasten],
  )

  // Mausrad (und Trackpad-Pinch): zoomt um den Mauszeiger. Muss ein nicht-passiver Listener sein,
  // damit die Seite dabei nicht mitscrollt; ganz herausgezoomt scrollt die Seite normal weiter.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const beiRad = (e: WheelEvent) => {
      if (ansichtRef.current.zoom <= ZOOM_MIN && e.deltaY > 0) return
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      setzeAnsicht(
        zoomUmPunkt(ansichtRef.current, radFaktor(delta), { x: e.clientX, y: e.clientY }, { breite, hoehe }, svg.getBoundingClientRect()),
      )
    }
    svg.addEventListener('wheel', beiRad, { passive: false })
    return () => svg.removeEventListener('wheel', beiRad)
  }, [breite, hoehe, setzeAnsicht])

  // ---------------------------------------------------------------------------
  // Dialog-Bestätigungen
  // ---------------------------------------------------------------------------

  const textBestaetigen = () => {
    if (!textDialog || !textEingabe.trim()) {
      setTextDialog(null)
      return
    }
    dispatch({
      typ: 'element-hinzufuegen',
      element: {
        id: neueId(),
        typ: 'text',
        x: textDialog.x,
        y: textDialog.y,
        inhalt: textEingabe.trim(),
      },
    })
    setTextDialog(null)
    setTextEingabe('')
  }

  const massBestaetigen = () => {
    if (!massDialog) return
    dispatch({
      typ: 'element-hinzufuegen',
      element: {
        id: neueId(),
        typ: 'massangabe',
        x1: massDialog.x1,
        y1: massDialog.y1,
        x2: massDialog.x2,
        y2: massDialog.y2,
        beschriftung: massEingabe.trim() || '?',
      },
    })
    setMassDialog(null)
    setMassEingabe('')
  }

  const kreisLabelBestaetigen = () => {
    if (!kreisLabelDialog) return
    if (kreisLabelDialog.beschriftung.trim()) {
      const el = zustand.elemente.find((e) => e.id === kreisLabelDialog.id)
      if (el && (el.typ === 'kreis' || el.typ === 'symbol')) {
        dispatch({
          typ: 'element-aktualisieren',
          element: { ...el, beschriftung: kreisLabelDialog.beschriftung.trim() },
        })
      }
    }
    setKreisLabelDialog(null)
  }

  // ---------------------------------------------------------------------------
  // SVG-Rendering-Hilfsfunktionen
  // ---------------------------------------------------------------------------

  const elementZuSvg = (el: SkizzeElement, istAusgewaehlt: boolean) => {
    const hlStil = istAusgewaehlt ? 'blue' : '#1a1a1a'
    const hlBreite = istAusgewaehlt ? 2.5 : 1.5

    switch (el.typ) {
      case 'symbol': {
        const prims = symbolPrims(el.art, { x: el.x, y: el.y, w: el.breite, h: el.hoehe }, el.beschriftung ?? '', { schrift: 12 })
        return (
          <g key={el.id}>
            <g dangerouslySetInnerHTML={{ __html: primsZuSvg(prims) }} />
            {istAusgewaehlt && (
              <rect
                x={el.x - 2}
                y={el.y - 2}
                width={el.breite + 4}
                height={el.hoehe + 4}
                fill="none"
                stroke="blue"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
          </g>
        )
      }
      case 'bauform': {
        const xs = el.punkte.map((q) => q.x)
        const ys = el.punkte.map((q) => q.y)
        const mx = (Math.min(...xs) + Math.max(...xs)) / 2
        const my = (Math.min(...ys) + Math.max(...ys)) / 2
        const zeilen = (el.beschriftung ?? '').split('\n').filter(Boolean)
        const fuellung = el.art === 'grundstueck' ? '#C5E0B4' : el.art === 'pfosten' ? '#fff' : el.gestrichelt ? 'none' : '#E7E6E6'
        return (
          <g key={el.id} data-grundlage={istGrundlage(el) ? '' : undefined} data-art={el.art}>
            <polygon
              points={el.punkte.map((q) => `${q.x},${q.y}`).join(' ')}
              fill={fuellung}
              stroke={istAusgewaehlt ? 'blue' : el.art === 'bauteil' ? '#262626' : '#595959'}
              strokeWidth={istAusgewaehlt ? 2.5 : el.art === 'pfosten' ? 1 : 1.5}
              strokeDasharray={el.gestrichelt ? '6 4' : undefined}
              pointerEvents={el.gestrichelt ? 'all' : undefined}
            />
            {el.art === 'bauteil' &&
              zeilen.map((z, i) => (
                <text key={i} x={mx} y={my + (i - (zeilen.length - 1) / 2) * 14} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#000" pointerEvents="none">
                  {z}
                </text>
              ))}
          </g>
        )
      }
      case 'rechteck':
        return (
          <rect
            key={el.id}
            x={el.x}
            y={el.y}
            width={el.breite}
            height={el.hoehe}
            fill="none"
            stroke={hlStil}
            strokeWidth={hlBreite}
          />
        )
      case 'linie':
        return (
          <line
            key={el.id}
            x1={el.x1}
            y1={el.y1}
            x2={el.x2}
            y2={el.y2}
            stroke={hlStil}
            strokeWidth={hlBreite}
          />
        )
      case 'kreis':
        return (
          <g key={el.id}>
            <circle
              cx={el.cx}
              cy={el.cy}
              r={el.radius}
              fill="none"
              stroke={hlStil}
              strokeWidth={hlBreite}
            />
            {el.beschriftung && (
              <text
                x={el.cx}
                y={el.cy + el.radius + 14}
                textAnchor="middle"
                fontSize={12}
                fill={hlStil}
              >
                {el.beschriftung}
              </text>
            )}
          </g>
        )
      case 'text':
        return (
          <text
            key={el.id}
            x={el.x}
            y={el.y}
            fontSize={el.schriftgroesse ?? 14}
            fill={hlStil}
            dominantBaseline="hanging"
          >
            {el.inhalt}
          </text>
        )
      case 'massangabe': {
        const dx = el.x2 - el.x1
        const dy = el.y2 - el.y1
        const laenge = Math.sqrt(dx * dx + dy * dy)
        const nx = laenge > 0 ? (-dy / laenge) * 6 : 0
        const ny = laenge > 0 ? (dx / laenge) * 6 : 6
        const mx = (el.x1 + el.x2) / 2
        const my = (el.y1 + el.y2) / 2
        return (
          <g key={el.id} stroke={hlStil} strokeWidth={hlBreite} fill={hlStil}>
            <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} />
            <line x1={el.x1 - nx} y1={el.y1 - ny} x2={el.x1 + nx} y2={el.y1 + ny} />
            <line x1={el.x2 - nx} y1={el.y2 - ny} x2={el.x2 + nx} y2={el.y2 + ny} />
            <text
              x={mx}
              y={my - 4}
              textAnchor="middle"
              fontSize={12}
              dominantBaseline="auto"
            >
              {el.beschriftung}
            </text>
          </g>
        )
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Raster
  // ---------------------------------------------------------------------------

  const rasterLinien = []
  if (rasterSichtbar) {
    for (let x = 0; x <= breite; x += rasterGroesse) {
      rasterLinien.push(
        <line key={`vr-${x}`} x1={x} y1={0} x2={x} y2={hoehe} stroke="#e0e0e0" strokeWidth={0.5} />,
      )
    }
    for (let y = 0; y <= hoehe; y += rasterGroesse) {
      rasterLinien.push(
        <line key={`hr-${y}`} x1={0} y1={y} x2={breite} y2={y} stroke="#e0e0e0" strokeWidth={0.5} />,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const auswahlName = ausgewaehltesEl
    ? ausgewaehltesEl.typ === 'symbol'
      ? SYMBOL_NAMEN[ausgewaehltesEl.art]
      : TYP_NAMEN[ausgewaehltesEl.typ]
    : ''

  return (
    <div className="skizze-editor">
      {/* Werkzeugleiste */}
      <div role="toolbar" aria-label="Zeichenwerkzeuge" className="werkzeuge">
        {WERKZEUGE.map((w) => (
          <button
            key={w.id}
            type="button"
            className="werkzeug"
            title={w.titel}
            aria-label={w.name}
            aria-pressed={aktivesWerkzeug === w.id}
            onClick={() => setAktivesWerkzeug(w.id)}
          >
            <w.icon {...ICON} />
          </button>
        ))}

        <span className="werkzeuge-trenner" aria-hidden="true" />

        <button
          type="button"
          className="werkzeug"
          title="Rückgängig (Strg+Z)"
          aria-label="Rückgängig"
          disabled={!kannUndo(zustand.verlauf)}
          onClick={() => dispatch({ typ: 'undo' })}
        >
          <Undo2 {...ICON} />
        </button>

        <button
          type="button"
          className="werkzeug"
          title="Wiederholen (Strg+Y)"
          aria-label="Wiederholen"
          disabled={!kannRedo(zustand.verlauf)}
          onClick={() => dispatch({ typ: 'redo' })}
        >
          <Redo2 {...ICON} />
        </button>

        {zustand.ausgewaehlt && !ausgewaehltesEl?.fest && (
          <button
            type="button"
            className="werkzeug werkzeug-gefahr"
            title="Ausgewähltes Element löschen (Entf)"
            aria-label="Ausgewähltes Element löschen"
            onClick={() => zustand.ausgewaehlt && dispatch({ typ: 'element-loeschen', id: zustand.ausgewaehlt })}
          >
            <Trash2 {...ICON} />
          </button>
        )}

        <button
          type="button"
          className="werkzeug werkzeug-schalter"
          title="Raster ein-/ausblenden"
          aria-label="Raster"
          aria-pressed={rasterSichtbar}
          onClick={() => {
            const neu = !rasterSichtbar
            setRasterSichtbar(neu)
            onAenderung({ ...daten, elemente: zustand.elemente, raster: neu })
          }}
        >
          <Grid3x3 {...ICON} />
        </button>

        <button
          type="button"
          className="werkzeug werkzeug-schalter"
          title="Einrasten an Ecken, Kanten, Grundstücksrand und geraden Linien (am PC: Alt gedrückt halten schaltet kurz aus)"
          aria-label="Einrasten"
          aria-pressed={einrasten}
          onClick={() => {
            const neu = !einrasten
            setEinrasten(neu)
            einrastenSpeichern(neu)
            setHilfslinien(null)
          }}
        >
          <Magnet {...ICON} />
        </button>
      </div>

      {/* Symbol-Auswahl */}
      {aktivesWerkzeug === 'symbol' && (
        <div className="feld">
          <label className="label" htmlFor={`${editorId}-symbol`}>
            Symbol
          </label>
          <select
            id={`${editorId}-symbol`}
            className="eingabe"
            value={symbolArt}
            onChange={(e) => setSymbolArt(e.target.value as SymbolArt)}
          >
            {SYMBOL_ARTEN.map((a) => (
              <option key={a} value={a}>
                {SYMBOL_NAMEN[a]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Ausgewähltes Element Info – Platz bleibt reserviert, damit die Zeichenfläche beim Antippen nicht springt */}
      <p className="skizze-auswahl" aria-live="polite">
        {ausgewaehltesEl ? (
          <>
            {istGrundlage(ausgewaehltesEl)
              ? `Ausgewählt: ${auswahlName} der Grundlage – ziehen zum Verschieben`
              : ausgewaehltesEl.fest
              ? `Ausgewählt: ${auswahlName} (fest)`
              : `Ausgewählt: ${auswahlName} – ziehen zum Verschieben`}
            {stapel && stapel.anzahl > 1 && ` · ${stapel.index + 1} von ${stapel.anzahl} hier – nochmal tippen`}
          </>
        ) : (
          <span className="neben">Nichts ausgewählt</span>
        )}
      </p>

      {/* Zeichenfläche (mit Ansicht-Knöpfen darüber, die nicht zur Zeichnung gehören) */}
      <div className="skizze-bereich" style={{ maxWidth: breite }}>
        <div
          className="skizze-flaeche"
          style={{
            aspectRatio: `${breite} / ${hoehe}`,
            cursor:
              aktivesWerkzeug === 'auswahl'
                ? 'default'
                : aktivesWerkzeug === 'text'
                  ? 'text'
                  : 'crosshair',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={viewBoxText(ansicht, flaeche)}
            width="100%"
            height="100%"
            style={{ display: 'block' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {/* Hintergrund */}
            <rect width={breite} height={hoehe} fill="#fff" />

            {/* Raster */}
            {rasterLinien}

            {/* Elemente */}
            {zustand.elemente.map((el) => elementZuSvg(el, el.id === zustand.ausgewaehlt))}

            {/* Hilfslinien beim Einrasten (nur Anzeige, nicht in der Skizze) */}
            {hilfslinien?.x !== undefined && (
              <line
                className="skizze-hilfslinie"
                x1={hilfslinien.x}
                y1={0}
                x2={hilfslinien.x}
                y2={hoehe}
                stroke="#d6336c"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {hilfslinien?.y !== undefined && (
              <line
                className="skizze-hilfslinie"
                x1={0}
                y1={hilfslinien.y}
                x2={breite}
                y2={hilfslinien.y}
                stroke="#d6336c"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}

            {/* Vorschau */}
            {vorschauElement &&
              elementZuSvg({ ...vorschauElement, id: '__vorschau__' }, false)}
          </svg>
        </div>
        <div role="group" aria-label="Ansicht" className="skizze-ansicht">
          <button
            type="button"
            className="werkzeug"
            title="Hineinzoomen (zwei Finger auseinander, Mausrad)"
            aria-label="Hineinzoomen"
            disabled={ansicht.zoom >= ZOOM_MAX}
            onClick={() => setzeAnsicht(zoomUmMitte(ansichtRef.current, ZOOM_SCHRITT, flaeche, holeKasten()))}
          >
            <ZoomIn {...ICON} />
          </button>
          <button
            type="button"
            className="werkzeug"
            title="Herauszoomen"
            aria-label="Herauszoomen"
            disabled={ansicht.zoom <= ZOOM_MIN}
            onClick={() => setzeAnsicht(zoomUmMitte(ansichtRef.current, 1 / ZOOM_SCHRITT, flaeche, holeKasten()))}
          >
            <ZoomOut {...ICON} />
          </button>
          <button
            type="button"
            className="werkzeug"
            title="Ganze Skizze zeigen"
            aria-label="Ganze Skizze"
            disabled={ansicht.zoom === GANZE_SKIZZE.zoom && ansicht.x === 0 && ansicht.y === 0}
            onClick={() => setzeAnsicht(GANZE_SKIZZE)}
          >
            <Maximize {...ICON} />
          </button>
        </div>
        {ansicht.zoom > ZOOM_MIN && (
          <span className="skizze-zoom" aria-live="off">
            Zoom {Math.round(ansicht.zoom * 100)} %
          </span>
        )}
      </div>

      {/* Text-Eingabe-Dialog */}
      {textDialog && (
        <Dialog titel="Text einfügen" onSchliessen={() => setTextDialog(null)}>
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault()
              textBestaetigen()
            }}
          >
            <div className="feld">
              <label className="label" htmlFor={`${editorId}-text`}>
                Text
              </label>
              <input
                id={`${editorId}-text`}
                className="eingabe"
                autoFocus
                value={textEingabe}
                onChange={(e) => setTextEingabe(e.target.value)}
                enterKeyHint="done"
                placeholder="z. B. Laube, Weg, Beete …"
              />
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf" onClick={() => setTextDialog(null)}>
                Abbrechen
              </button>
              <button type="submit" className="knopf knopf-primaer">
                Einfügen
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Maßangabe-Dialog */}
      {massDialog && (
        <Dialog titel="Maß eintragen" onSchliessen={() => setMassDialog(null)}>
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault()
              massBestaetigen()
            }}
          >
            <div className="feld">
              <label className="label" htmlFor={`${editorId}-mass`}>
                Maß (in m)
              </label>
              <input
                id={`${editorId}-mass`}
                className="eingabe"
                autoFocus
                value={massEingabe}
                onChange={(e) => setMassEingabe(e.target.value)}
                enterKeyHint="done"
                placeholder="z. B. 3,5 m"
              />
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf" onClick={() => setMassDialog(null)}>
                Abbrechen
              </button>
              <button type="submit" className="knopf knopf-primaer">
                Übernehmen
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Beschriftungs-Dialog für neue Kreise und Symbole (Baumart, Name) */}
      {kreisLabelDialog && (
        <Dialog titel="Beschriftung" onSchliessen={() => setKreisLabelDialog(null)}>
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault()
              kreisLabelBestaetigen()
            }}
          >
            <div className="feld">
              <label className="label" htmlFor={`${editorId}-label`}>
                Baumart oder Name (optional)
              </label>
              <input
                id={`${editorId}-label`}
                className="eingabe"
                autoFocus
                value={kreisLabelDialog.beschriftung}
                onChange={(e) => setKreisLabelDialog({ ...kreisLabelDialog, beschriftung: e.target.value })}
                enterKeyHint="done"
                placeholder="z. B. Apfel, Birne, Pflaume …"
              />
            </div>
            <div className="dialog-knoepfe">
              <button type="button" className="knopf" onClick={() => setKreisLabelDialog(null)}>
                Überspringen
              </button>
              <button type="submit" className="knopf knopf-primaer">
                Übernehmen
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
