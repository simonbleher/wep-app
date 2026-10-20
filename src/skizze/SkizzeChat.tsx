/**
 * Chat-Leiste unter dem Skizzen-Editor: Die Skizze per Beschreibung bearbeiten.
 *
 * Tippen oder diktieren („oben drei Beete nebeneinander“) → die KI schlägt Änderungen vor,
 * der Code wendet sie an → kurze Liste „was ich geändert habe“ mit „Rückgängig“ je Schritt.
 * Feste Elemente (Bau) bleiben unverändert.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Mic, Send, TriangleAlert } from 'lucide-react'
import { ICON } from '@/app/ui'
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
    <section aria-label="Skizze per Beschreibung bearbeiten" className="chat">
      <h2 className="h2">Skizze per Beschreibung ändern</h2>

      {eintraege.length === 0 && (
        <p className="neben">
          Beschreiben Sie, was in die Skizze soll – z. B. „{BEISPIELE[0]}“, „{BEISPIELE[1]}“ oder „{BEISPIELE[2]}“. Bau-Elemente
          bleiben unverändert.
        </p>
      )}

      <div role="log" aria-live="polite" className="chat-verlauf">
        {eintraege.map((e) => (
          <div key={e.id} className="chat-eintrag">
            <div className="chat-frage">{e.frage}</div>
            <div className="chat-antwort">
              {!e.ergebnis && <em>Die KI arbeitet …</em>}
              {e.ergebnis?.fehler && <span className="chat-fehler">{e.ergebnis.fehler}</span>}
              {e.ergebnis && !e.ergebnis.fehler && (
                <>
                  {e.ergebnis.schritte.length > 0 && (
                    <ul className="chat-schritte">
                      {e.ergebnis.schritte.map((s: ChatSchritt, i) => (
                        <li key={i} className="chat-schritt">
                          <span
                            className={s.ok ? 'chat-text' : 'chat-text chat-fehler'}
                            style={e.zurueck.has(i) ? { textDecoration: 'line-through' } : undefined}
                          >
                            {s.ok ? <Check {...ICON} size={18} /> : <TriangleAlert {...ICON} size={18} />}
                            <span>
                              {s.pruefung ? '(Prüfung) ' : ''}
                              {s.text}
                            </span>
                          </span>
                          {s.ok && s.vorher && !e.zurueck.has(i) && (
                            <button type="button" className="textknopf" onClick={() => rueckgaengig(e.id, i)} title="Diesen Schritt rückgängig machen">
                              Rückgängig
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.ergebnis.schritte.length === 0 && e.ergebnis.hinweise.length === 0 && <span>Nichts geändert.</span>}
                  {e.ergebnis.hinweise.map((h, i) => (
                    <p key={i}>{h}</p>
                  ))}
                  <small className="neben">
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
        className="chat-eingabe"
        onSubmit={(ev) => {
          ev.preventDefault()
          void senden()
        }}
      >
        <textarea
          aria-label="Nachricht an den Skizzen-Assistenten"
          className="eingabe"
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
        />
        {diktatMoeglich && (
          <button
            type="button"
            className="werkzeug"
            onClick={diktatUmschalten}
            aria-pressed={diktat}
            aria-label="Diktieren"
            title="Diktieren"
          >
            <Mic {...ICON} />
          </button>
        )}
        <button type="submit" className="knopf knopf-primaer" disabled={laeuft || !text.trim()}>
          <Send {...ICON} />
          {laeuft ? 'Sendet …' : 'Senden'}
        </button>
      </form>
    </section>
  )
}
