// Server-Modus (v2): Reiter „Abgabe“ im WEP – Zustand, Beteiligte, offene Rückfrage, die möglichen Schritte (an Grün
// abgeben mit Auswahl, an den BV abgeben) und der Verlauf. Gesperrt wird nur über den Ablauf (docs/PLAN-V2.md).
import { useEffect, useId, useState } from 'react'
import { Send } from 'lucide-react'
import type { Wep } from '@/model'
import { ICON, Meldung, Rueckfrage, zeitDe } from '@/app/ui'
import { fuehreSchrittAus, ladeGruenKonten, ladeVerlauf, serverSicht, type GruenKonto, type VerlaufEintrag } from './ablaufDienst'
import { AKTION_TEXT, ZUSTAND_TEXT, type AblaufAktion, type Zustand } from './rechte'

export function ZustandMarke({ zustand }: { zustand: Zustand }) {
  return <span className={`status zustand zustand-${zustand}`}>{ZUSTAND_TEXT[zustand]}</span>
}

const VERLAUF_TEXT: Record<string, string> = { ...AKTION_TEXT, angelegt: 'angelegt', bearbeitet: 'bearbeitet', geloescht: 'in den Papierkorb gelegt', wiederhergestellt: 'wiederhergestellt' }
const TEIL = { bau: 'Bau', gruen: 'Grün', beide: 'Bau und Grün' } as const

export function AbgabeBereich({ wep, onGeaendert }: { wep: Wep; onGeaendert: () => void }) {
  const id = useId()
  const sicht = serverSicht(wep)
  const a = wep.ablauf
  const zustand: Zustand = a?.zustand ?? 'bau_in_arbeit'
  const ersteAbgabeAnGruen = sicht.aktionen.includes('an_gruen') && !a?.gruen
  const [gruenKonten, setGruenKonten] = useState<GruenKonto[]>()
  const [gruen, setGruen] = useState('')
  const [frage, setFrage] = useState<AblaufAktion>()
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<{ text: string; alarm?: boolean }>()
  const [verlauf, setVerlauf] = useState<VerlaufEintrag[]>()

  useEffect(() => {
    if (!ersteAbgabeAnGruen) return
    ladeGruenKonten()
      .then(setGruenKonten)
      .catch((e) => setMeldung({ text: `Grün-Wertermittler nicht ladbar: ${e instanceof Error ? e.message : String(e)}`, alarm: true }))
  }, [ersteAbgabeAnGruen])

  useEffect(() => {
    if (!a) return // noch nie auf dem Server
    ladeVerlauf(wep.id)
      .then(setVerlauf)
      .catch(() => setVerlauf(undefined))
  }, [wep.id, a?.zustand, a])

  const gruenName = gruenKonten?.find((k) => k.id === gruen)?.name ?? a?.gruen?.name ?? ''

  async function ausfuehren(schritt: AblaufAktion) {
    setFrage(undefined)
    setLaeuft(true)
    setMeldung(undefined)
    const erg = await fuehreSchrittAus(wep.id, schritt)
    setLaeuft(false)
    if (!erg.ok) return setMeldung({ text: erg.meldung, alarm: true })
    setMeldung({ text: schritt.aktion === 'an_gruen' ? `An ${gruenName || 'Grün'} abgegeben.` : 'An den BV abgegeben.' })
    onGeaendert()
  }

  return (
    <>
      <header className="seitenkopf">
        <h1 className="h1">Abgabe</h1>
      </header>

      <section className="abschnitt" aria-labelledby={`${id}-stand`}>
        <h2 className="gruppenkopf" id={`${id}-stand`}>
          Stand
        </h2>
        <p>
          <ZustandMarke zustand={zustand} />
        </p>
        <dl className="werte">
          <div>
            <dt>Bau</dt>
            <dd>{a?.bau?.name ?? 'du (noch nicht auf dem Server)'}</dd>
          </div>
          <div>
            <dt>Grün</dt>
            <dd>{a?.gruen?.name ?? 'noch nicht abgegeben'}</dd>
          </div>
        </dl>
        {a?.rueckfrage && (
          <Meldung>
            <p>
              <b>Rückfrage vom BV</b> ({a.rueckfrage.von}
              {a.rueckfrage.am ? `, ${zeitDe(a.rueckfrage.am)}` : ''}) an {TEIL[a.rueckfrage.an]}: {a.rueckfrage.notiz}
            </p>
            <p className="neben">Gerade dran: {TEIL[a.rueckfrage.bei]}.</p>
          </Meldung>
        )}
      </section>

      <section className="abschnitt" aria-labelledby={`${id}-schritte`}>
        <h2 className="gruppenkopf" id={`${id}-schritte`}>
          Abgeben
        </h2>
        {sicht.aktionen.includes('an_gruen') &&
          (ersteAbgabeAnGruen ? (
            <>
              <div className="feld">
                <label className="label" htmlFor={`${id}-gruen`}>
                  Grün-Wertermittler
                </label>
                <select id={`${id}-gruen`} className="eingabe" value={gruen} onChange={(e) => setGruen(e.target.value)}>
                  <option value="">bitte wählen …</option>
                  {(gruenKonten ?? []).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name || k.email}
                    </option>
                  ))}
                </select>
              </div>
              {gruenKonten?.length === 0 && <p className="neben">Es gibt noch keinen freigegebenen Grün-Wertermittler. Der Admin vergibt die Rolle.</p>}
              <button type="button" className="knopf knopf-primaer" disabled={!gruen || laeuft} onClick={() => setFrage({ aktion: 'an_gruen', gruenKonto: gruen })}>
                <Send {...ICON} />
                An Grün abgeben
              </button>
            </>
          ) : (
            <button type="button" className="knopf knopf-primaer" disabled={laeuft} onClick={() => setFrage({ aktion: 'an_gruen' })}>
              <Send {...ICON} />
              An {a?.gruen?.name ?? 'Grün'} weitergeben
            </button>
          ))}
        {sicht.aktionen.includes('an_bv') && (
          <button type="button" className="knopf knopf-primaer" disabled={laeuft} onClick={() => setFrage({ aktion: 'an_bv' })}>
            <Send {...ICON} />
            An den BV abgeben
          </button>
        )}
        {!sicht.aktionen.some((x) => x === 'an_gruen' || x === 'an_bv') && (
          <p className="neben">{sicht.recht ? 'Abgeben kannst du, sobald du an der Reihe bist.' : 'Das WEP ist abgegeben. Du kannst es nur noch lesen (Übersicht).'}</p>
        )}
        {laeuft && <p className="neben">Gleiche ab und gebe ab …</p>}
        {meldung &&
          (meldung.alarm ? (
            <Meldung alarm>
              <p>{meldung.text}</p>
            </Meldung>
          ) : (
            <p className="neben" role="status">
              {meldung.text}
            </p>
          ))}
      </section>

      {verlauf && verlauf.length > 0 && (
        <section className="abschnitt" aria-labelledby={`${id}-verlauf`}>
          <h2 className="gruppenkopf" id={`${id}-verlauf`}>
            Verlauf
          </h2>
          <ul className="verlauf">
            {verlauf.map((v, i) => (
              <li key={i}>
                <span className="neben">{zeitDe(v.zeit)}</span> · {v.wer}: {VERLAUF_TEXT[v.aktion] ?? v.aktion}
                {v.notiz ? ` – „${v.notiz}“` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {frage && (
        <Rueckfrage
          titel={frage.aktion === 'an_bv' ? 'An den BV abgeben?' : `An ${gruenName || 'Grün'} abgeben?`}
          text={
            frage.aktion === 'an_bv'
              ? 'Danach kann niemand mehr am WEP arbeiten, bis der BV es prüft oder eine Rückfrage stellt.'
              : `Danach kannst du das WEP nur noch lesen. ${gruenName || 'Grün'} bearbeitet den Grün-Teil und gibt an den BV ab.`
          }
          bestaetigen="Abgeben"
          gefahr={false}
          onAbbrechen={() => setFrage(undefined)}
          onBestaetigen={() => void ausfuehren(frage)}
        />
      )}
    </>
  )
}
