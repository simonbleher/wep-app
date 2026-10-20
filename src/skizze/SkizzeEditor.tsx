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
import { Circle, Grid3x3, MousePointer2, Redo2, Ruler, Slash, Square, Trash2, TreePine, Type, Undo2, type LucideIcon } from 'lucide-react'
import { Dialog, ICON } from '@/app/ui'
import type { SkizzeDaten, SkizzeElement, SkizzeWerkzeug, SymbolArt } from './types.js'
import { SYMBOL_ARTEN, leereSkizze, neueId } from './types.js'
import { primsZuSvg, symbolPrims } from './symbole.js'
import { STANDARD_GROESSE } from './szene.js'
import { trefferSuchen, elementVerschieben } from './geometrie.js'
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

function svgKoordinaten(
  svgElement: SVGSVGElement,
  event: React.PointerEvent<SVGSVGElement>,
): { x: number; y: number } {
  const rect = svgElement.getBoundingClientRect()
  const viewBox = svgElement.viewBox.baseVal
  const scaleX = viewBox.width / rect.width
  const scaleY = viewBox.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  }
}

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
  }>({ aktiv: false, startX: 0, startY: 0, vorschau: null })
  const [vorschauElement, setVorschauElement] = useState<SkizzeElement | null>(null)

  // Verschieben-Status
  const verschiebenRef = useRef<{
    aktiv: boolean
    elementId: string | null
    letzteX: number
    letzteY: number
  }>({ aktiv: false, elementId: null, letzteX: 0, letzteY: 0 })

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      e.currentTarget.setPointerCapture(e.pointerId)

      const { x, y } = svgKoordinaten(svgRef.current, e)

      if (aktivesWerkzeug === 'auswahl') {
        const getroffen = trefferSuchen(zustand.elemente, { x, y })
        dispatch({ typ: 'element-auswaehlen', id: getroffen?.id ?? null })
        if (getroffen && !getroffen.fest) {
          verschiebenRef.current = {
            aktiv: true,
            elementId: getroffen.id,
            letzteX: x,
            letzteY: y,
          }
        }
        return
      }

      // Symbol setzen: ein Tipp genügt, Größe nach Standard
      if (aktivesWerkzeug === 'symbol') {
        const faktor = breite / 445
        const [sb, sh] = STANDARD_GROESSE[symbolArt]
        const symbol: SkizzeElement = {
          id: neueId(),
          typ: 'symbol',
          art: symbolArt,
          x: x - (sb * faktor) / 2,
          y: y - (sh * faktor) / 2,
          breite: sb * faktor,
          hoehe: sh * faktor,
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

      zeichnenRef.current = { aktiv: true, startX: x, startY: y, vorschau: null }
    },
    [aktivesWerkzeug, zustand.elemente, symbolArt, breite],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const { x, y } = svgKoordinaten(svgRef.current, e)

      // Verschieben
      if (verschiebenRef.current.aktiv && verschiebenRef.current.elementId) {
        const { elementId, letzteX, letzteY } = verschiebenRef.current
        const dx = x - letzteX
        const dy = y - letzteY
        const el = zustand.elemente.find((e) => e.id === elementId)
        if (el) {
          // Verschieben direkt ohne Verlauf-Snapshot (nur bei PointerUp speichern)
          const verschoben = elementVerschieben(el, dx, dy)
          dispatch({ typ: 'element-aktualisieren', element: verschoben })
        }
        verschiebenRef.current.letzteX = x
        verschiebenRef.current.letzteY = y
        return
      }

      if (!zeichnenRef.current.aktiv) return
      const { startX, startY } = zeichnenRef.current

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
    [aktivesWerkzeug, zustand.elemente],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const { x, y } = svgKoordinaten(svgRef.current, e)

      // Verschieben beenden
      if (verschiebenRef.current.aktiv) {
        verschiebenRef.current.aktiv = false
        return
      }

      if (!zeichnenRef.current.aktiv) return
      zeichnenRef.current.aktiv = false
      setVorschauElement(null)

      const { startX, startY } = zeichnenRef.current
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
    [aktivesWerkzeug],
  )

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

      {/* Ausgewähltes Element Info */}
      {ausgewaehltesEl && (
        <p className="skizze-auswahl" aria-live="polite">
          {ausgewaehltesEl.fest
            ? `Ausgewählt: ${auswahlName} (fest, nicht änderbar)`
            : `Ausgewählt: ${auswahlName} – ziehen zum Verschieben`}
        </p>
      )}

      {/* Zeichenfläche */}
      <div
        className="skizze-flaeche"
        style={{
          maxWidth: breite,
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
          viewBox={`0 0 ${breite} ${hoehe}`}
          width="100%"
          height="100%"
          style={{ display: 'block' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Hintergrund */}
          <rect width={breite} height={hoehe} fill="#fff" />

          {/* Raster */}
          {rasterLinien}

          {/* Elemente */}
          {zustand.elemente.map((el) => elementZuSvg(el, el.id === zustand.ausgewaehlt))}

          {/* Vorschau */}
          {vorschauElement &&
            elementZuSvg({ ...vorschauElement, id: '__vorschau__' }, false)}
        </svg>
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
