// Test-Seite für den Hintergrund-Upload (nur in der Android-App sichtbar, im Profil):
// Warteschlange, letzte Worker-Läufe, aktueller Netztyp und „Jetzt versuchen“.
import { useCallback, useEffect, useState } from 'react'
import {
  WepNative,
  type NetzInfo,
  type ProtokollEintrag,
  type WarteschlangenEintrag,
} from '@/android/native'

function zeit(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function AndroidTest() {
  const [queue, setQueue] = useState<WarteschlangenEintrag[]>([])
  const [protokoll, setProtokoll] = useState<ProtokollEintrag[]>([])
  const [netz, setNetz] = useState<NetzInfo | null>(null)
  const [fehler, setFehler] = useState('')

  const laden = useCallback(async () => {
    try {
      const [q, p, n] = await Promise.all([WepNative.liste(), WepNative.holeProtokoll(), WepNative.netzTyp()])
      setQueue(q.eintraege)
      setProtokoll([...p.eintraege].reverse().slice(0, 30))
      setNetz(n)
      setFehler('')
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void laden()
    const t = setInterval(() => void laden(), 5000)
    return () => clearInterval(t)
  }, [laden])

  async function versuchen() {
    try {
      await WepNative.jetztVersuchen()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
    setTimeout(() => void laden(), 1500)
  }

  return (
    <section className="formular">
      <h2 className="abschnitt-titel">Test: Hintergrund-Upload</h2>
      <dl className="daten-liste">
        <dt>Netz</dt>
        <dd>
          {netz ? `${netz.typ}${netz.unmetered ? ' (unbegrenzt)' : netz.typ === 'keins' ? '' : ' (getaktet)'}` : '…'}
        </dd>
        <dt>Warteschlange</dt>
        <dd>{queue.length === 0 ? 'leer' : `${queue.length} Datei(en)`}</dd>
      </dl>
      {queue.map((e) => (
        <p key={e.name} className="hinweis">
          {e.name} · {Math.max(1, Math.round(e.groesse / 1024))} KB · geändert {zeit(e.geaendertAm)}
          {e.blockiert ? ' · liegt (Konflikt, die App klärt es beim Abgleich)' : ''}
        </p>
      ))}
      <button type="button" className="btn" onClick={() => void versuchen()}>
        Jetzt versuchen
      </button>
      <button type="button" className="btn" onClick={() => void laden()}>
        Aktualisieren
      </button>
      {fehler && <p className="hinweis hinweis-warnung">{fehler}</p>}
      <h3 className="abschnitt-titel">Protokoll (neueste zuerst)</h3>
      {protokoll.length === 0 && <p className="hinweis">Noch keine Einträge.</p>}
      {protokoll.map((p, i) => (
        <p
          key={`${p.zeit}-${i}`}
          className={p.art === 'fehler' ? 'hinweis hinweis-warnung' : 'hinweis'}
        >
          {zeit(p.zeit)} · {p.text}
        </p>
      ))}
    </section>
  )
}
