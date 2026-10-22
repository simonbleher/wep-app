/**
 * 3D-Ansicht der Laube (Beta 4, Paket 5): zeigt ein `Modell3D` mit three.js – drehbar (Finger/Maus), zoombar (zwei Finger, Mausrad), nur Ansicht.
 *
 * Diese Datei zieht three.js hinein und wird deshalb nur nachgeladen (`React.lazy` in `SkizzeBauTab`); der Service Worker legt den
 * Teil mit allen anderen Dateien in den Zwischenspeicher, die Ansicht läuft also auch ohne Netz.
 * Flüssig auf dem Tablet: gezeichnet wird nur bei Bewegung (kein Dauerlauf), Pixeldichte höchstens 2, keine Schatten, kein Nachbearbeiten,
 * wenige hundert Dreiecke. Die Zahlen kommen fertig aus `modell3d.ts`/`kamera3d.ts` (getestet).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Material,
} from 'three'
import { Maximize, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { ICON } from '@/app/ui'
import { FARBE_KANTE, FARBE_RASTER, type Modell3D } from './modell3d'
import { SICHTFELD_GRAD, dreheKamera, kameraPosition, startKamera, zoomeKamera, type Kamera3D } from './kamera3d'

const HINTERGRUND = '#ffffff' // --farbe-grund
const ZOOM_SCHRITT = 1.25

/** Ob dieser Browser WebGL kann (ohne ein Gerät zu belegen). */
function webglMoeglich(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

function flaeche(positionen: number[], material: Material): Mesh | undefined {
  if (!positionen.length) return undefined
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positionen), 3))
  g.computeVertexNormals()
  return new Mesh(g, material)
}

function linien(positionen: number[], farbe: string, deckkraft: number): LineSegments | undefined {
  if (!positionen.length) return undefined
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positionen), 3))
  return new LineSegments(g, new LineBasicMaterial({ color: new Color(farbe), transparent: deckkraft < 1, opacity: deckkraft }))
}

function gibFrei(gruppe: Scene): void {
  for (const kind of [...gruppe.children]) {
    gruppe.remove(kind)
    const m = kind as Mesh
    m.geometry?.dispose()
    const mat = m.material as Material | Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  }
}

export function Ansicht3D({ modell }: { modell: Modell3D }) {
  const huelle = useRef<HTMLDivElement>(null)
  const leinwand = useRef<HTMLCanvasElement>(null)
  const szene = useRef<{ renderer: WebGLRenderer; scene: Scene; kamera: PerspectiveCamera } | null>(null)
  const kameraZustand = useRef<Kamera3D | null>(null)
  const modellRef = useRef(modell)
  modellRef.current = modell
  const geplant = useRef(false)
  const [fehler, setFehler] = useState<string | undefined>(() => (webglMoeglich() ? undefined : 'Dieses Gerät kann keine 3D-Ansicht zeigen (WebGL fehlt).'))
  const [anzeige, setAnzeige] = useState<Kamera3D | null>(null)

  const zeichne = useCallback(() => {
    if (geplant.current) return
    geplant.current = true
    requestAnimationFrame(() => {
      geplant.current = false
      const s = szene.current
      const k = kameraZustand.current
      if (!s || !k) return
      const [x, y, z] = kameraPosition(k)
      s.kamera.position.set(x, y, z)
      s.kamera.lookAt(0, modellRef.current.hoechsterPunkt / 3, 0)
      s.renderer.render(s.scene, s.kamera)
      setAnzeige(k)
    })
  }, [])

  const setzeKamera = useCallback(
    (k: Kamera3D) => {
      kameraZustand.current = k
      zeichne()
    },
    [zeichne],
  )

  const zuruecksetzen = useCallback(() => {
    const el = leinwand.current
    const verh = el && el.clientHeight ? el.clientWidth / el.clientHeight : 1.5
    setzeKamera(startKamera(modellRef.current.radius, verh))
  }, [setzeKamera])

  // Aufbau von Renderer und Kamera, Größenanpassung, Bedienung
  useEffect(() => {
    const el = leinwand.current
    const kasten = huelle.current
    if (!el || !kasten || fehler) return
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas: el, antialias: true, alpha: false })
    } catch {
      setFehler('Die 3D-Ansicht konnte nicht gestartet werden.')
      return
    }
    renderer.setClearColor(new Color(HINTERGRUND), 1)
    const scene = new Scene()
    const kamera = new PerspectiveCamera(SICHTFELD_GRAD, 1.5, 0.1, 400)
    szene.current = { renderer, scene, kamera }

    const passeAn = () => {
      const b = Math.max(1, kasten.clientWidth)
      const h = Math.max(1, kasten.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(b, h, false)
      kamera.aspect = b / h
      kamera.updateProjectionMatrix()
      if (!kameraZustand.current) kameraZustand.current = startKamera(modellRef.current.radius, b / h)
      zeichne()
    }
    const beobachter = new ResizeObserver(passeAn)
    beobachter.observe(kasten)
    passeAn()

    // Zeiger: eine Berührung/Maustaste dreht, zwei Finger zoomen
    const zeiger = new Map<number, { x: number; y: number }>()
    let letzterAbstand = 0
    const abstand2 = () => {
      const [a, b] = [...zeiger.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const runter = (e: PointerEvent) => {
      try {
        el.setPointerCapture(e.pointerId) // Bewegung auch außerhalb der Fläche weiterverfolgen
      } catch {
        /* kein aktiver Zeiger (z. B. Test): ohne Einfangen weiter */
      }
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (zeiger.size === 2) letzterAbstand = abstand2()
    }
    const bewegt = (e: PointerEvent) => {
      const alt = zeiger.get(e.pointerId)
      const k = kameraZustand.current
      if (!alt || !k) return
      const dx = e.clientX - alt.x
      const dy = e.clientY - alt.y
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (zeiger.size === 1) {
        setzeKamera(dreheKamera(k, dx, dy))
      } else if (zeiger.size === 2) {
        const neu = abstand2()
        if (letzterAbstand > 0 && neu > 0) setzeKamera(zoomeKamera(k, neu / letzterAbstand, modellRef.current.radius))
        letzterAbstand = neu
      }
    }
    const hoch = (e: PointerEvent) => {
      zeiger.delete(e.pointerId)
      letzterAbstand = zeiger.size === 2 ? abstand2() : 0
    }
    const rad = (e: WheelEvent) => {
      e.preventDefault()
      const k = kameraZustand.current
      if (k) setzeKamera(zoomeKamera(k, Math.exp(-e.deltaY * 0.0015), modellRef.current.radius))
    }
    const taste = (e: KeyboardEvent) => {
      const k = kameraZustand.current
      if (!k) return
      const schritt = 24
      const aktionen: Record<string, () => Kamera3D> = {
        ArrowLeft: () => dreheKamera(k, -schritt, 0),
        ArrowRight: () => dreheKamera(k, schritt, 0),
        ArrowUp: () => dreheKamera(k, 0, -schritt),
        ArrowDown: () => dreheKamera(k, 0, schritt),
        '+': () => zoomeKamera(k, ZOOM_SCHRITT, modellRef.current.radius),
        '-': () => zoomeKamera(k, 1 / ZOOM_SCHRITT, modellRef.current.radius),
      }
      const a = aktionen[e.key]
      if (a) {
        e.preventDefault()
        setzeKamera(a())
      }
    }
    const verloren = (e: Event) => {
      e.preventDefault()
      setFehler('Die 3D-Ansicht wurde vom Gerät beendet (Speicher knapp). Reiter wechseln und zurückkehren.')
    }
    el.addEventListener('pointerdown', runter)
    el.addEventListener('pointermove', bewegt)
    el.addEventListener('pointerup', hoch)
    el.addEventListener('pointercancel', hoch)
    el.addEventListener('wheel', rad, { passive: false })
    el.addEventListener('keydown', taste)
    el.addEventListener('webglcontextlost', verloren)
    return () => {
      beobachter.disconnect()
      el.removeEventListener('pointerdown', runter)
      el.removeEventListener('pointermove', bewegt)
      el.removeEventListener('pointerup', hoch)
      el.removeEventListener('pointercancel', hoch)
      el.removeEventListener('wheel', rad)
      el.removeEventListener('keydown', taste)
      el.removeEventListener('webglcontextlost', verloren)
      gibFrei(scene)
      renderer.dispose()
      szene.current = null
    }
  }, [fehler, setzeKamera, zeichne])

  // Modell → Objekte (bei jeder Änderung der Daten neu; die Kamera bleibt, wie der Nutzer sie hat)
  useEffect(() => {
    const s = szene.current
    if (!s) return
    gibFrei(s.scene)
    s.scene.add(new AmbientLight(0xffffff, 1.5))
    const sonne = new DirectionalLight(0xffffff, 1.6)
    sonne.position.set(6, 12, 8)
    s.scene.add(sonne)
    const seite = Math.max(4, Math.ceil(modell.radius * 2.6))
    const raster = new GridHelper(seite, Math.min(seite, 40), new Color(FARBE_RASTER), new Color(FARBE_RASTER))
    s.scene.add(raster)
    for (const t of modell.teile) {
      const durchsichtig = t.farben.deckkraft < 1
      const stoff = (farbe: string) =>
        new MeshLambertMaterial({
          color: new Color(farbe),
          side: DoubleSide,
          transparent: durchsichtig,
          opacity: t.farben.deckkraft,
          depthWrite: !durchsichtig,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })
      for (const obj of [flaeche(t.wand, stoff(t.farben.wand)), flaeche(t.dach, stoff(t.farben.dach)), linien(t.kanten, FARBE_KANTE, durchsichtig ? 0.5 : 1)]) {
        if (obj) s.scene.add(obj)
      }
    }
    if (!kameraZustand.current) zuruecksetzen()
    zeichne()
  }, [modell, fehler, zeichne, zuruecksetzen])

  if (fehler) {
    return (
      <div className="ansicht3d-fehler" role="status" data-testid="ansicht3d-fehler">
        {fehler}
      </div>
    )
  }
  const dreiecke = modell.teile.reduce((n, t) => n + (t.wand.length + t.dach.length) / 9, 0)
  return (
    <div className="ansicht3d" ref={huelle}>
      <canvas
        ref={leinwand}
        className="ansicht3d-leinwand"
        tabIndex={0}
        role="img"
        aria-label="3D-Ansicht der Bauteile. Mit einem Finger oder der Maus drehen, mit zwei Fingern oder dem Mausrad zoomen, alternativ Pfeiltasten und Plus/Minus."
        data-testid="ansicht3d"
        data-dreiecke={dreiecke}
        data-azimut={anzeige ? anzeige.azimut.toFixed(3) : ''}
        data-abstand={anzeige ? anzeige.abstand.toFixed(2) : ''}
      />
      <div role="group" aria-label="3D-Ansicht bedienen" className="ansicht3d-werkzeuge">
        <button type="button" className="werkzeug" title="Hineinzoomen" aria-label="3D hineinzoomen" onClick={() => kameraZustand.current && setzeKamera(zoomeKamera(kameraZustand.current, ZOOM_SCHRITT, modell.radius))}>
          <ZoomIn {...ICON} />
        </button>
        <button type="button" className="werkzeug" title="Herauszoomen" aria-label="3D herauszoomen" onClick={() => kameraZustand.current && setzeKamera(zoomeKamera(kameraZustand.current, 1 / ZOOM_SCHRITT, modell.radius))}>
          <ZoomOut {...ICON} />
        </button>
        <button type="button" className="werkzeug" title="Von oben" aria-label="3D von oben" onClick={() => kameraZustand.current && setzeKamera({ ...kameraZustand.current, hoehenwinkel: Math.PI / 2 - 0.02 })}>
          <Maximize {...ICON} />
        </button>
        <button type="button" className="werkzeug" title="Ansicht zurücksetzen" aria-label="3D zurücksetzen" onClick={zuruecksetzen}>
          <RotateCcw {...ICON} />
        </button>
      </div>
    </div>
  )
}

export default Ansicht3D
