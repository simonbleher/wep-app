// Server-Modus (v2): Vor der App steht die Anmeldung mit Google oder Microsoft. Neue Konten warten auf die Freigabe
// durch einen Admin. Ohne Netz startet die App mit dem zuletzt bestätigten Konto (offline arbeiten bleibt Pflicht).
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LogIn, LogOut, RefreshCw } from 'lucide-react'
import { ICON, Meldung } from '@/app/ui'
import { RechtLinks } from '@/app/RechtLinks'
import { anmeldeUrl, gemerktesKonto, istNetzFehler, ladeEinrichtung, ladeIch, merkeKonto, serverAbmelden, type Einrichtung } from './api'
import type { ServerKonto } from './typen'

export interface V2Sitzung {
  konto: ServerKonto
  /** Start ohne Netz mit dem zuletzt bestätigten Konto. */
  offline: boolean
  abmelden: () => Promise<void>
  /** Nach einer Änderung am eigenen Konto (z. B. Mail-Benachrichtigung). */
  aktualisiere: (k: ServerKonto) => void
}

type Zustand =
  | { art: 'lade' }
  | { art: 'login'; fehler?: string }
  | { art: 'wartet' | 'gesperrt'; konto: ServerKonto }
  | { art: 'kein-netz' }
  | { art: 'bereit'; konto: ServerKonto; offline: boolean }

/**
 * Meldung, die der Server nach einer gescheiterten Anmeldung mitgibt (?anmeldefehler=…). Einmal beim Laden gelesen und
 * aus der Adresse entfernt; nach dem Rücksprung lädt die Seite ohnehin neu.
 */
const ANMELDEFEHLER = holeAnmeldeFehler()

function holeAnmeldeFehler(): string | undefined {
  const url = new URL(window.location.href)
  const fehler = url.searchParams.get('anmeldefehler')
  if (fehler === null) return undefined
  url.searchParams.delete('anmeldefehler')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  return fehler.slice(0, 300)
}

export function V2Tor({ children }: { children: (sitzung: V2Sitzung) => ReactNode }) {
  const [z, setZ] = useState<Zustand>({ art: 'lade' })

  const pruefe = useCallback(async () => {
    setZ({ art: 'lade' })
    try {
      const konto = await ladeIch()
      merkeKonto(konto)
      if (!konto) setZ({ art: 'login', fehler: ANMELDEFEHLER })
      else if (konto.status === 'freigegeben') setZ({ art: 'bereit', konto, offline: false })
      else setZ({ art: konto.status, konto })
    } catch (e) {
      const gemerkt = gemerktesKonto()
      if (istNetzFehler(e) && gemerkt?.status === 'freigegeben') setZ({ art: 'bereit', konto: gemerkt, offline: true })
      else setZ({ art: 'kein-netz' })
    }
  }, [])

  useEffect(() => {
    void pruefe()
  }, [pruefe])

  const abmelden = useCallback(async () => {
    try {
      await serverAbmelden()
    } catch {
      /* ohne Netz: lokal trotzdem abgemeldet; die Sitzung läuft auf dem Server ab */
    }
    merkeKonto(null)
    setZ({ art: 'login' })
  }, [])

  if (z.art === 'lade') return <div className="app" aria-busy="true" />
  if (z.art === 'bereit')
    return (
      <>
        {children({
          konto: z.konto,
          offline: z.offline,
          abmelden,
          aktualisiere: (konto) => {
            merkeKonto(konto)
            setZ({ art: 'bereit', konto, offline: false })
          },
        })}
      </>
    )
  if (z.art === 'login') return <V2Anmeldung fehler={z.fehler} />

  return (
    <div className="app">
      <main className="login">
        <div className="login-mitte">
          <h1 className="h1">{z.art === 'wartet' ? 'Wartet auf Freigabe' : z.art === 'gesperrt' ? 'Konto gesperrt' : 'Keine Verbindung'}</h1>
          {z.art === 'wartet' && (
            <p className="login-text">
              Dein Konto ({z.konto.email || z.konto.name}) ist angelegt. Sobald ein Admin es freigegeben und dir eine Rolle gegeben hat, kannst du
              loslegen.
            </p>
          )}
          {z.art === 'gesperrt' && <p className="login-text">Das Konto {z.konto.email || z.konto.name} ist gesperrt. Bitte beim Admin melden.</p>}
          {z.art === 'kein-netz' && <p className="login-text">Der Server ist nicht erreichbar. Für die erste Anmeldung auf diesem Gerät braucht es Netz.</p>}
          <div className="knopf-reihe">
            <button type="button" className="knopf knopf-primaer" onClick={() => void pruefe()}>
              <RefreshCw {...ICON} />
              Erneut prüfen
            </button>
            {z.art !== 'kein-netz' && (
              <button type="button" className="knopf" onClick={() => void abmelden()}>
                <LogOut {...ICON} />
                Abmelden
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function V2Anmeldung({ fehler }: { fehler?: string }) {
  const [einrichtung, setEinrichtung] = useState<Einrichtung>()
  useEffect(() => {
    ladeEinrichtung()
      .then(setEinrichtung)
      .catch(() => setEinrichtung({ google: true, microsoft: true }))
  }, [])
  const ziel = window.location.pathname + window.location.search
  const keiner = einrichtung && !einrichtung.google && !einrichtung.microsoft
  return (
    <div className="app">
      <main className="login">
        <div className="login-mitte">
          <h1 className="h1">WEP-App</h1>
          <p className="login-text">Wertermittlungsprotokolle direkt auf der Parzelle erfassen – auch ohne Netz. Melde dich mit deinem Google- oder Microsoft-Konto an.</p>
          {einrichtung?.google && (
            <a className="knopf knopf-primaer knopf-breit" href={anmeldeUrl('google', ziel)}>
              <LogIn {...ICON} />
              Mit Google anmelden
            </a>
          )}
          {einrichtung?.microsoft && (
            <a className="knopf knopf-primaer knopf-breit" href={anmeldeUrl('microsoft', ziel)}>
              <LogIn {...ICON} />
              Mit Microsoft anmelden
            </a>
          )}
          {keiner && (
            <Meldung alarm>
              <p>Die Anmeldung ist auf dem Server noch nicht eingerichtet (docs/V2-EINRICHTUNG.md).</p>
            </Meldung>
          )}
          {fehler && (
            <Meldung alarm>
              <p>{fehler}</p>
            </Meldung>
          )}
          <p className="neben">Beim ersten Mal wird dein Konto angelegt und wartet auf die Freigabe durch einen Admin.</p>
          <RechtLinks />
        </div>
      </main>
    </div>
  )
}
