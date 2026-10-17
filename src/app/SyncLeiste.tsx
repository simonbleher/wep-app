// OneDrive-Leiste auf der Startseite: verbinden, Status, manuell abgleichen.
// Gleicht automatisch ab, wenn die Seite geöffnet wird und wenn das Gerät
// wieder online geht.
import { useCallback, useEffect, useState } from 'react'
import {
  aktuellesKonto,
  anmelden,
  jetztSynchronisieren,
  syncKonfiguriert,
  wartendeAenderungen,
  type SyncHinweis,
} from '@/sync'

interface Props {
  /** Wird nach einem Abgleich aufgerufen, der lokale Daten geändert hat. */
  onGeaendert: () => void
}

type Zustand =
  | { typ: 'aus' }
  | { typ: 'getrennt' }
  | { typ: 'bereit'; konto: string }
  | { typ: 'laeuft'; konto: string }

export function SyncLeiste({ onGeaendert }: Props) {
  const [zustand, setZustand] = useState<Zustand>({ typ: 'aus' })
  const [meldung, setMeldung] = useState<string>('')
  const [hinweise, setHinweise] = useState<SyncHinweis[]>([])
  const [wartend, setWartend] = useState(0)

  const abgleichen = useCallback(
    async (konto: string) => {
      setZustand({ typ: 'laeuft', konto })
      try {
        const e = await jetztSynchronisieren()
        if (e.heruntergeladen.length) onGeaendert()
        setHinweise([...e.konflikte, ...e.fehler])
        const zeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        setMeldung(
          `Abgeglichen um ${zeit}` +
            (e.hochgeladen.length ? ` · ${e.hochgeladen.length} hochgeladen` : '') +
            (e.heruntergeladen.length ? ` · ${e.heruntergeladen.length} geladen` : ''),
        )
      } catch (err) {
        setMeldung(err instanceof Error ? err.message : String(err))
      } finally {
        setWartend(await wartendeAenderungen())
        setZustand({ typ: 'bereit', konto })
      }
    },
    [onGeaendert],
  )

  useEffect(() => {
    if (!syncKonfiguriert()) return
    let aktiv = true
    void (async () => {
      try {
        const konto = await aktuellesKonto()
        if (!aktiv) return
        setWartend(await wartendeAenderungen())
        if (!konto) {
          setZustand({ typ: 'getrennt' })
          return
        }
        const name = konto.username || konto.name || 'OneDrive'
        setZustand({ typ: 'bereit', konto: name })
        if (navigator.onLine) void abgleichen(name)
      } catch (err) {
        setMeldung(err instanceof Error ? err.message : String(err))
        setZustand({ typ: 'getrennt' })
      }
    })()
    return () => {
      aktiv = false
    }
  }, [abgleichen])

  useEffect(() => {
    if (zustand.typ !== 'bereit') return
    const konto = zustand.konto
    const online = () => void abgleichen(konto)
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [zustand, abgleichen])

  if (zustand.typ === 'aus') return null

  return (
    <section className="sync" aria-live="polite">
      {zustand.typ === 'getrennt' ? (
        <button type="button" className="btn btn-gross" onClick={() => void anmelden()}>
          ☁️ Mit OneDrive verbinden
        </button>
      ) : (
        <div className="sync-zeile">
          <span className="sync-text">
            ☁️ {zustand.konto}
            <br />
            <small>
              {zustand.typ === 'laeuft' ? 'Gleiche ab …' : meldung || 'Verbunden'}
              {wartend > 0 && zustand.typ !== 'laeuft' ? ` · ${wartend} warten auf Upload` : ''}
            </small>
          </span>
          <button
            type="button"
            className="btn"
            disabled={zustand.typ === 'laeuft'}
            onClick={() => void abgleichen(zustand.konto)}
          >
            🔄 Abgleichen
          </button>
        </div>
      )}
      {zustand.typ === 'getrennt' && meldung && <p className="hinweis">{meldung}</p>}
      {hinweise.map((h) => (
        <p key={h.wepId + h.text} className="hinweis hinweis-warnung">
          ⚠️ {h.text}
        </p>
      ))}
    </section>
  )
}
