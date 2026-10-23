// Profil → „Meine Unterschrift“: mit Finger, Stift oder Maus zeichnen oder ein Foto hochladen
// (zuschneiden, Papier freistellen). Gespeichert wird ein transparentes PNG im Profil; es wird mit
// OneDrive abgeglichen wie das übrige Profil (src/sync/profil.ts). Wird im PDF (Paket 4) eingesetzt.
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Eraser, ImagePlus, PenLine, Undo2 } from 'lucide-react'
import {
  STANDARD_FREISTELLEN,
  schneideRand,
  stelleFrei,
  type Bild,
  type FreistellOptionen,
  type Rand,
} from '@/unterschrift/bild'
import { bildZuUnterschriftUrl, leseBild, browserLeinwand, stricheZuUnterschriftUrl, type LeinwandLike } from '@/unterschrift/png'
import {
  glaetteEingabe,
  hatInhalt,
  malStriche,
  STIFT_FARBE,
  type Punkt,
  type Strich,
} from '@/unterschrift/striche'
import { ladeUnterschriftUrl, loescheUnterschrift, speichereUnterschrift } from '@/unterschrift'
import { ICON, Meldung, Rueckfrage } from './ui'

type Modus = 'ansicht' | 'zeichnen' | 'bild'

/** Längste Seite des Fotos beim Bearbeiten (Handy-Fotos sind viel größer, das wäre unnötig langsam). */
const ARBEITS_SEITE = 1200

export function Unterschrift({ konto }: { konto: boolean }) {
  const id = useId()
  const [gespeichert, setGespeichert] = useState<string | undefined>(() => ladeUnterschriftUrl())
  const [modus, setModus] = useState<Modus>('ansicht')
  const [loeschen, setLoeschen] = useState(false)
  const [meldung, setMeldungText] = useState('')
  const [fehler, setFehler] = useState(false)
  const setMeldung = (text: string, istFehler = false) => {
    setMeldungText(text)
    setFehler(istFehler)
  }
  const dateiEingabe = useRef<HTMLInputElement>(null)
  const [foto, setFoto] = useState<Bild | undefined>()

  const gespeichertNun = (url: string) => {
    try {
      speichereUnterschrift(url)
      setGespeichert(url)
      setModus('ansicht')
      setFoto(undefined)
      setMeldung('Unterschrift gespeichert.')
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : 'Die Unterschrift konnte nicht gespeichert werden.', true)
    }
  }

  async function fotoWaehlen(datei: File | undefined) {
    if (!datei) return
    setMeldung('')
    try {
      setFoto(await ladeFoto(datei))
      setModus('bild')
    } catch {
      setMeldung('Das Bild ließ sich nicht öffnen. Bitte ein Foto (JPG, PNG) wählen.', true)
    }
  }

  return (
    <section className="abschnitt" aria-labelledby={`${id}-u`}>
      <h2 className="gruppenkopf" id={`${id}-u`}>
        Meine Unterschrift
      </h2>

      {modus === 'ansicht' && (
        <>
          {gespeichert ? (
            <div className="unterschrift-vorschau" data-testid="unterschrift-vorschau">
              <img src={gespeichert} alt="Meine gespeicherte Unterschrift" />
            </div>
          ) : (
            <p className="neben">Keine Unterschrift hinterlegt.</p>
          )}
          <div className="knopf-reihe">
            <button type="button" className="knopf" onClick={() => { setMeldung(''); setModus('zeichnen') }}>
              <PenLine {...ICON} />
              {gespeichert ? 'Neu zeichnen' : 'Zeichnen'}
            </button>
            <button type="button" className="knopf" onClick={() => dateiEingabe.current?.click()}>
              <ImagePlus {...ICON} />
              {gespeichert ? 'Anderes Bild' : 'Bild hochladen'}
            </button>
            {gespeichert && (
              <button type="button" className="knopf knopf-loeschen" onClick={() => setLoeschen(true)}>
                Löschen
              </button>
            )}
          </div>
          <input
            ref={dateiEingabe}
            type="file"
            accept="image/*"
            hidden
            aria-label="Foto der Unterschrift wählen"
            data-testid="unterschrift-datei"
            onChange={(e) => {
              void fotoWaehlen(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <p className="neben">
            {konto
              ? 'Die Unterschrift wird mit deinen anderen Geräten abgeglichen. '
              : 'Ohne Konto bleibt die Unterschrift auf diesem Gerät. '}
            Sie kommt nur ins PDF, wenn du es beim Erzeugen bestätigst.
          </p>
        </>
      )}

      {modus === 'zeichnen' && (
        <Zeichnen
          id={id}
          onUebernehmen={(striche) => gespeichertNun(stricheZuUnterschriftUrl(striche))}
          onAbbrechen={() => setModus('ansicht')}
        />
      )}

      {modus === 'bild' && foto && (
        <FotoAufbereiten
          id={id}
          foto={foto}
          onUebernehmen={gespeichertNun}
          onAbbrechen={() => { setModus('ansicht'); setFoto(undefined) }}
        />
      )}

      {meldung &&
        (fehler ? (
          <Meldung alarm>{meldung}</Meldung>
        ) : (
          <p className="neben" role="status">
            {meldung}
          </p>
        ))}

      {loeschen && (
        <Rueckfrage
          titel="Unterschrift löschen?"
          text="Die Unterschrift wird auf diesem Gerät und – beim nächsten Abgleich – auch auf deinen anderen Geräten entfernt."
          onAbbrechen={() => setLoeschen(false)}
          onBestaetigen={() => {
            loescheUnterschrift()
            setGespeichert(undefined)
            setLoeschen(false)
            setMeldung('Unterschrift gelöscht.')
          }}
        />
      )}
    </section>
  )
}

/** Datei → Bild in Arbeitsgröße (EXIF-Drehung des Handys wird beachtet). */
async function ladeFoto(datei: File): Promise<Bild> {
  const quelle = await createImageBitmap(datei, { imageOrientation: 'from-image' })
  const faktor = Math.min(1, ARBEITS_SEITE / Math.max(quelle.width, quelle.height))
  const c = browserLeinwand(Math.max(1, Math.round(quelle.width * faktor)), Math.max(1, Math.round(quelle.height * faktor))) as unknown as HTMLCanvasElement
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Keine Zeichenfläche')
  ctx.fillStyle = '#fff' // PNG mit Durchsichtigkeit als Foto: auf Weiß legen
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(quelle, 0, 0, c.width, c.height)
  quelle.close()
  return leseBild(c as unknown as LeinwandLike)
}

// --- Zeichnen ---------------------------------------------------------------

function Zeichnen({
  id,
  onUebernehmen,
  onAbbrechen,
}: {
  id: string
  onUebernehmen: (striche: Strich[]) => void
  onAbbrechen: () => void
}) {
  const leinwand = useRef<HTMLCanvasElement>(null)
  const [striche, setStriche] = useState<Strich[]>([])
  const aktuell = useRef<Strich | null>(null)
  const zeiger = useRef<number | null>(null)
  const strichRef = useRef<Strich[]>(striche)
  strichRef.current = striche

  const zeichneNeu = useCallback((alle: Strich[]) => {
    const c = leinwand.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    malStriche(ctx, alle, c.width, STIFT_FARBE)
  }, [])

  // Zeichenfläche an die Anzeigegröße anpassen (scharf auf Retina), Striche sind auf die Breite normiert
  useEffect(() => {
    const c = leinwand.current
    if (!c) return
    const anpassen = () => {
      const dpr = window.devicePixelRatio || 1
      const b = Math.max(1, Math.round(c.clientWidth * dpr))
      if (c.width !== b) {
        c.width = b
        c.height = Math.round(b / 3)
        zeichneNeu(aktuell.current ? [...strichRef.current, aktuell.current] : strichRef.current)
      }
    }
    anpassen()
    const beob = new ResizeObserver(anpassen)
    beob.observe(c)
    return () => beob.disconnect()
  }, [zeichneNeu])

  useEffect(() => zeichneNeu(striche), [striche, zeichneNeu])

  const punktAus = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }): Punkt => {
    const r = (leinwand.current as HTMLCanvasElement).getBoundingClientRect()
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.width,
      druck: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : undefined,
    }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (zeiger.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    zeiger.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    aktuell.current = [punktAus(e)]
    zeichneNeu([...striche, aktuell.current])
  }
  function bewegt(e: React.PointerEvent<HTMLCanvasElement>) {
    if (zeiger.current !== e.pointerId || !aktuell.current) return
    e.preventDefault()
    const ereignisse = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of ereignisse.length ? ereignisse : [e.nativeEvent]) {
      aktuell.current.push(glaetteEingabe(aktuell.current[aktuell.current.length - 1], punktAus(ev)))
    }
    zeichneNeu([...striche, aktuell.current])
  }
  function ende(e: React.PointerEvent<HTMLCanvasElement>) {
    if (zeiger.current !== e.pointerId) return
    zeiger.current = null
    const s = aktuell.current
    aktuell.current = null
    if (s) setStriche((alt) => [...alt, s])
  }

  return (
    <div className="unterschrift-bearbeiten">
      <p className="neben" id={`${id}-zeichnen-hinweis`}>
        Unterschreibe mit dem Finger, dem Stift oder der Maus im Feld.
      </p>
      <div className="unterschrift-feld">
        <canvas
          ref={leinwand}
          className="unterschrift-leinwand"
          role="img"
          aria-label="Zeichenfläche für die Unterschrift"
          aria-describedby={`${id}-zeichnen-hinweis`}
          data-testid="unterschrift-leinwand"
          onPointerDown={start}
          onPointerMove={bewegt}
          onPointerUp={ende}
          onPointerCancel={ende}
        />
        <span className="unterschrift-linie" aria-hidden="true" />
      </div>
      <div className="knopf-reihe">
        <button type="button" className="knopf" disabled={striche.length === 0} onClick={() => setStriche((s) => s.slice(0, -1))}>
          <Undo2 {...ICON} />
          Rückgängig
        </button>
        <button type="button" className="knopf" disabled={striche.length === 0} onClick={() => setStriche([])}>
          <Eraser {...ICON} />
          Alles löschen
        </button>
      </div>
      <div className="knopf-reihe">
        <button type="button" className="knopf knopf-primaer" disabled={!hatInhalt(striche)} onClick={() => onUebernehmen(striche)}>
          Übernehmen
        </button>
        <button type="button" className="knopf" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

// --- Foto aufbereiten --------------------------------------------------------

const KEIN_RAND: Rand = { links: 0, rechts: 0, oben: 0, unten: 0 }
const RAENDER: { schluessel: keyof Rand; text: string }[] = [
  { schluessel: 'links', text: 'Links abschneiden' },
  { schluessel: 'rechts', text: 'Rechts abschneiden' },
  { schluessel: 'oben', text: 'Oben abschneiden' },
  { schluessel: 'unten', text: 'Unten abschneiden' },
]

function FotoAufbereiten({
  id,
  foto,
  onUebernehmen,
  onAbbrechen,
}: {
  id: string
  foto: Bild
  onUebernehmen: (url: string) => void
  onAbbrechen: () => void
}) {
  const [rand, setRand] = useState<Rand>(KEIN_RAND)
  const [opt, setOpt] = useState<FreistellOptionen>(STANDARD_FREISTELLEN)
  const verzoegert = useDeferredValue({ rand, opt })

  const quellBild = useMemo(() => {
    const c = browserLeinwand(foto.breite, foto.hoehe)
    const ctx = c.getContext('2d')
    ctx?.putImageData(new ImageData(foto.daten as Uint8ClampedArray<ArrayBuffer>, foto.breite, foto.hoehe) as never, 0, 0)
    return c.toDataURL('image/jpeg')
  }, [foto])

  const ergebnis = useMemo(() => {
    const frei = stelleFrei(schneideRand(foto, verzoegert.rand), verzoegert.opt)
    try {
      return bildZuUnterschriftUrl(frei)
    } catch {
      return undefined
    }
  }, [foto, verzoegert])

  const randText = (k: keyof Rand) => `${Math.round(rand[k] * 100)} %`

  return (
    <div className="unterschrift-bearbeiten">
      <p className="neben">
        Schneide das Foto so zu, dass nur die Unterschrift bleibt. Das Papier wird danach durchsichtig gemacht.
      </p>
      <div className="unterschrift-quelle" data-testid="unterschrift-quelle">
        <img src={quellBild} alt="Dein Foto mit Zuschnitt" />
        <span className="schnitt schnitt-links" style={{ width: `${rand.links * 100}%` }} aria-hidden="true" />
        <span className="schnitt schnitt-rechts" style={{ width: `${rand.rechts * 100}%` }} aria-hidden="true" />
        <span className="schnitt schnitt-oben" style={{ height: `${rand.oben * 100}%` }} aria-hidden="true" />
        <span className="schnitt schnitt-unten" style={{ height: `${rand.unten * 100}%` }} aria-hidden="true" />
      </div>
      {RAENDER.map((r) => (
        <div className="feld" key={r.schluessel}>
          <label className="label" htmlFor={`${id}-r-${r.schluessel}`}>
            {r.text}: {randText(r.schluessel)}
          </label>
          <input
            id={`${id}-r-${r.schluessel}`}
            type="range"
            min={0}
            max={45}
            step={1}
            value={Math.round(rand[r.schluessel] * 100)}
            onChange={(e) => setRand({ ...rand, [r.schluessel]: Number(e.target.value) / 100 })}
          />
        </div>
      ))}
      <div className="feld">
        <label className="label" htmlFor={`${id}-empf`}>
          Hintergrund entfernen: Stärke {opt.empfindlichkeit} %
        </label>
        <input
          id={`${id}-empf`}
          type="range"
          min={0}
          max={100}
          step={1}
          value={opt.empfindlichkeit}
          onChange={(e) => setOpt({ ...opt, empfindlichkeit: Number(e.target.value) })}
        />
        <p className="neben">Höher: auch blasse Striche bleiben. Niedriger: weniger Papierrauschen.</p>
      </div>
      <div>
        <label className="schalter-zeile" htmlFor={`${id}-schwarz`}>
          <span>Einheitlich dunkel färben</span>
          <input
            id={`${id}-schwarz`}
            type="checkbox"
            role="switch"
            className="schalter"
            checked={opt.farbe === 'schwarz'}
            onChange={(e) => setOpt({ ...opt, farbe: e.target.checked ? 'schwarz' : 'original' })}
          />
        </label>
      </div>
      <p className="label">Vorschau (kariert = durchsichtig)</p>
      <div className="unterschrift-vorschau unterschrift-vorschau-karo" data-testid="unterschrift-ergebnis">
        {ergebnis ? <img src={ergebnis} alt="Vorschau der freigestellten Unterschrift" /> : <span className="neben">Keine Schrift erkannt – Stärke erhöhen oder anders zuschneiden.</span>}
      </div>
      <div className="knopf-reihe">
        <button type="button" className="knopf knopf-primaer" disabled={!ergebnis} onClick={() => ergebnis && onUebernehmen(ergebnis)}>
          Übernehmen
        </button>
        <button type="button" className="knopf" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
