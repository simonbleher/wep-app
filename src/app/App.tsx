// App-Shell: einfacher Zustands-basierter Wechsel zwischen Login, Startseite,
// WEP-Detailansicht und Profil. Ein Router ist noch nicht nötig.
import { useCallback, useEffect, useState } from 'react'
import {
  abmelden,
  anmelden,
  kontoVerfuegbar,
  speichereStartWahl,
  startZustand,
  type Konto,
} from '@/konto'
import { setzeAbgleichZurueck } from '@/sync'
import { LoginBildschirm } from './LoginBildschirm'
import { Profil } from './Profil'
import { Startseite } from './Startseite'
import { WepDetail } from './WepDetail'

type Ansicht = { typ: 'start' } | { typ: 'detail'; wepId: string } | { typ: 'profil' }

/** lade = Start wird gerade geklärt, login = Login-Bildschirm, bereit = App läuft. */
type Phase = 'lade' | 'login' | 'bereit'

export default function App() {
  const [ansicht, setAnsicht] = useState<Ansicht>({ typ: 'start' })
  const [phase, setPhase] = useState<Phase>('lade')
  const [konto, setKonto] = useState<Konto | null>(null)
  const [fehler, setFehler] = useState('')

  useEffect(() => {
    let aktiv = true
    void startZustand().then((s) => {
      if (!aktiv) return
      setKonto(s.typ === 'start' ? s.konto : null)
      setPhase(s.typ === 'login' ? 'login' : 'bereit')
    })
    return () => {
      aktiv = false
    }
  }, [])

  const melden = useCallback(async () => {
    setFehler('')
    speichereStartWahl('konto')
    try {
      await anmelden() // im Web: Weiterleitung zu Microsoft
    } catch (e) {
      speichereStartWahl(null)
      setFehler(e instanceof Error ? e.message : String(e))
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
          konto={konto}
          verfuegbar={kontoVerfuegbar()}
          onOeffnen={(wepId) => setAnsicht({ typ: 'detail', wepId })}
          onProfil={() => setAnsicht({ typ: 'profil' })}
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
        <WepDetail wepId={ansicht.wepId} onZurueck={() => setAnsicht({ typ: 'start' })} />
      )}
    </div>
  )
}
