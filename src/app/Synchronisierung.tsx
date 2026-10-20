// Profil-Bereich „Synchronisierung“ (nur in der Android-App): offene Uploads,
// letzter erfolgreicher Upload und „Jetzt hochladen“.
import { useCallback, useEffect, useState } from 'react'
import { WepNative } from '@/android/native'
import { letzterUpload } from '@/android/warteschlange'

function zeit(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function Synchronisierung({ id }: { id: string }) {
  const [offen, setOffen] = useState<number | null>(null)
  const [zuletzt, setZuletzt] = useState<string | undefined>(letzterUpload())
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')

  const laden = useCallback(async () => {
    try {
      setOffen((await WepNative.liste()).eintraege.length)
      setZuletzt(letzterUpload())
    } catch {
      setOffen(null)
    }
  }, [])

  useEffect(() => {
    void laden()
    const t = setInterval(() => void laden(), 5000)
    return () => clearInterval(t)
  }, [laden])

  async function hochladen() {
    setLaeuft(true)
    setFehler('')
    try {
      await WepNative.jetztVersuchen()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
    setTimeout(() => {
      void laden()
      setLaeuft(false)
    }, 2000)
  }

  return (
    <section className="abschnitt" aria-labelledby={id}>
      <h2 className="gruppenkopf" id={id}>
        Synchronisierung
      </h2>
      <dl className="werte">
        <div>
          <dt>Offene Uploads</dt>
          <dd>{offen === null ? '…' : offen === 0 ? 'keine' : offen}</dd>
        </div>
        <div>
          <dt>Letzter erfolgreicher Upload</dt>
          <dd>{zuletzt ? zeit(zuletzt) : 'noch keiner'}</dd>
        </div>
      </dl>
      <div className="knopf-reihe">
        <button type="button" className="knopf" disabled={laeuft} onClick={() => void hochladen()}>
          {laeuft ? 'Lädt hoch …' : 'Jetzt hochladen'}
        </button>
      </div>
      {fehler && (
        <p className="neben" role="alert">
          {fehler}
        </p>
      )}
    </section>
  )
}
