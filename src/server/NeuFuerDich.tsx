// Server-Modus (v2): „Neu für dich“ auf der Startseite – an mich abgegebene WEPs, Rückfragen, geprüfte WEPs.
// Antippen öffnet das WEP (nach einem Abgleich, falls es noch nicht auf dem Gerät ist) und markiert es als gelesen.
import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { ICON, zeitDe } from '@/app/ui'
import { ART_TEXT, type BenachrichtigungsArt } from './benachrichtigungsText'

export interface Benachrichtigung {
  id: number
  wepId: string
  art: BenachrichtigungsArt
  zeit: string
  vorgangsNr: string
  anlage: string
  parzelle: string
  gelesen: boolean
}

async function laden(): Promise<Benachrichtigung[]> {
  const r = await fetch('/api/v2/benachrichtigungen', { credentials: 'same-origin' })
  if (!r.ok) throw new Error(`Server antwortet mit ${r.status}`)
  return ((await r.json()) as { benachrichtigungen: Benachrichtigung[] }).benachrichtigungen
}

async function gelesen(ids?: number[]) {
  await fetch('/api/v2/benachrichtigungen/gelesen', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}) })
}

/** Alle Minute neu laden (Abgaben anderer kommen so an); ohne Netz bleibt die letzte Liste stehen. */
const INTERVALL_MS = 60_000

export function NeuFuerDich({ onOeffnen }: { onOeffnen: (wepId: string) => void }) {
  const [liste, setListe] = useState<Benachrichtigung[]>([])
  const neu = liste.filter((b) => !b.gelesen)

  const aktualisiere = useCallback(() => {
    if (!navigator.onLine) return
    laden()
      .then(setListe)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    aktualisiere()
    const t = setInterval(aktualisiere, INTERVALL_MS)
    return () => clearInterval(t)
  }, [aktualisiere])

  if (!neu.length) return null
  return (
    <section className="neu-fuer-dich block" aria-labelledby="neu-fuer-dich">
      <h2 className="gruppenkopf" id="neu-fuer-dich">
        <Bell {...ICON} size={18} /> Neu für dich ({neu.length})
      </h2>
      <ul className="liste">
        {neu.slice(0, 5).map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className="zeile"
              onClick={() => {
                void gelesen([b.id])
                setListe((l) => l.map((x) => (x.id === b.id ? { ...x, gelesen: true } : x)))
                onOeffnen(b.wepId)
              }}
            >
              <span className="zeile-text">
                <span className="zeile-titel">
                  {b.vorgangsNr || 'ohne Vorgangs-Nr.'} – {ART_TEXT[b.art]}
                </span>
                <span className="neben">{[b.anlage, b.parzelle && `Parzelle ${b.parzelle}`, zeitDe(b.zeit)].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="textknopf"
        onClick={() => {
          void gelesen()
          setListe((l) => l.map((x) => ({ ...x, gelesen: true })))
        }}
      >
        Alle als gelesen markieren
      </button>
    </section>
  )
}
