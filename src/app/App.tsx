// App-Shell: einfacher Zustands-basierter Wechsel zwischen Login, Startseite,
// WEP-Detailansicht und Profil. Ein Router ist noch nicht nötig.
import { useCallback, useEffect, useState } from 'react'
import {
  abmelden,
  anmeldeFehlerText,
  anmelden,
  kontoVerfuegbar,
  speichereStartWahl,
  startZustand,
  type Konto,
} from '@/konto'
import { ladeUpdateDienst } from './updateModul'
import { setzeAbgleichZurueck } from '@/sync'
import { LoginBildschirm } from './LoginBildschirm'
import { Papierkorb } from './Papierkorb'
import { Profil } from './Profil'
import { Startseite } from './Startseite'
import { WepDetail } from './WepDetail'
import { TeilenOeffnen } from './TeilenOeffnen'
import { beobachteEingang, holeEingang } from '@/teilen/eingang'

type Ansicht = { typ: 'start' } | { typ: 'detail'; wepId: string } | { typ: 'profil' } | { typ: 'papierkorb' }

/** lade = Start wird gerade geklärt, login = Login-Bildschirm, bereit = App läuft. */
type Phase = 'lade' | 'login' | 'bereit'

export default function App() {
  const [ansicht, setAnsicht] = useState<Ansicht>({ typ: 'start' })
  const [phase, setPhase] = useState<Phase>('lade')
  const [konto, setKonto] = useState<Konto | null>(null)
  const [fehler, setFehler] = useState('')
  // Eine .wep-Datei wartet auf die Vorschau (gewählt, per „Öffnen mit WEP“ oder Doppelklick gekommen)
  const [wepDatei, setWepDatei] = useState<Blob>()
  // Zählt hoch, wenn eine WEP-Datei etwas eingespielt hat: ein offenes WEP wird dann neu geladen
  const [eingespielt, setEingespielt] = useState(0)

  // Android/Windows: Die Oberfläche steht → Start gilt als gelungen (sonst Rückfall des Live-Updates)
  useEffect(() => {
    void ladeUpdateDienst().then((m) => m?.meldeStartErfolg())
  }, [])

  useEffect(() => {
    let aktiv = true
    void startZustand().then((s) => {
      if (!aktiv) return
      setKonto(s.typ === 'start' ? s.konto : null)
      if (s.typ === 'login' && s.fehler) setFehler(s.fehler)
      setPhase(s.typ === 'login' ? 'login' : 'bereit')
    })
    return () => {
      aktiv = false
    }
  }, [])

  // „Öffnen mit WEP“ (Android) und Doppelklick (Windows): beim Start wartende Datei und spätere Dateien
  useEffect(() => {
    if (phase !== 'bereit') return
    let aktiv = true
    let abmelden: (() => void) | undefined
    void holeEingang().then((e) => aktiv && e && setWepDatei(e.blob))
    void beobachteEingang((e) => aktiv && setWepDatei(e.blob)).then((a) => (aktiv ? (abmelden = a) : a()))
    return () => {
      aktiv = false
      abmelden?.()
    }
  }, [phase])

  const melden = useCallback(async () => {
    setFehler('')
    speichereStartWahl('konto')
    try {
      await anmelden() // im Web: Weiterleitung zu Microsoft (kehrt nicht zurück)
      // Android: Rücksprung aus dem System-Browser ist verarbeitet → App starten
      const s = await startZustand()
      if (s.typ === 'start') {
        setKonto(s.konto)
        setPhase('bereit')
      }
    } catch (e) {
      speichereStartWahl(null)
      setFehler(anmeldeFehlerText(e))
    }
  }, [])

  const ohneKonto = useCallback(() => {
    speichereStartWahl('ohne-konto')
    setKonto(null)
    setAnsicht({ typ: 'start' })
    setPhase('bereit')
  }, [])

  const abmelden_ = useCallback(async () => {
    speichereStartWahl(null)
    await setzeAbgleichZurueck()
    try {
      await abmelden() // im Web: Weiterleitung zu Microsoft
    } catch {
      /* lokal ist die Abmeldung trotzdem erledigt */
    } finally {
      setKonto(null)
      setAnsicht({ typ: 'start' })
      setPhase('login')
    }
  }, [])

  if (phase === 'lade') return <div className="app" aria-busy="true" />
  if (phase === 'login') {
    return (
      <div className="app">
        <LoginBildschirm onAnmelden={() => void melden()} onOhneKonto={ohneKonto} fehler={fehler} />
      </div>
    )
  }

  return (
    <div className="app">
      {ansicht.typ === 'start' ? (
        <Startseite
          key={`start-${eingespielt}`}
          konto={konto}
          verfuegbar={kontoVerfuegbar()}
          onOeffnen={(wepId) => setAnsicht({ typ: 'detail', wepId })}
          onProfil={() => setAnsicht({ typ: 'profil' })}
          onPapierkorb={() => setAnsicht({ typ: 'papierkorb' })}
          onWepDatei={setWepDatei}
        />
      ) : ansicht.typ === 'papierkorb' ? (
        <Papierkorb
          konto={konto}
          verfuegbar={kontoVerfuegbar()}
          onZurueck={() => setAnsicht({ typ: 'start' })}
          onProfil={() => setAnsicht({ typ: 'profil' })}
          onOeffnen={(wepId) => setAnsicht({ typ: 'detail', wepId })}
        />
      ) : ansicht.typ === 'profil' ? (
        <Profil
          konto={konto}
          verfuegbar={kontoVerfuegbar()}
          onZurueck={() => setAnsicht({ typ: 'start' })}
          onAnmelden={() => void melden()}
          onAbmelden={() => void abmelden_()}
        />
      ) : (
        <WepDetail
          key={`${ansicht.wepId}-${eingespielt}`}
          wepId={ansicht.wepId}
          onZurueck={() => setAnsicht({ typ: 'start' })}
          onOeffnen={(wepId) => setAnsicht({ typ: 'detail', wepId })}
        />
      )}
      {wepDatei && (
        <TeilenOeffnen
          datei={wepDatei}
          onSchliessen={() => setWepDatei(undefined)}
          onEingespielt={() => setEingespielt((z) => z + 1)}
          onWepOeffnen={(wepId) => {
            setWepDatei(undefined)
            setAnsicht({ typ: 'detail', wepId })
          }}
        />
      )}
    </div>
  )
}
