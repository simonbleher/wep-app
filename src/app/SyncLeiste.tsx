// Statuszeile auf der Startseite: Konto-Status und Abgleich mit OneDrive.
// Gleicht automatisch ab, wenn die Seite geöffnet wird und wenn das Gerät
// wieder online geht.
import { useCallback, useEffect, useState } from 'react'
import type { Konto } from '@/konto'
import { jetztSynchronisieren, wartendeAenderungen, type SyncHinweis } from '@/sync'

interface Props {
  /** Angemeldetes Konto; null = „ohne Konto“ (nur auf diesem Gerät). */
  konto: Konto | null
  /** Ist die Anmeldung auf dieser Plattform überhaupt eingerichtet? */
  verfuegbar: boolean
  /** Wird nach einem Abgleich aufgerufen, der lokale Daten geändert hat. */
  onGeaendert: () => void
}

export function SyncLeiste({ konto, verfuegbar, onGeaendert }: Props) {
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState('')
  const [hinweise, setHinweise] = useState<SyncHinweis[]>([])
  const [wartend, setWartend] = useState(0)
  const angemeldet = konto !== null

  const abgleichen = useCallback(async () => {
    setLaeuft(true)
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
      setLaeuft(false)
    }
  }, [onGeaendert])

  useEffect(() => {
    if (!angemeldet) return
    let aktiv = true
    void wartendeAenderungen().then((n) => aktiv && setWartend(n))
    if (navigator.onLine) void abgleichen()
    const online = () => void abgleichen()
    window.addEventListener('online', online)
    return () => {
      aktiv = false
      window.removeEventListener('online', online)
    }
  }, [angemeldet, abgleichen])

  if (!verfuegbar) return null

  if (!angemeldet) {
    return (
      <p className="status-zeile" aria-live="polite">
        Nur auf diesem Gerät gespeichert
      </p>
    )
  }

  return (
    <section aria-live="polite">
      <div className="status-zeile">
        <span>
          {konto.benutzername || konto.name} ·{' '}
          {laeuft ? 'Gleiche ab …' : meldung || 'Verbunden'}
          {wartend > 0 && !laeuft ? ` · ${wartend} warten auf Upload` : ''}
        </span>
        <button type="button" className="text-knopf" disabled={laeuft} onClick={() => void abgleichen()}>
          Abgleichen
        </button>
      </div>
      {hinweise.map((h) => (
        <p key={h.wepId + h.text} className="hinweis hinweis-warnung">
          {h.text}
        </p>
      ))}
    </section>
  )
}
