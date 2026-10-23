/**
 * GrundrissEditor – Grundriss mit echten Maßen für „Skizze Bau“ (Beta 4, Paket 3).
 *
 * Rechtecke und Vielecke zeichnen, eine Kante antippen und die Länge eintippen → die Form passt sich an. Maßketten,
 * Bauteil-Kürzel (verknüpft mit den Bauteilen aus Paket 2), Höhen und Dachform für die Massenberechnung.
 *
 * Zoom, Verschieben mit zwei Fingern, Einrasten und die Auswahl überlagerter Formen kommen aus Beta 3, Paket 7
 * (`ansicht.ts`, `einrasten.ts`, `grundrissEinrasten.ts`). Die Grün-Skizze (`SkizzeEditor`) bleibt davon unberührt.
 *
 * Alle Koordinaten der Daten sind Meter; die Zeichenfläche rechnet mit 40 Einheiten je Meter (`PX_PRO_M`).
 */

import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react'
import { Grid3x3, Magnet, Maximize, MousePointer2, Pentagon, Redo2, Ruler, Square, Trash2, Undo2, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react'
import { ICON } from '@/app/ui'
import { AuswahlFeld, Schalter, TextFeld, ZahlFeld } from '@/app/BauKomponenten'
import { DachFelder } from './DachFelder'
import { BAUTEIL_ARTEN } from '@/app/bauHelfer'
import type { Bauteil, BauteilArt } from '@/model'
import { massstabText, rasterMeter, type ParzellenLage } from '@/parzelle/lage'
import {
  DACHFORMEN,
  FLAECHE_M,
  abstandG,
  bewegeEcke,
  cm,
  flaecheVon,
  freiesKuerzel,
  kantenLaenge,
  kuerzelVon,
  masskette,
  massenVon,
  meterText,
  naechsteEcke,
  naechsteKante,
  neueTeilId,
  punktImPolygon,
  rechteckMasse,
  rechteckPunkte,
  schwerpunktVon,
  setzeKantenLaenge,
  setzeRechteckMasse,
  verschiebePunkte,
  zahl2Text,
  zahlText,
  type Dachform,
  type GPunkt,
  type GrundrissDaten,
  type GrundrissTeil,
} from './grundriss.js'
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
import { FANG_PIXEL, type Treffer, type ZielLinien } from './einrasten.js'
import { rasteEckeM, rastePunktM, rasteVerschiebungM, zielLinienTeile } from './grundrissEinrasten.js'
import {
  grundrissReducer,
  kannRedo,
  kannUndo,
  neuerGrundrissZustand,
} from './grundrissZustand.js'

/** Zeichenfläche: 40 Einheiten je Meter (Raster 1 m = Rasterkästchen der Grün-Skizze). */
export const PX_PRO_M = 40
const FLAECHE_STANDARD = { breite: FLAECHE_M.breite * PX_PRO_M, hoehe: FLAECHE_M.hoehe * PX_PRO_M }
/** Mit Parzelle: Rand um die Parzelle in m (Platz für die Maßketten außerhalb des Grundrisses). */
const PARZELLEN_RAND_M = 2.5

const EINRASTEN_SCHLUESSEL = 'wep-grundriss-einrasten'
const GREIF_PIXEL_FINGER = 20
const GREIF_PIXEL_MAUS = 8
const ZIEH_SCHWELLE_PIXEL = 6
/** Kleinste Seite eines gezeichneten Rechtecks in m (darunter war es ein Antippen). */
const MIN_SEITE_M = 0.3

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
    // Speicher gesperrt: gilt nur für diese Sitzung
  }
}

type Werkzeug = 'auswahl' | 'rechteck' | 'vieleck'

const WERKZEUGE: { id: Werkzeug; name: string; titel: string; icon: LucideIcon }[] = [
  { id: 'auswahl', name: 'Auswählen', titel: 'Auswählen / Verschieben / Maß ändern', icon: MousePointer2 },
  { id: 'rechteck', name: 'Rechteck', titel: 'Rechteck ziehen (Laube, Anbau, Schuppen …)', icon: Square },
  { id: 'vieleck', name: 'Vieleck', titel: 'Vieleck: Ecken antippen (L-Form, schräge Wand …)', icon: Pentagon },
]

interface Auswahl {
  teilId: string
  /** Gewählte Kante (Index) – dann steht deren Länge zum Eintippen bereit. */
  kante?: number
}

type ZiehArt = { art: 'teil' } | { art: 'ecke'; index: number }

export interface GrundrissEditorProps {
  wert: GrundrissDaten
  /** Bauteile aus Paket 2, mit denen Teile verknüpft werden. */
  bauteile: ReadonlyArray<Bauteil>
  onAenderung: (neu: GrundrissDaten) => void
  /** Legt ein neues Bauteil im WEP an (Kürzel, Art) und gibt es zurück. */
  onNeuesBauteil: (art: BauteilArt) => Bauteil
  /**
   * Parzelle (Beta 6, Paket 1): Die Zeichenfläche ist die Parzelle mit Rand, ihre Form liegt als Hintergrund unter dem Grundriss,
   * das Raster folgt ihrem Maßstab (1 Kästchen = `rasterMeter` m wie in der Grün-Skizze). Ohne Parzelle bleibt alles wie bisher.
   */
  parzelle?: ParzellenLage
}

const PX = (m: number) => m * PX_PRO_M

export function GrundrissEditor({ wert, bauteile, onAenderung, onNeuesBauteil, parzelle }: GrundrissEditorProps) {
  // Zeichenfläche: ohne Parzelle 20 × 15 m, mit Parzelle deren Ausdehnung plus Rand; `versatz` schiebt Meter 0 der Parzelle an den Rand
  const versatz = parzelle ? PARZELLEN_RAND_M : 0
  const FLAECHE = parzelle
    ? { breite: (parzelle.breiteM + 2 * versatz) * PX_PRO_M, hoehe: (parzelle.hoeheM + 2 * versatz) * PX_PRO_M }
    : FLAECHE_STANDARD
  const rasterSchritt = parzelle ? rasterMeter(parzelle.abb.pxProM) : 1
  const [zustand, dispatch] = useReducer(grundrissReducer, wert.teile, neuerGrundrissZustand)
  const teile = zustand.teile
  const [raster, setRaster] = useState(wert.raster ?? true)
  const [massketten, setMassketten] = useState(wert.massketten ?? true)
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('auswahl')
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [entwurf, setEntwurf] = useState<GPunkt[]>([])
  const [vorschau, setVorschau] = useState<{ a: GPunkt; b: GPunkt } | null>(null)
  const [hilfslinien, setHilfslinien] = useState<Treffer | null>(null)
  const [stapel, setStapel] = useState<{ anzahl: number; index: number } | null>(null)
  const [einrasten, setEinrasten] = useState(einrastenLesen)

  const svgRef = useRef<SVGSVGElement>(null)
  const [ansicht, setAnsicht] = useState<Ansicht>(GANZE_SKIZZE)
  const ansichtRef = useRef<Ansicht>(GANZE_SKIZZE)
  const setzeAnsicht = useCallback((a: Ansicht) => {
    ansichtRef.current = a
    setAnsicht(a)
  }, [])
  const [breitePx, setBreitePx] = useState(0)

  // Bildschirmbreite der Zeichenfläche: Größe der Griffe in Bildschirmpixeln unabhängig vom Zoom
  useEffect(() => {
    const messen = () => setBreitePx(svgRef.current?.getBoundingClientRect().width ?? 0)
    messen()
    window.addEventListener('resize', messen)
    return () => window.removeEventListener('resize', messen)
  }, [])

  // Zustand nach außen melden (nur bei echter Änderung der Teile oder Schalter)
  const gemeldet = useRef({ teile: zustand.teile, raster, massketten })
  useEffect(() => {
    const g = gemeldet.current
    if (g.teile === teile && g.raster === raster && g.massketten === massketten) return
    gemeldet.current = { teile, raster, massketten }
    onAenderung({ teile, raster, massketten })
  }, [teile, raster, massketten]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auswahl aufräumen, wenn das Teil verschwunden ist (Rückgängig, Löschen)
  useEffect(() => {
    if (auswahl && !teile.some((t) => t.id === auswahl.teilId)) setAuswahl(null)
  }, [teile, auswahl])

  const gewaehlt = auswahl ? teile.find((t) => t.id === auswahl.teilId) : undefined

  // Gesten und Zeichenzustand
  const zeigerRef = useRef(new Map<number, GPunkt>())
  const gesteRef = useRef<{ ids: [number, number]; start: Ansicht; finger: [GPunkt, GPunkt] } | null>(null)
  const gesteVorbeiRef = useRef(false)
  const schwenkRef = useRef<{ id: number; letzte: GPunkt } | null>(null)
  const auswahlVorDownRef = useRef<Auswahl | null>(null)
  const zeichnenRef = useRef<{ aktiv: boolean; start: GPunkt; ziele: ZielLinien; id: number }>({ aktiv: false, start: { x: 0, y: 0 }, ziele: { xs: [], ys: [] }, id: -1 })
  const ziehenRef = useRef<{
    id: number
    art: ZiehArt
    ausgang: GrundrissTeil
    vorher: GrundrissTeil[]
    start: GPunkt
    startClient: GPunkt
    ziele: ZielLinien
    bewegt: boolean
    warAusgewaehlt: boolean
    kandidaten: GrundrissTeil[]
    kanteTippen?: number
  } | null>(null)
  const tippRef = useRef<{ id: number; start: GPunkt; bewegt: boolean } | null>(null)

  const holeKasten = () => svgRef.current!.getBoundingClientRect()
  const zuM = (e: { clientX: number; clientY: number }): GPunkt => {
    const p = bildschirmZuSkizze({ x: e.clientX, y: e.clientY }, ansichtRef.current, FLAECHE, holeKasten())
    return { x: p.x / PX_PRO_M - versatz, y: p.y / PX_PRO_M - versatz }
  }
  const einheitenJePixel = () => 1 / pixelProEinheit(ansichtRef.current, FLAECHE, holeKasten()) / PX_PRO_M // m je Bildschirmpixel
  const fangSchwelle = () => FANG_PIXEL * einheitenJePixel()
  const greifRadius = (e: React.PointerEvent) => (e.pointerType === 'mouse' || e.pointerType === 'pen' ? GREIF_PIXEL_MAUS : GREIF_PIXEL_FINGER) * einheitenJePixel()
  const rastetEin = (e: { altKey: boolean }) => einrasten && !e.altKey

  /** Teile an dieser Stelle, kleinste zuerst (ein Schuppen in einem großen Teil bleibt erreichbar). */
  const teileAn = (p: GPunkt, tol: number): GrundrissTeil[] =>
    teile
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => punktImPolygon(p, t.punkte) || naechsteKante(t.punkte, p, tol) >= 0)
      .sort((a, b) => flaecheVon(a.t.punkte) - flaecheVon(b.t.punkte) || b.i - a.i)
      .map(({ t }) => t)

  const aktionAbbrechen = () => {
    const z = ziehenRef.current
    if (z?.bewegt) dispatch({ typ: 'live', teil: z.ausgang })
    ziehenRef.current = null
    zeichnenRef.current.aktiv = false
    schwenkRef.current = null
    tippRef.current = null
    setVorschau(null)
    setHilfslinien(null)
  }

  // ---------------------------------------------------------------------------
  // Neue Teile
  // ---------------------------------------------------------------------------

  /** Neues Teil: verknüpft mit dem ersten Bauteil, das noch keinen Grundriss hat (ändern geht im Auswahlfeld). */
  const neuesTeil = (punkte: GPunkt[], bevorzugteLaenge?: { laenge: number; breite: number; querformat: boolean }): GrundrissTeil => {
    const frei = bauteile.find((b) => !teile.some((t) => t.bauteilId === b.id))
    let pts = punkte
    // Hat das Bauteil schon Maße (Paket 2), nimmt das Rechteck diese Maße an – gezeichnet war nur die Lage
    if (frei?.laenge && frei.breite && bevorzugteLaenge && rechteckMasse(punkte)) {
      const [lang, kurz] = [Math.max(frei.laenge, frei.breite), Math.min(frei.laenge, frei.breite)]
      const r = bevorzugteLaenge
      const b = r.querformat ? lang : kurz
      const h = r.querformat ? kurz : lang
      const x = Math.min(...punkte.map((p) => p.x))
      const y = Math.min(...punkte.map((p) => p.y))
      pts = rechteckPunkte(x, y, b, h)
    }
    return {
      id: neueTeilId(),
      kuerzel: frei?.kuerzel ?? freiesKuerzel({ teile }, teile.length ? 'A1' : 'L'),
      ...(frei ? { bauteilId: frei.id } : {}),
      punkte: pts,
      ...(frei?.hoehe ? { hoehe: frei.hoehe } : {}),
      ...(frei?.art === 'keller' ? { gestrichelt: true } : {}),
    }
  }

  const teilAnlegen = (teil: GrundrissTeil) => {
    dispatch({ typ: 'hinzufuegen', teil })
    setAuswahl({ teilId: teil.id })
    setWerkzeug('auswahl')
    setEntwurf([])
    setVorschau(null)
  }

  const entwurfFertig = (punkte: GPunkt[] = entwurf) => {
    if (punkte.length >= 3 && flaecheVon(punkte) > 0.01) teilAnlegen(neuesTeil(punkte.map((p) => ({ x: cm(p.x), y: cm(p.y) }))))
    else setEntwurf([])
  }

  // ---------------------------------------------------------------------------
  // Tastatur
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ typ: 'undo' })
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        dispatch({ typ: 'redo' })
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && auswahl) dispatch({ typ: 'loeschen', id: auswahl.teilId })
      if (e.key === 'Escape') {
        setEntwurf([])
        setAuswahl(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [auswahl])

  // ---------------------------------------------------------------------------
  // Zeiger
  // ---------------------------------------------------------------------------

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    zeigerRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (zeigerRef.current.size >= 2) {
      if (ziehenRef.current || schwenkRef.current || tippRef.current) {
        setAuswahl(auswahlVorDownRef.current)
        setStapel(null)
      }
      aktionAbbrechen()
      const ids = [...zeigerRef.current.keys()].slice(0, 2) as [number, number]
      gesteRef.current = { ids, start: ansichtRef.current, finger: [zeigerRef.current.get(ids[0])!, zeigerRef.current.get(ids[1])!] }
      gesteVorbeiRef.current = true
      return
    }
    if (gesteVorbeiRef.current) return

    if (e.pointerType === 'mouse' && e.button === 1) {
      e.preventDefault()
      schwenkRef.current = { id: e.pointerId, letzte: { x: e.clientX, y: e.clientY } }
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const roh = zuM(e)

    if (werkzeug === 'auswahl') {
      const tol = greifRadius(e)
      auswahlVorDownRef.current = auswahl
      // 1. Griff einer Ecke des gewählten Teils → Ecke ziehen
      if (gewaehlt) {
        const ecke = naechsteEcke(gewaehlt.punkte, roh, tol)
        if (ecke >= 0) {
          ziehenRef.current = {
            id: e.pointerId, art: { art: 'ecke', index: ecke }, ausgang: gewaehlt, vorher: teile, start: roh,
            startClient: { x: e.clientX, y: e.clientY }, ziele: zielLinienTeile(teile, new Set([gewaehlt.id])),
            bewegt: false, warAusgewaehlt: true, kandidaten: [gewaehlt],
          }
          return
        }
      }
      const kandidaten = teileAn(roh, tol)
      const warAusgewaehlt = kandidaten.some((t) => t.id === auswahl?.teilId)
      const ziel = warAusgewaehlt ? kandidaten.find((t) => t.id === auswahl?.teilId)! : (kandidaten[0] ?? null)
      if (!ziel) {
        // Leere Stelle: Auswahl aufheben, Ziehen verschiebt den Ausschnitt
        setAuswahl(null)
        setStapel(null)
        schwenkRef.current = { id: e.pointerId, letzte: { x: e.clientX, y: e.clientY } }
        return
      }
      // Antippen einer Kante des gewählten Teils (oder ihrer Maßzahl) wählt die Kante; Ziehen verschiebt das Teil
      let kanteTippen: number | undefined
      if (warAusgewaehlt) {
        const k = naechsteKante(ziel.punkte, roh, tol)
        if (k >= 0) kanteTippen = k
        else {
          const mitte = ziel.punkte.findIndex((p, i) => {
            const q = ziel.punkte[(i + 1) % ziel.punkte.length]
            return abstandG(roh, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }) <= tol * 1.6
          })
          if (mitte >= 0) kanteTippen = mitte
        }
      }
      if (!warAusgewaehlt) {
        setAuswahl({ teilId: ziel.id })
        setStapel({ anzahl: kandidaten.length, index: kandidaten.indexOf(ziel) })
      }
      ziehenRef.current = {
        id: e.pointerId, art: { art: 'teil' }, ausgang: ziel, vorher: teile, start: roh,
        startClient: { x: e.clientX, y: e.clientY }, ziele: zielLinienTeile(teile, new Set([ziel.id])),
        bewegt: false, warAusgewaehlt, kandidaten, kanteTippen,
      }
      return
    }

    const ziele = zielLinienTeile(teile)
    if (werkzeug === 'rechteck') {
      const start = rastetEin(e) ? rastePunktM(roh, ziele, fangSchwelle()) : { punkt: { x: cm(roh.x), y: cm(roh.y) }, treffer: {} }
      setHilfslinien(start.treffer)
      zeichnenRef.current = { aktiv: true, start: start.punkt, ziele, id: e.pointerId }
      return
    }
    // Vieleck: die Ecke wird beim Loslassen gesetzt (ein Antippen); hier nur merken
    tippRef.current = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, bewegt: false }
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    if (zeigerRef.current.has(e.pointerId)) zeigerRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const geste = gesteRef.current
    if (geste) {
      const a = zeigerRef.current.get(geste.ids[0])
      const b = zeigerRef.current.get(geste.ids[1])
      if (a && b) setzeAnsicht(zweiFingerAnsicht(geste.start, geste.finger, [a, b], FLAECHE, holeKasten()))
      return
    }
    if (gesteVorbeiRef.current) return

    const schwenk = schwenkRef.current
    if (schwenk && schwenk.id === e.pointerId) {
      setzeAnsicht(verschiebeUmPixel(ansichtRef.current, e.clientX - schwenk.letzte.x, e.clientY - schwenk.letzte.y, FLAECHE, holeKasten()))
      schwenk.letzte = { x: e.clientX, y: e.clientY }
      return
    }

    const tipp = tippRef.current
    if (tipp && tipp.id === e.pointerId && !tipp.bewegt && Math.hypot(e.clientX - tipp.start.x, e.clientY - tipp.start.y) >= ZIEH_SCHWELLE_PIXEL) tipp.bewegt = true

    const roh = zuM(e)

    const v = ziehenRef.current
    if (v && v.id === e.pointerId) {
      if (!v.bewegt) {
        if (Math.hypot(e.clientX - v.startClient.x, e.clientY - v.startClient.y) < ZIEH_SCHWELLE_PIXEL) return
        v.bewegt = true
      }
      if (v.art.art === 'ecke') {
        const index = v.art.index
        const ziel = rastetEin(e) ? rastePunktM(roh, v.ziele, fangSchwelle()) : { punkt: { x: cm(roh.x), y: cm(roh.y) }, treffer: {} }
        setHilfslinien(ziel.treffer)
        dispatch({ typ: 'live', teil: { ...v.ausgang, punkte: bewegeEcke(v.ausgang.punkte, index, ziel.punkt) } })
        return
      }
      let dx = roh.x - v.start.x
      let dy = roh.y - v.start.y
      if (rastetEin(e)) {
        const r = rasteVerschiebungM(v.ausgang.punkte, dx, dy, v.ziele, fangSchwelle())
        dx = r.dx
        dy = r.dy
        setHilfslinien(r.treffer)
      } else setHilfslinien(null)
      dispatch({ typ: 'live', teil: { ...v.ausgang, punkte: verschiebePunkte(v.ausgang.punkte, dx, dy) } })
      return
    }

    const z = zeichnenRef.current
    if (z.aktiv && z.id === e.pointerId) {
      const ende = rastetEin(e) ? rastePunktM(roh, z.ziele, fangSchwelle()) : { punkt: { x: cm(roh.x), y: cm(roh.y) }, treffer: {} }
      setHilfslinien(ende.treffer)
      setVorschau({ a: z.start, b: ende.punkt })
      return
    }

    // Vieleck: Gummiband von der letzten Ecke zum Zeiger
    if (werkzeug === 'vieleck' && entwurf.length > 0) {
      const ziele = zielLinienTeile(teile)
      const letzte = entwurf[entwurf.length - 1]
      const ziel = rastetEin(e) ? rasteEckeM(letzte, roh, ziele, fangSchwelle()) : { punkt: { x: cm(roh.x), y: cm(roh.y) }, treffer: {} }
      setHilfslinien(ziel.treffer)
      setVorschau({ a: letzte, b: ziel.punkt })
    }
  }

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

  const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    if (zeigerLoesen(e)) return
    aktionAbbrechen()
  }

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    if (zeigerLoesen(e)) return
    setHilfslinien(null)

    const v = ziehenRef.current
    if (v && v.id === e.pointerId) {
      ziehenRef.current = null
      if (v.bewegt) {
        dispatch({ typ: 'ziehen-fertig', vorher: v.vorher })
      } else if (v.kanteTippen !== undefined) {
        const gleiche = auswahl?.teilId === v.ausgang.id && auswahl.kante === v.kanteTippen
        setAuswahl({ teilId: v.ausgang.id, ...(gleiche ? {} : { kante: v.kanteTippen }) })
      } else if (v.warAusgewaehlt && v.kandidaten.length > 1) {
        const i = v.kandidaten.findIndex((t) => t.id === v.ausgang.id)
        const naechste = v.kandidaten[(i + 1) % v.kandidaten.length]
        setAuswahl({ teilId: naechste.id })
        setStapel({ anzahl: v.kandidaten.length, index: v.kandidaten.indexOf(naechste) })
      } else if (v.warAusgewaehlt) {
        setAuswahl({ teilId: v.ausgang.id })
      }
      return
    }

    const z = zeichnenRef.current
    if (z.aktiv && z.id === e.pointerId) {
      z.aktiv = false
      setVorschau(null)
      const roh = zuM(e)
      const ende = rastetEin(e) ? rastePunktM(roh, z.ziele, fangSchwelle()) : { punkt: { x: cm(roh.x), y: cm(roh.y) }, treffer: {} }
      const b = Math.abs(ende.punkt.x - z.start.x)
      const h = Math.abs(ende.punkt.y - z.start.y)
      if (b < MIN_SEITE_M || h < MIN_SEITE_M) return
      const pts = rechteckPunkte(Math.min(z.start.x, ende.punkt.x), Math.min(z.start.y, ende.punkt.y), cm(b), cm(h))
      teilAnlegen(neuesTeil(pts, { laenge: Math.max(b, h), breite: Math.min(b, h), querformat: b >= h }))
      return
    }

    const tipp = tippRef.current
    if (tipp && tipp.id === e.pointerId) {
      tippRef.current = null
      if (tipp.bewegt || werkzeug !== 'vieleck') return
      const roh = zuM(e)
      // Antippen der ersten Ecke schließt das Vieleck
      if (entwurf.length >= 3 && abstandG(roh, entwurf[0]) <= greifRadius(e) * 1.5) {
        entwurfFertig()
        return
      }
      const ziele = zielLinienTeile(teile)
      const letzte = entwurf[entwurf.length - 1]
      const ziel = !rastetEin(e)
        ? { punkt: { x: cm(roh.x), y: cm(roh.y) } }
        : letzte
          ? rasteEckeM(letzte, roh, ziele, fangSchwelle())
          : rastePunktM(roh, ziele, fangSchwelle())
      setEntwurf((alt) => [...alt, ziel.punkt])
      setVorschau(null)
    }
  }

  // Mausrad zoomt um den Mauszeiger
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const beiRad = (e: WheelEvent) => {
      if (ansichtRef.current.zoom <= ZOOM_MIN && e.deltaY > 0) return
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      setzeAnsicht(zoomUmPunkt(ansichtRef.current, radFaktor(delta), { x: e.clientX, y: e.clientY }, FLAECHE, svg.getBoundingClientRect()))
    }
    svg.addEventListener('wheel', beiRad, { passive: false })
    return () => svg.removeEventListener('wheel', beiRad)
  }, [setzeAnsicht])

  // ---------------------------------------------------------------------------
  // Änderungen am gewählten Teil (Auswahlfeld darunter)
  // ---------------------------------------------------------------------------

  const aendere = (teil: GrundrissTeil, fn: Partial<GrundrissTeil> | ((t: GrundrissTeil) => GrundrissTeil), key?: string) =>
    dispatch({ typ: 'aendern', id: teil.id, teil: fn, key })

  const bauteilWahl = (teil: GrundrissTeil, wahl: string) => {
    if (wahl === '') {
      aendere(teil, { bauteilId: undefined })
      return
    }
    let b: Bauteil | undefined
    if (wahl.startsWith('neu:')) b = onNeuesBauteil(wahl.slice(4) as BauteilArt)
    else b = bauteile.find((x) => x.id === wahl)
    if (!b) return
    const verknuepft = b
    aendere(teil, (t) => ({
      ...t,
      bauteilId: verknuepft.id,
      kuerzel: verknuepft.kuerzel,
      ...(t.hoehe === undefined && verknuepft.hoehe ? { hoehe: verknuepft.hoehe } : {}),
      ...(verknuepft.art === 'keller' ? { gestrichelt: true } : {}),
    }))
  }

  // ---------------------------------------------------------------------------
  // Zeichnen der Szene
  // ---------------------------------------------------------------------------

  const daten: GrundrissDaten = { teile, raster, massketten }
  const ketten = massketten ? masskette(daten) : []
  const ppe = pixelProEinheit(ansicht, FLAECHE, { left: 0, top: 0, width: breitePx || FLAECHE.breite, height: 0 }) // Bildschirmpixel je Einheit
  const griff = 7 / (ppe || 1)
  const schrift = 11
  const pfad = (pts: GPunkt[]) => pts.map((p) => `${PX(p.x)},${PX(p.y)}`).join(' ')

  // Raster: ab Meter 0 der Parzelle (bzw. der Fläche), Abstand wie in der Grün-Skizze
  const rasterLinien = []
  if (raster) {
    const schritt = rasterSchritt * PX_PRO_M
    const start = versatz * PX_PRO_M
    const dunkel = (k: number) => (k % 5 === 0 ? '#cfcfcf' : '#e6e6e6')
    for (let k = -Math.floor(start / schritt); start + k * schritt <= FLAECHE.breite; k++) {
      const x = start + k * schritt
      rasterLinien.push(<line key={`vr-${k}`} x1={x} y1={0} x2={x} y2={FLAECHE.hoehe} stroke={dunkel(k)} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)
    }
    for (let k = -Math.floor(start / schritt); start + k * schritt <= FLAECHE.hoehe; k++) {
      const y = start + k * schritt
      rasterLinien.push(<line key={`hr-${k}`} x1={0} y1={y} x2={FLAECHE.breite} y2={y} stroke={dunkel(k)} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)
    }
  }

  const massLinie = (key: string, von: GPunkt, nach: GPunkt, text: string, textUnten: boolean) => {
    const dx = nach.x - von.x
    const dy = nach.y - von.y
    const l = Math.hypot(dx, dy) || 1
    const nx = (-dy / l) * 4
    const ny = (dx / l) * 4
    const m = { x: PX((von.x + nach.x) / 2), y: PX((von.y + nach.y) / 2) }
    const waagerecht = Math.abs(dx) >= Math.abs(dy)
    return (
      <g key={key} stroke="#C00000" strokeWidth={1} fill="#C00000" vectorEffect="non-scaling-stroke">
        <line x1={PX(von.x)} y1={PX(von.y)} x2={PX(nach.x)} y2={PX(nach.y)} vectorEffect="non-scaling-stroke" />
        <line x1={PX(von.x) - nx} y1={PX(von.y) - ny} x2={PX(von.x) + nx} y2={PX(von.y) + ny} vectorEffect="non-scaling-stroke" />
        <line x1={PX(nach.x) - nx} y1={PX(nach.y) - ny} x2={PX(nach.x) + nx} y2={PX(nach.y) + ny} vectorEffect="non-scaling-stroke" />
        <text
          x={waagerecht ? m.x : m.x + 5}
          y={waagerecht ? (textUnten ? m.y + schrift + 2 : m.y - 3) : m.y + schrift / 3}
          textAnchor={waagerecht ? 'middle' : 'start'}
          fontSize={schrift}
          stroke="none"
        >
          {text}
        </text>
      </g>
    )
  }

  const auswahlName = gewaehlt ? kuerzelVon(gewaehlt, bauteile) : ''
  const kantenText =
    gewaehlt && auswahl?.kante !== undefined
      ? `Kante ${auswahl.kante + 1} von ${gewaehlt.punkte.length} · ${meterText(kantenLaenge(gewaehlt.punkte, auswahl.kante))}`
      : ''
  const hinweis =
    werkzeug === 'rechteck'
      ? 'Rechteck ziehen – danach die Länge einer Kante antippen und eintippen.'
      : werkzeug === 'vieleck'
        ? entwurf.length
          ? `${entwurf.length} ${entwurf.length === 1 ? 'Ecke' : 'Ecken'} gesetzt – weiter antippen, die erste Ecke oder „Fertig“ schließt die Form.`
          : 'Ecken nacheinander antippen (L-Form, schräge Wand …).'
        : null

  return (
    <div className="skizze-editor grundriss-editor">
      <div role="toolbar" aria-label="Zeichenwerkzeuge Grundriss" className="werkzeuge">
        {WERKZEUGE.map((w) => (
          <button
            key={w.id}
            type="button"
            className="werkzeug"
            title={w.titel}
            aria-label={w.name}
            aria-pressed={werkzeug === w.id}
            onClick={() => {
              setWerkzeug(w.id)
              setEntwurf([])
              setVorschau(null)
            }}
          >
            <w.icon {...ICON} />
          </button>
        ))}
        <span className="werkzeuge-trenner" aria-hidden="true" />
        <button type="button" className="werkzeug" title="Rückgängig (Strg+Z)" aria-label="Rückgängig" disabled={!kannUndo(zustand)} onClick={() => dispatch({ typ: 'undo' })}>
          <Undo2 {...ICON} />
        </button>
        <button type="button" className="werkzeug" title="Wiederholen (Strg+Y)" aria-label="Wiederholen" disabled={!kannRedo(zustand)} onClick={() => dispatch({ typ: 'redo' })}>
          <Redo2 {...ICON} />
        </button>
        {gewaehlt && (
          <button type="button" className="werkzeug werkzeug-gefahr" title="Ausgewähltes Teil löschen (Entf)" aria-label="Ausgewähltes Teil löschen" onClick={() => dispatch({ typ: 'loeschen', id: gewaehlt.id })}>
            <Trash2 {...ICON} />
          </button>
        )}
        <button type="button" className="werkzeug werkzeug-schalter" title="Raster (1 m) ein-/ausblenden" aria-label="Raster" aria-pressed={raster} onClick={() => setRaster(!raster)}>
          <Grid3x3 {...ICON} />
        </button>
        <button type="button" className="werkzeug werkzeug-schalter" title="Maßketten ein-/ausblenden (auch im Excel-Export)" aria-label="Maßketten" aria-pressed={massketten} onClick={() => setMassketten(!massketten)}>
          <Ruler {...ICON} />
        </button>
        <button
          type="button"
          className="werkzeug werkzeug-schalter"
          title="Einrasten an Ecken und Kanten anderer Teile, gerade Linien und 5-cm-Raster (am PC: Alt gedrückt halten schaltet kurz aus)"
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

      {werkzeug === 'vieleck' && entwurf.length > 0 && (
        <div className="werkzeuge" role="group" aria-label="Vieleck">
          <button type="button" className="knopf knopf-primaer" disabled={entwurf.length < 3} onClick={() => entwurfFertig()}>
            Fertig
          </button>
          <button
            type="button"
            className="knopf"
            onClick={() => {
              setEntwurf((alt) => alt.slice(0, -1))
              setVorschau(null)
            }}
          >
            Letzte Ecke zurück
          </button>
          <button
            type="button"
            className="knopf"
            onClick={() => {
              setEntwurf([])
              setVorschau(null)
            }}
          >
            Verwerfen
          </button>
        </div>
      )}

      <p className="skizze-auswahl" aria-live="polite">
        {hinweis ?? (gewaehlt ? (
          <>
            Ausgewählt: {auswahlName} · {zahl2Text(flaecheVon(gewaehlt.punkte))} m²{kantenText && ` · ${kantenText}`}
            {stapel && stapel.anzahl > 1 && ` · ${stapel.index + 1} von ${stapel.anzahl} hier – nochmal tippen`}
          </>
        ) : (
          <span className="neben">{teile.length ? 'Nichts ausgewählt – ein Teil antippen, ziehen verschiebt, eine Kante antippen ändert ihr Maß.' : 'Noch kein Grundriss: Rechteck wählen und ziehen.'}</span>
        ))}
      </p>

      {parzelle && (
        <p className="neben" data-testid="grundriss-massstab">
          Parzelle {meterText(parzelle.breiteM)} × {meterText(parzelle.hoeheM)} · {massstabText(parzelle.abb.pxProM)} – wie in der Grün-Skizze
        </p>
      )}
      <div className="skizze-bereich">
        <div className="skizze-flaeche" style={{ aspectRatio: `${FLAECHE.breite} / ${FLAECHE.hoehe}`, cursor: werkzeug === 'auswahl' ? 'default' : 'crosshair' }}>
          <svg
            ref={svgRef}
            data-testid="grundriss-flaeche"
            viewBox={viewBoxText(ansicht, FLAECHE)}
            width="100%"
            height="100%"
            style={{ display: 'block' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <rect width={FLAECHE.breite} height={FLAECHE.hoehe} fill="#fff" />
            {rasterLinien}

            <g transform={`translate(${versatz * PX_PRO_M} ${versatz * PX_PRO_M})`}>
            {parzelle && (
              <g data-testid="grundriss-parzelle" pointerEvents="none">
                <polygon points={pfad(parzelle.punkte)} fill="#E2F0D9" fillOpacity={0.85} stroke="#595959" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                {parzelle.punkte.map((p, i) => {
                  const q = parzelle.punkte[(i + 1) % parzelle.punkte.length]
                  const l = parzelle.seiten[i]
                  const mx = (p.x + q.x) / 2
                  const my = (p.y + q.y) / 2
                  // Beschriftung außerhalb der Kante: weg vom Schwerpunkt der Parzelle
                  const cx = parzelle.punkte.reduce((a, r) => a + r.x, 0) / parzelle.punkte.length
                  const cy = parzelle.punkte.reduce((a, r) => a + r.y, 0) / parzelle.punkte.length
                  const dx = mx - cx
                  const dy = my - cy
                  const d = Math.hypot(dx, dy) || 1
                  return (
                    <text key={`pm${i}`} x={PX(mx + (dx / d) * 0.9)} y={PX(my + (dy / d) * 0.9) + 4} textAnchor="middle" fontSize={12} fill="#595959">
                      {meterText(l)}
                    </text>
                  )
                })}
              </g>
            )}

            {teile.map((t) => {
              const istGewaehlt = t.id === auswahl?.teilId
              const s = schwerpunktVon(t.punkte)
              const z = massenVon(t)
              return (
                <g key={t.id} data-teil={t.id}>
                  <polygon
                    points={pfad(t.punkte)}
                    fill={t.gestrichelt ? 'none' : istGewaehlt ? '#DCE6F7' : '#E7E6E6'}
                    stroke={istGewaehlt ? '#1d4ed8' : '#262626'}
                    strokeWidth={istGewaehlt ? 2.5 : 1.5}
                    strokeDasharray={t.gestrichelt ? '6 4' : undefined}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="miter"
                  />
                  <text x={PX(s.x)} y={PX(s.y) - 2} textAnchor="middle" fontSize={14} fontWeight={600} fill="#111">
                    {kuerzelVon(t, bauteile)}
                  </text>
                  <text x={PX(s.x)} y={PX(s.y) + 14} textAnchor="middle" fontSize={11} fill="#333">
                    {zahl2Text(z.flaeche)} m²
                  </text>
                </g>
              )
            })}

            {ketten.map((m, i) => massLinie(`m${i}`, m.von, m.nach, m.text, m.art === 'kette-x' || m.art === 'gesamt-x'))}

            {/* Auswahl: gewählte Kante, Maßzahlen aller Kanten, Griffe an den Ecken */}
            {gewaehlt && (
              <g>
                {gewaehlt.punkte.map((p, i) => {
                  const q = gewaehlt.punkte[(i + 1) % gewaehlt.punkte.length]
                  const m = { x: PX((p.x + q.x) / 2), y: PX((p.y + q.y) / 2) }
                  const aktiv = auswahl?.kante === i
                  const text = zahlText(kantenLaenge(gewaehlt.punkte, i))
                  const w = (text.length * 6.5 + 10) / (ppe || 1) * 1
                  return (
                    <g key={`k${i}`} data-kante={i}>
                      {aktiv && <line x1={PX(p.x)} y1={PX(p.y)} x2={PX(q.x)} y2={PX(q.y)} stroke="#ea580c" strokeWidth={4} vectorEffect="non-scaling-stroke" />}
                      <rect x={m.x - w / 2} y={m.y - 8 / (ppe || 1)} width={w} height={16 / (ppe || 1)} rx={3 / (ppe || 1)} fill={aktiv ? '#ea580c' : '#fff'} stroke="#1d4ed8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                      <text x={m.x} y={m.y + 4 / (ppe || 1)} textAnchor="middle" fontSize={11 / (ppe || 1)} fill={aktiv ? '#fff' : '#1d4ed8'}>
                        {text}
                      </text>
                    </g>
                  )
                })}
                {gewaehlt.punkte.map((p, i) => (
                  <circle key={`e${i}`} cx={PX(p.x)} cy={PX(p.y)} r={griff} fill="#fff" stroke="#1d4ed8" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )}

            {/* Vorschau: Rechteck beim Ziehen, Vieleck beim Antippen */}
            {werkzeug === 'rechteck' && vorschau && (
              <g pointerEvents="none">
                <rect
                  x={PX(Math.min(vorschau.a.x, vorschau.b.x))} y={PX(Math.min(vorschau.a.y, vorschau.b.y))}
                  width={PX(Math.abs(vorschau.b.x - vorschau.a.x))} height={PX(Math.abs(vorschau.b.y - vorschau.a.y))}
                  fill="rgba(29,78,216,0.12)" stroke="#1d4ed8" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke"
                />
                <text x={PX((vorschau.a.x + vorschau.b.x) / 2)} y={PX(Math.min(vorschau.a.y, vorschau.b.y)) - 5} textAnchor="middle" fontSize={12} fill="#1d4ed8">
                  {zahlText(Math.abs(vorschau.b.x - vorschau.a.x))} × {zahlText(Math.abs(vorschau.b.y - vorschau.a.y))} m
                </text>
              </g>
            )}
            {werkzeug === 'vieleck' && entwurf.length > 0 && (
              <g pointerEvents="none">
                <polyline points={pfad(vorschau ? [...entwurf, vorschau.b] : entwurf)} fill="rgba(29,78,216,0.10)" stroke="#1d4ed8" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                {entwurf.map((p, i) => (
                  <circle key={i} cx={PX(p.x)} cy={PX(p.y)} r={griff} fill={i === 0 ? '#1d4ed8' : '#fff'} stroke="#1d4ed8" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                ))}
                {vorschau && (
                  <text x={PX((vorschau.a.x + vorschau.b.x) / 2)} y={PX((vorschau.a.y + vorschau.b.y) / 2) - 5} textAnchor="middle" fontSize={12} fill="#1d4ed8">
                    {meterText(abstandG(vorschau.a, vorschau.b))}
                  </text>
                )}
              </g>
            )}

            {hilfslinien?.x !== undefined && (
              <line className="skizze-hilfslinie" x1={PX(hilfslinien.x)} y1={-versatz * PX_PRO_M} x2={PX(hilfslinien.x)} y2={FLAECHE.hoehe} stroke="#d6336c" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
            {hilfslinien?.y !== undefined && (
              <line className="skizze-hilfslinie" x1={-versatz * PX_PRO_M} y1={PX(hilfslinien.y)} x2={FLAECHE.breite} y2={PX(hilfslinien.y)} stroke="#d6336c" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
            </g>
          </svg>
        </div>
        <div role="group" aria-label="Ansicht" className="skizze-ansicht">
          <button type="button" className="werkzeug" title="Hineinzoomen (zwei Finger auseinander, Mausrad)" aria-label="Hineinzoomen" disabled={ansicht.zoom >= ZOOM_MAX} onClick={() => setzeAnsicht(zoomUmMitte(ansichtRef.current, ZOOM_SCHRITT, FLAECHE, holeKasten()))}>
            <ZoomIn {...ICON} />
          </button>
          <button type="button" className="werkzeug" title="Herauszoomen" aria-label="Herauszoomen" disabled={ansicht.zoom <= ZOOM_MIN} onClick={() => setzeAnsicht(zoomUmMitte(ansichtRef.current, 1 / ZOOM_SCHRITT, FLAECHE, holeKasten()))}>
            <ZoomOut {...ICON} />
          </button>
          <button type="button" className="werkzeug" title="Ganze Fläche zeigen" aria-label="Ganze Skizze" disabled={ansicht.zoom === GANZE_SKIZZE.zoom && ansicht.x === 0 && ansicht.y === 0} onClick={() => setzeAnsicht(GANZE_SKIZZE)}>
            <Maximize {...ICON} />
          </button>
        </div>
        {ansicht.zoom > ZOOM_MIN && (
          <span className="skizze-zoom" aria-live="off">
            Zoom {Math.round(ansicht.zoom * 100)} %
          </span>
        )}
      </div>

      {gewaehlt && (
        <TeilFormular
          key={gewaehlt.id}
          teil={gewaehlt}
          kante={auswahl?.kante}
          bauteile={bauteile}
          onAendern={(fn, key) => aendere(gewaehlt, fn, key)}
          onBauteil={(wahl) => bauteilWahl(gewaehlt, wahl)}
          onKante={(kante) => setAuswahl({ teilId: gewaehlt.id, ...(kante !== undefined ? { kante } : {}) })}
          onLoeschen={() => dispatch({ typ: 'loeschen', id: gewaehlt.id })}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Auswahlfeld: Kante, Maße, Bauteil, Höhen, Dachform
// ---------------------------------------------------------------------------

function TeilFormular({
  teil,
  kante,
  bauteile,
  onAendern,
  onBauteil,
  onKante,
  onLoeschen,
}: {
  teil: GrundrissTeil
  kante?: number
  bauteile: ReadonlyArray<Bauteil>
  onAendern: (fn: Partial<GrundrissTeil> | ((t: GrundrissTeil) => GrundrissTeil), key?: string) => void
  onBauteil: (wahl: string) => void
  onKante: (kante: number | undefined) => void
  onLoeschen: () => void
}) {
  const bauteilId = useId()
  const rechteck = rechteckMasse(teil.punkte)
  const m = massenVon(teil)
  const dach = teil.dachform ?? 'flach'
  const verknuepft = teil.bauteilId ? bauteile.find((b) => b.id === teil.bauteilId) : undefined
  const kantenWert = kante !== undefined && kante < teil.punkte.length ? kantenLaenge(teil.punkte, kante) : undefined

  return (
    <fieldset className="fieldset abschnitt grundriss-auswahl" aria-label="Ausgewähltes Teil">
      <legend className="label">
        {kuerzelVon(teil, bauteile)} · {zahl2Text(m.flaeche)} m²
      </legend>

      {kantenWert !== undefined && kante !== undefined && (
        <div className="grundriss-kante">
          <ZahlFeld
            key={`kante-${kante}`}
            label={`Länge der Kante ${kante + 1}`}
            einheit="m"
            wert={cm(kantenWert)}
            onChange={(v) => v !== undefined && v > 0.04 && onAendern((t) => ({ ...t, punkte: setzeKantenLaenge(t.punkte, kante, v) }), `kante-${kante}`)}
            hilfe={rechteck ? 'Die gegenüberliegende Seite zieht mit, das Rechteck bleibt rechtwinklig.' : 'Die Form passt sich an.'}
          />
          <button type="button" className="textknopf" onClick={() => onKante(undefined)}>
            Kante abwählen
          </button>
        </div>
      )}

      {rechteck && (
        <div className="feld-reihe">
          <ZahlFeld
            label="Länge"
            einheit="m"
            wert={rechteck.laenge}
            onChange={(v) => v !== undefined && v > 0.04 && onAendern((t) => ({ ...t, punkte: setzeRechteckMasse(t.punkte, v, undefined) }), 'laenge')}
          />
          <ZahlFeld
            label="Breite"
            einheit="m"
            wert={rechteck.breite}
            onChange={(v) => v !== undefined && v > 0.04 && onAendern((t) => ({ ...t, punkte: setzeRechteckMasse(t.punkte, undefined, v) }), 'breite')}
          />
        </div>
      )}
      {!rechteck && kantenWert === undefined && <p className="neben">{teil.punkte.length} Ecken – eine Kante antippen, um ihre Länge einzutippen.</p>}

      <div className="feld">
        <label className="label" htmlFor={bauteilId}>
          Bauteil (Bewertung)
        </label>
        <select id={bauteilId} className="eingabe" value={teil.bauteilId && verknuepft ? teil.bauteilId : ''} onChange={(e) => onBauteil(e.target.value)}>
          <option value="">– nicht verknüpft –</option>
          {bauteile.length > 0 && (
            <optgroup label="Vorhandene Bauteile">
              {bauteile.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.kuerzel}
                  {b.bezeichnung ? ` · ${b.bezeichnung}` : ''}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Neues Bauteil anlegen">
            {BAUTEIL_ARTEN.map((a) => (
              <option key={a.art} value={`neu:${a.art}`}>
                {a.text}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="neben">
          {verknuepft
            ? `Fläche${m.kubaturM3 !== undefined ? ' und Kubatur' : ''} gehen in die Bewertung von ${verknuepft.kuerzel} ein.`
            : 'Ohne Bauteil ist es nur Zeichnung – die Fläche fließt nicht in die Bewertung.'}
        </p>
      </div>
      {!verknuepft && <TextFeld label="Kürzel" wert={teil.kuerzel} onChange={(v) => onAendern({ kuerzel: v }, 'kuerzel')} platzhalter="z. B. L, A1, S, Ü1" />}

      <div className="feld-reihe">
        <ZahlFeld label={dach === 'flach' ? 'Höhe' : dach === 'pult' ? 'Niedrige Wand' : 'Wandhöhe (Traufe)'} einheit="m" wert={teil.hoehe} onChange={(v) => onAendern({ hoehe: v }, 'hoehe')} />
        <AuswahlFeld<Dachform>
          label="Dachform"
          wert={dach}
          optionen={DACHFORMEN.map((d) => ({ wert: d.id, text: d.text }))}
          onChange={(v) => onAendern({ dachform: v === 'flach' ? undefined : (v ?? undefined) })}
        />
      </div>
      <DachFelder dachform={dach} hoeheOben={teil.hoeheOben} dach={teil} onAendern={(p, key) => onAendern(p, key)} />
      <Schalter label="Gestrichelt zeichnen (Keller, Hauswasser)" an={Boolean(teil.gestrichelt)} onChange={(v) => onAendern({ gestrichelt: v || undefined })} />

      <p className="neben" data-testid="grundriss-massen">
        Fläche {zahl2Text(m.flaeche)} m² · Umfang {meterText(m.umfang)}
        {m.kubaturM3 !== undefined ? ` · Kubatur ${zahl2Text(m.kubaturM3)} m³` : ''}
      </p>
      {m.hinweise.map((h) => (
        <p key={h} className="neben grundriss-hinweis">
          {h}
        </p>
      ))}
      <button type="button" className="knopf knopf-gefahr" onClick={onLoeschen}>
        <Trash2 {...ICON} />
        Teil löschen
      </button>
    </fieldset>
  )
}
