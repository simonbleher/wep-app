// Ausführliches Upload-Protokoll zur Fehlersuche (nur in der Android-App, im Profil nach
// langem Drücken auf die Version): Warteschlange, letzte Worker-Läufe, aktueller Netztyp.
import { useCallback, useEffect, useState } from 'react'
import {
  WepNative,
  type NetzInfo,
  type ProtokollEintrag,
  type WarteschlangenEintrag,
} from '@/android/native'
import { Meldung } from './ui'

function zeit(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function Fehlersuche() {
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
    <section className="abschnitt" aria-labelledby="fehlersuche">
      <h2 className="gruppenkopf" id="fehlersuche">
        Fehlersuche: Upload-Protokoll
      </h2>
      <dl className="werte">
        <div>
          <dt>Netz</dt>
          <dd>
            {netz ? `${netz.typ}${netz.unmetered ? ' (unbegrenzt)' : netz.typ === 'keins' ? '' : ' (getaktet)'}` : '…'}
          </dd>
        </div>
        <div>
          <dt>Warteschlange</dt>
          <dd>{queue.length === 0 ? 'leer' : `${queue.length} Datei(en)`}</dd>
        </div>
      </dl>
      {queue.length > 0 && (
        <ul className="liste">
          {queue.map((e) => (
            <li key={e.name} className="protokoll-zeile">
              {e.name} · {Math.max(1, Math.round(e.groesse / 1024))} KB · geändert {zeit(e.geaendertAm)}
              {e.blockiert ? ' · liegt (Konflikt, die App klärt es beim Abgleich)' : ''}
            </li>
          ))}
        </ul>
      )}
      <div className="knopf-reihe">
        <button type="button" className="knopf" onClick={() => void versuchen()}>
          Jetzt versuchen
        </button>
        <button type="button" className="knopf" onClick={() => void laden()}>
          Aktualisieren
        </button>
      </div>
      {fehler && (
        <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
      )}
      <h3 className="gruppenkopf">Protokoll (neueste zuerst)</h3>
      {protokoll.length === 0 ? (
        <p className="neben">Noch keine Einträge.</p>
      ) : (
        <ul className="liste">
          {protokoll.map((p, i) => (
            <li key={`${p.zeit}-${i}`} className={p.art === 'fehler' ? 'protokoll-zeile ist-fehler' : 'protokoll-zeile'}>
              {zeit(p.zeit)} · {p.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
