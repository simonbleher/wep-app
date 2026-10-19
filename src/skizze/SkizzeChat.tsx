/**
 * Chat-Leiste unter dem Skizzen-Editor: Die Skizze per Beschreibung bearbeiten.
 *
 * Tippen oder diktieren („oben drei Beete nebeneinander“) → die KI schlägt Änderungen vor,
 * der Code wendet sie an → kurze Liste „was ich geändert habe“ mit „Rückgängig“ je Schritt.
 * Feste Elemente (Bau) bleiben unverändert.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SkizzeDaten } from './types'
import { skizzeZuSzene, szeneZuSkizze } from './szene'
import { fuehreChatAus, type ChatErgebnis, type ChatSchritt } from './chatAblauf'
import { chatUeberHttp } from './chatClient'
import { macheRueckgaengig } from './operationen'
import { szeneAlsPngBase64 } from './szenePng'

export interface SkizzeChatProps {
  /** Aktueller Stand der Skizze (inkl. Handbearbeitung im Editor). */
  holeSkizze: () => SkizzeDaten
  /** Neuer Stand nach einer Chat-Änderung oder nach „Rückgängig“. */
  onSkizze: (neu: SkizzeDaten) => void
}

interface Eintrag {
  id: number
  frage: string
  /** undefined = KI arbeitet noch */
  ergebnis?: ChatErgebnis
  /** Schritte, die rückgängig gemacht wurden */
  zurueck: Set<number>
}

// Web Speech API (Diktat). Nicht überall vorhanden – dann fehlt der Knopf.
interface Erkennung {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}
function erzeugeErkennung(): Erkennung | null {
  const w = window as unknown as { SpeechRecognition?: new () => Erkennung; webkitSpeechRecognition?: new () => Erkennung }
  const K = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return K ? new K() : null
}

const BEISPIELE = ['oben drei Beete nebeneinander', 'rechts eine Hecke am Zaun entlang', 'neben das Holzpferd eine Schaukel']

export function SkizzeChat({ holeSkizze, onSkizze }: SkizzeChatProps) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [text, setText] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [diktat, setDiktat] = useState(false)
  const [diktatMoeglich] = useState(() => typeof window !== 'undefined' && erzeugeErkennung() !== null)
  const erkennungRef = useRef<Erkennung | null>(null)
  const nummer = useRef(0)
  const ende = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ende.current?.scrollIntoView?.({ block: 'nearest' })
  }, [eintraege])
  useEffect(() => () => erkennungRef.current?.stop(), [])

  const senden = useCallback(async () => {
    const frage = text.trim()
    if (!frage || laeuft) return
    erkennungRef.current?.stop()
    setText('')
    setLaeuft(true)
    const id = ++nummer.current
    setEintraege((e) => [...e, { id, frage, zurueck: new Set() }])
    const daten = holeSkizze()
    const ergebnis = await fuehreChatAus(skizzeZuSzene(daten), frage, {
      rufe: (a) => chatUeberHttp(a),
      rendere: (s) => szeneAlsPngBase64(s),
    })
    if (!ergebnis.fehler && ergebnis.schritte.some((s) => s.ok)) onSkizze(szeneZuSkizze(ergebnis.szene, daten))
    setEintraege((e) => e.map((x) => (x.id === id ? { ...x, ergebnis } : x)))
    setLaeuft(false)
  }, [text, laeuft, holeSkizze, onSkizze])

  const rueckgaengig = (eintragId: number, index: number) => {
    const eintrag = eintraege.find((e) => e.id === eintragId)
    const schritt = eintrag?.ergebnis?.schritte[index]
    if (!schritt) return
    const daten = holeSkizze()
    onSkizze(szeneZuSkizze(macheRueckgaengig(skizzeZuSzene(daten), schritt), daten))
    setEintraege((alle) => alle.map((e) => (e.id === eintragId ? { ...e, zurueck: new Set(e.zurueck).add(index) } : e)))
  }

  const diktatUmschalten = () => {
    if (diktat) {
      erkennungRef.current?.stop()
      return
    }
    const r = erzeugeErkennung()
    if (!r) return
    r.lang = 'de-DE'
    r.interimResults = true
    r.continuous = false
    const vorher = text ? `${text.trim()} ` : ''
    r.onresult = (e) => {
      const teile = Array.from(e.results).map((t) => t[0].transcript)
      setText(vorher + teile.join(' ').trim())
    }
    r.onend = () => setDiktat(false)
    r.onerror = () => setDiktat(false)
    erkennungRef.current = r
    setDiktat(true)
    r.start()
  }

  return (
    <section aria-label="Skizze per Beschreibung bearbeiten" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Skizze per Beschreibung ändern</h3>

      {eintraege.length === 0 && (
        <p className="hinweis-klein" style={{ margin: 0 }}>
          Beschreiben Sie, was in die Skizze soll – z. B. „{BEISPIELE[0]}“, „{BEISPIELE[1]}“ oder „{BEISPIELE[2]}“. Bau-Elemente
          bleiben unverändert.
        </p>
      )}

      <div role="log" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
        {eintraege.map((e) => (
          <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ alignSelf: 'flex-end', background: '#e8f5e9', borderRadius: 8, padding: '6px 10px', maxWidth: '90%' }}>{e.frage}</div>
            <div style={{ background: '#f4f6f4', border: '1px solid #ddd', borderRadius: 8, padding: '6px 10px' }}>
              {!e.ergebnis && <em>Die KI arbeitet …</em>}
              {e.ergebnis?.fehler && <span style={{ color: '#c62828' }}>{e.ergebnis.fehler}</span>}
              {e.ergebnis && !e.ergebnis.fehler && (
                <>
                  {e.ergebnis.schritte.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {e.ergebnis.schritte.map((s: ChatSchritt, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: s.ok ? undefined : '#c62828', textDecoration: e.zurueck.has(i) ? 'line-through' : undefined }}>
                            {s.ok ? '✓' : '⚠'} {s.pruefung ? '(Prüfung) ' : ''}
                            {s.text}
                          </span>
                          {s.ok && s.vorher && !e.zurueck.has(i) && (
                            <button type="button" onClick={() => rueckgaengig(e.id, i)} title="Diesen Schritt rückgängig machen" style={{ minHeight: 36, padding: '0 10px' }}>
                              Rückgängig
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.ergebnis.schritte.length === 0 && e.ergebnis.hinweise.length === 0 && <span>Nichts geändert.</span>}
                  {e.ergebnis.hinweise.map((h, i) => (
                    <p key={i} style={{ margin: '4px 0 0' }}>
                      {h}
                    </p>
                  ))}
                  <small style={{ color: '#666', display: 'block', marginTop: 4 }}>
                    {e.ergebnis.modelle[0]}
                    {e.ergebnis.pruefung ? ` · Prüfung: ${e.ergebnis.pruefung}` : ''}
                  </small>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={ende} />
      </div>

      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          void senden()
        }}
        style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}
      >
        <textarea
          aria-label="Nachricht an den Skizzen-Assistenten"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
              ev.preventDefault()
              void senden()
            }
          }}
          rows={2}
          placeholder="Was soll in die Skizze?"
          style={{ flex: 1, fontSize: 16, padding: 8, borderRadius: 6, border: '1px solid #ccc' }}
        />
        {diktatMoeglich && (
          <button
            type="button"
            onClick={diktatUmschalten}
            aria-pressed={diktat}
            title="Diktieren"
            style={{ minWidth: 48, fontSize: 20, borderRadius: 6, background: diktat ? '#c62828' : '#f0f0f0', color: diktat ? '#fff' : undefined }}
          >
            🎤
          </button>
        )}
        <button
          type="submit"
          disabled={laeuft || !text.trim()}
          style={{ minWidth: 72, fontSize: 16, borderRadius: 6, background: '#1b5e20', color: '#fff', border: 'none' }}
        >
          {laeuft ? '…' : 'Senden'}
        </button>
      </form>
    </section>
  )
}
