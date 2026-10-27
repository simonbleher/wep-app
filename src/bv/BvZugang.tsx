// Zugangsprüfung vor der BV-Kontrollseite (Ziel 4). Ist die Kontrolle nicht eingeschaltet, zeigt sie die Seite direkt.
// Sonst: Microsoft-Anmeldung → Freigabe durch einen Admin („Zugang beantragt – wartet auf Freigabe“) → Seite.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LogIn, LogOut, RefreshCw } from 'lucide-react'
import { ICON, Meldung } from '@/app/ui'
import { abmelden, anmelden, holeRueckkehrFehler, idToken, istAngemeldet, stillAnmelden } from './anmeldung'
import { entscheide, frageZugang, ladeKonfig, leseGemerkt, merke, naechsterGemerkt, type Entscheidung } from './zugang'

export interface Zugang {
  admin: boolean
  email: string
  offline?: boolean
  abmelden: () => void
}

export function BvZugang({ children }: { children: (zugang: Zugang | undefined) => ReactNode }) {
  const [e, setE] = useState<Entscheidung>()
  const [rueckkehr, setRueckkehr] = useState<string>()

  const pruefe = useCallback(async () => {
    setE(undefined)
    const jetzt = Date.now()
    const gemerkt = leseGemerkt()
    const konfig = await ladeKonfig()
    let entscheidung: Entscheidung
    if (konfig === 'offline' || !konfig?.aktiv) {
      entscheidung = entscheide({ konfig, angemeldet: false, gemerkt, jetzt })
    } else {
      let angemeldet = await istAngemeldet().catch(() => false)
      const fehler = holeRueckkehrFehler()
      if (fehler) setRueckkehr(fehler)
      if (!angemeldet && !fehler) angemeldet = await stillAnmelden(gemerkt?.email)
      const token = angemeldet ? await idToken().catch(() => undefined) : undefined
      const antwort = token ? await frageZugang(token) : undefined
      entscheidung = entscheide({ konfig, angemeldet: Boolean(token), antwort, gemerkt, jetzt })
    }
    merke(naechsterGemerkt(entscheidung, gemerkt, jetzt))
    setE(entscheidung)
  }, [])

  useEffect(() => {
    void pruefe()
  }, [pruefe])

  const raus = () => {
    merke(undefined)
    void abmelden()
  }

  if (!e) return <Karte titel="Kontrollseite BV">Prüfe den Zugang …</Karte>
  if (e.art === 'offen') return <>{children(undefined)}</>
  if (e.art === 'freigegeben') return <>{children({ admin: e.admin, email: e.email, offline: e.offline, abmelden: raus })}</>

  if (e.art === 'anmelden')
    return (
      <Karte titel="Kontrollseite BV">
        <p>Die Kontrollseite ist nur für freigegebene Mitarbeitende. Bitte mit dem Microsoft-Konto anmelden – beim ersten Mal wird der Zugang beantragt.</p>
        {rueckkehr && (
          <Meldung alarm>
            <p>{rueckkehr}</p>
          </Meldung>
        )}
        <button type="button" className="knopf knopf-primaer" onClick={() => void anmelden()}>
          <LogIn {...ICON} />
          Mit Microsoft anmelden
        </button>
      </Karte>
    )

  const wer = 'email' in e && e.email ? ` (${e.email})` : ''
  return (
    <Karte titel={e.art === 'beantragt' ? 'Zugang beantragt – wartet auf Freigabe' : e.art === 'gesperrt' ? 'Zugang gesperrt' : 'Kontrollseite BV'}>
      {e.art === 'beantragt' && <p>Dein Zugang{wer} ist beantragt. Sobald ein Admin ihn freigegeben hat, öffnet sich hier die Kontrollseite.</p>}
      {e.art === 'gesperrt' && <p>Der Zugang{wer} ist gesperrt. Bitte beim Admin melden.</p>}
      {e.art === 'fehler' && (
        <Meldung alarm>
          <p>{e.meldung}</p>
        </Meldung>
      )}
      <div className="knopf-reihe">
        <button type="button" className="knopf knopf-primaer" onClick={() => void pruefe()}>
          <RefreshCw {...ICON} />
          Erneut prüfen
        </button>
        {e.art === 'fehler' ? (
          <button type="button" className="knopf" onClick={() => void anmelden()}>
            <LogIn {...ICON} />
            Neu anmelden
          </button>
        ) : (
          <button type="button" className="knopf" onClick={raus}>
            <LogOut {...ICON} />
            Abmelden
          </button>
        )}
      </div>
    </Karte>
  )
}

function Karte({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="bv">
      <main className="bv-inhalt bv-zugang">
        <h1 className="h1">{titel}</h1>
        {children}
      </main>
    </div>
  )
}
