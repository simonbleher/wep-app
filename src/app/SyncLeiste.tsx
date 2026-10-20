// Statuszeile Abgleich (Startseite): Konto-Status und Abgleich mit OneDrive.
// Gleicht automatisch ab, wenn die Startseite geöffnet wird und wenn das Gerät
// wieder online geht. Der Zustand liegt im Hook useAbgleich, damit die Startseite
// die Zeile auf dem Handy oben und auf dem Tablet in der Seitenleiste zeigen kann,
// ohne doppelt abzugleichen.
import { useCallback, useEffect, useState } from 'react'
import type { Konto } from '@/konto'
import { jetztSynchronisieren, wartendeAenderungen, type SyncHinweis } from '@/sync'

export interface Abgleich {
  laeuft: boolean
  meldung: string
  hinweise: SyncHinweis[]
  wartend: number
  abgleichen: () => Promise<void>
}

/**
 * @param konto       angemeldetes Konto; null = „ohne Konto“ (kein Abgleich)
 * @param onGeaendert wird nach einem Abgleich aufgerufen, der lokale Daten geändert hat
 */
export function useAbgleich(konto: Konto | null, onGeaendert: () => void): Abgleich {
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

  return { laeuft, meldung, hinweise, wartend, abgleichen }
}

interface Props {
  konto: Konto | null
  /** Ist die Anmeldung auf dieser Plattform überhaupt eingerichtet? */
  verfuegbar: boolean
  abgleich: Abgleich
}

export function StatusZeile({ konto, verfuegbar, abgleich }: Props) {
  if (!verfuegbar) return null

  if (!konto) {
    return (
      <div className="status" aria-live="polite">
        <span className="status-text">Nur auf diesem Gerät gespeichert</span>
      </div>
    )
  }

  const { laeuft, meldung, wartend } = abgleich
  return (
    <div className="status" aria-live="polite">
      <span className="status-text">
        <span>{konto.benutzername || konto.name}</span>
        <span>{laeuft ? 'Gleiche ab …' : meldung || 'Verbunden'}</span>
        {wartend > 0 && !laeuft && (
          <span>{wartend === 1 ? '1 Änderung wartet auf Upload' : `${wartend} Änderungen warten auf Upload`}</span>
        )}
      </span>
      <button type="button" className="textknopf" disabled={laeuft} onClick={() => void abgleich.abgleichen()}>
        Abgleichen
      </button>
    </div>
  )
}
