// Server-Modus (v2): Grün nimmt ein abgegebenes Bau-WEP an – mit dem eigenen WEP zusammenführen oder ohne eigenes WEP
// weiterarbeiten (docs/PLAN-V2.md). Hinweis im WEP, Dialog mit Auswahl und Vorschau, Stand mit „Rückgängig“.
// Nichts wird gesperrt: Unterschiede in den Stammdaten und bei der Skizze sind nur Hinweise.
import { useEffect, useId, useState } from 'react'
import { GitMerge, Undo2 } from 'lucide-react'
import type { Formalien, Wep } from '@/model'
import { wepName } from '@/model'
import { datumDe, Dialog, ICON, Meldung, Rueckfrage } from '@/app/ui'
import { gemerktesKonto } from './api'
import type { RechteKonto } from './rechte'
import { eigeneZurAuswahl, vorschau, type EigenesWep } from './zusammenfuehren'
import { kannZusammenfuehren, ladeEigeneOffeneWeps, ladeMeta, zuruecknehmenInApp, zusammenfuehrenInApp } from './zusammenfuehrenDienst'
import type { SyncMeta } from '@/sync/types'

const ich = (): RechteKonto => {
  const k = gemerktesKonto()
  return { id: k?.id ?? '', rollen: k?.status === 'freigegeben' ? k.rollen : [] }
}

const GRUND_TEXT = { vorgangsNr: 'gleiche Vorgangs-Nr.', anlageParzelle: 'gleiche Anlage und Parzelle' } as const

function beschreibung(w: Wep): string {
  const f = w.formalien
  return [f.vorgangsNr ? `Vorgangs-Nr. ${f.vorgangsNr}` : 'ohne Vorgangs-Nr.', f.kleingartenanlage, f.parzelle && `Parzelle ${f.parzelle}`].filter(Boolean).join(' · ')
}

/** Lädt, was der Hinweis und der Abgabe-Reiter brauchen: Meta des Bau-WEP und die eigenen offenen WEPs (passende zuerst). */
function useZusammenfuehrenDaten(wep: Wep) {
  const [meta, setMeta] = useState<SyncMeta>()
  const [eigene, setEigene] = useState<EigenesWep[]>()
  useEffect(() => {
    let aktiv = true
    void Promise.all([ladeMeta(wep.id), ladeEigeneOffeneWeps()]).then(([m, liste]) => {
      if (!aktiv) return
      setMeta(m)
      setEigene(eigeneZurAuswahl(wep, liste))
    })
    return () => {
      aktiv = false
    }
  }, [wep])
  return { meta, eigene }
}

const ausgeblendetSchluessel = (id: string) => `wep-v2-annahme-${id}`
function istAusgeblendet(id: string): boolean {
  try {
    return localStorage.getItem(ausgeblendetSchluessel(id)) === 'ohne'
  } catch {
    return false
  }
}

/**
 * Hinweis oben im WEP, wenn ein Bau-WEP an mich abgegeben ist und ich eigene offene WEPs habe: zusammenführen oder ohne
 * eigenes WEP weiterarbeiten (wie bisher). Die Wahl „ohne“ merkt sich das Gerät; im Reiter „Abgabe“ geht es trotzdem.
 */
export function AnnahmeHinweis({ wep, onGeaendert }: { wep: Wep; onGeaendert: () => void }) {
  const { meta, eigene } = useZusammenfuehrenDaten(wep)
  const [ohne, setOhne] = useState(() => istAusgeblendet(wep.id))
  const [offen, setOffen] = useState(false)
  if (ohne || !eigene?.length || !kannZusammenfuehren(wep, meta, ich())) return null
  const passend = eigene.filter((e) => e.grund)
  return (
    <>
      <Meldung>
        <p>
          <b>Bau-WEP für dich – mit deinem eigenen WEP zusammenführen?</b>
        </p>
        <p className="neben">
          {passend.length
            ? `Passend: ${passend.map((e) => `${beschreibung(e.wep)} (${GRUND_TEXT[e.grund!]})`).join('; ')}.`
            : `Du hast ${eigene.length} eigene${eigene.length === 1 ? 's' : ''} offene${eigene.length === 1 ? 's' : ''} WEP${eigene.length === 1 ? '' : 's'}.`}
        </p>
        <div className="dialog-knoepfe">
          <button type="button" className="knopf knopf-primaer" onClick={() => setOffen(true)}>
            <GitMerge {...ICON} />
            Mit meinem WEP zusammenführen …
          </button>
          <button
            type="button"
            className="knopf"
            onClick={() => {
              try {
                localStorage.setItem(ausgeblendetSchluessel(wep.id), 'ohne')
              } catch {
                /* ohne Speicher: nur für jetzt ausblenden */
              }
              setOhne(true)
            }}
          >
            Ohne eigenes WEP weiterarbeiten
          </button>
        </div>
      </Meldung>
      {offen && (
        <ZusammenfuehrenDialog
          wep={wep}
          eigene={eigene}
          onSchliessen={() => setOffen(false)}
          onFertig={() => {
            setOffen(false)
            onGeaendert()
          }}
        />
      )}
    </>
  )
}

/** Auswahl des eigenen WEP, Vorschau „was wird übernommen“, Stammdaten je Feld, dann zusammenführen. */
export function ZusammenfuehrenDialog({ wep, eigene, onSchliessen, onFertig }: { wep: Wep; eigene: EigenesWep[]; onSchliessen: () => void; onFertig: (meldung: string) => void }) {
  const id = useId()
  const [auswahl, setAuswahl] = useState<string>(eigene[0]?.grund ? eigene[0].wep.id : '')
  const gewaehlt = eigene.find((e) => e.wep.id === auswahl)?.wep
  const v = gewaehlt ? vorschau(wep, gewaehlt) : undefined
  const [felder, setFelder] = useState<Record<string, Set<keyof Formalien>>>({})
  const gewaehlteFelder = (gewaehlt && felder[gewaehlt.id]) ?? new Set(v?.stammdaten.filter((f) => f.vorgewaehlt).map((f) => f.feld))
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string>()

  function schalte(feld: keyof Formalien, an: boolean) {
    if (!gewaehlt) return
    const neu = new Set(gewaehlteFelder)
    if (an) neu.add(feld)
    else neu.delete(feld)
    setFelder((alt) => ({ ...alt, [gewaehlt.id]: neu }))
  }

  async function los() {
    if (!gewaehlt) return
    setLaeuft(true)
    setFehler(undefined)
    try {
      const erg = await zusammenfuehrenInApp(wep.id, gewaehlt.id, [...gewaehlteFelder])
      if (erg.fehler) setFehler(erg.fehler)
      else onFertig(erg.offline ? 'Zusammengeführt (auf diesem Gerät). Der Server übernimmt es beim nächsten Abgleich.' : 'Zusammengeführt.')
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
    }
  }

  const g = v?.gruen
  return (
    <Dialog titel="Mit eigenem WEP zusammenführen" onSchliessen={onSchliessen}>
      <fieldset className="feld">
        <legend className="label">Welches deiner WEPs?</legend>
        {eigene.map((e) => (
          <label key={e.wep.id} className="abgleich-wahl">
            <input type="radio" name={`${id}-wep`} checked={auswahl === e.wep.id} onChange={() => setAuswahl(e.wep.id)} />
            <span>
              {wepName(e.wep)} <span className="neben">– {beschreibung(e.wep)}</span>
              {e.grund && <span className="status"> passt: {GRUND_TEXT[e.grund]}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      {v && g && (
        <section aria-labelledby={`${id}-vorschau`}>
          <h3 className="gruppenkopf" id={`${id}-vorschau`}>
            Was wird übernommen
          </h3>
          <p>
            Aus deinem WEP: {g.aussenanlagen} Außenanlagen, {g.aufwuchs} Aufwuchs, {g.beseitigung} Beseitigung
            {g.skizze ? `, Skizze mit ${g.skizze} ${g.skizze === 1 ? 'Element' : 'Elementen'}` : ''}, {g.fotos} {g.fotos === 1 ? 'Foto' : 'Fotos'}
            {g.unterschrift ? ', deine Unterschrift' : ''}. Der Bau-Teil bleibt, wie Bau ihn erfasst hat.
          </p>
          {v.ersetztGruenImBau && (
            <Meldung>
              <p>Im Bau-WEP ist schon ein Grün-Teil erfasst. Er wird durch den aus deinem WEP ersetzt.</p>
            </Meldung>
          )}
          {v.stammdaten.length > 0 && (
            <fieldset className="feld">
              <legend className="label">Stammdaten: Es gilt das Bau-WEP – ankreuzen, wo dein Wert übernommen werden soll</legend>
              {v.stammdaten.map((f) => (
                <label key={f.feld} className="abgleich-wahl">
                  <input type="checkbox" checked={gewaehlteFelder.has(f.feld)} onChange={(e) => schalte(f.feld, e.target.checked)} />
                  <span>
                    {f.name}: Bau „{f.bau || 'leer'}“ · dein WEP „{f.gruen}“
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {v.hinweise.length > 0 && (
            <Meldung>
              {v.hinweise.map((h) => (
                <p key={h}>{h}</p>
              ))}
            </Meldung>
          )}
          <p className="neben">
            Danach gibt es ein WEP (das Bau-WEP). Dein eigenes WEP verschwindet aus der Liste. Rückgängig machen geht, solange du nicht an den BV abgegeben hast. Ohne Netz geht es auch:
            Der Server übernimmt es beim nächsten Abgleich.
          </p>
        </section>
      )}

      {fehler && (
        <Meldung alarm>
          <p>{fehler}</p>
        </Meldung>
      )}
      <div className="dialog-knoepfe">
        <button type="button" className="knopf" onClick={onSchliessen}>
          Abbrechen
        </button>
        <button type="button" className="knopf knopf-primaer" disabled={!gewaehlt || laeuft} onClick={() => void los()}>
          <GitMerge {...ICON} />
          {laeuft ? 'Führe zusammen …' : 'Zusammenführen'}
        </button>
      </div>
    </Dialog>
  )
}

/**
 * Im Reiter „Abgabe“: Stand des Zusammenführens (vorgemerkt oder beim Server) mit „Rückgängig“, sonst der Weg zum
 * Zusammenführen, wenn es eigene offene WEPs gibt.
 */
export function ZusammenfuehrenStand({ wep, onGeaendert }: { wep: Wep; onGeaendert: () => void }) {
  const { meta, eigene } = useZusammenfuehrenDaten(wep)
  const [dialog, setDialog] = useState(false)
  const [frage, setFrage] = useState(false)
  const [meldung, setMeldung] = useState<{ text: string; alarm?: boolean }>()
  const a = wep.ablauf
  const vorgemerkt = meta?.zusammenfuehrung
  const beimServer = a?.zusammengefuehrtAus
  // Nur für den Grün-Wertermittler dieses WEP (Bau sieht das Zusammenführen im Verlauf)
  const binGruen = a?.gruen?.id === ich().id
  const darfZurueck = a?.zustand === 'gruen_in_arbeit' && binGruen

  async function zurueck() {
    setFrage(false)
    const erg = await zuruecknehmenInApp(wep.id)
    if (!erg.ok) return setMeldung({ text: erg.meldung, alarm: true })
    setMeldung({ text: 'Zusammenführen rückgängig gemacht. Dein eigenes WEP ist wieder in der Liste.' })
    onGeaendert()
  }

  let inhalt = null
  if (!binGruen) inhalt = null
  else if (vorgemerkt || beimServer) {
    inhalt = (
      <>
        <p>
          {vorgemerkt
            ? `Mit deinem WEP zusammengeführt am ${datumDe(vorgemerkt.am)} – wartet auf den Server.`
            : `Mit deinem WEP ${beimServer!.vorgangsNr || ''} zusammengeführt am ${datumDe(beimServer!.am)}.`}
        </p>
        {darfZurueck && (
          <button type="button" className="knopf" onClick={() => setFrage(true)}>
            <Undo2 {...ICON} />
            Zusammenführen rückgängig machen
          </button>
        )}
      </>
    )
  } else if (eigene?.length && kannZusammenfuehren(wep, meta, ich())) {
    inhalt = (
      <>
        <p className="neben">Du hast eigene offene WEPs. Hast du den Grün-Teil schon dort erfasst, kannst du ihn hierher übernehmen.</p>
        <button type="button" className="knopf" onClick={() => setDialog(true)}>
          <GitMerge {...ICON} />
          Mit eigenem WEP zusammenführen …
        </button>
      </>
    )
  }
  if (!inhalt && !meldung) return null
  return (
    <section className="abschnitt" aria-label="Zusammenführen">
      <h2 className="gruppenkopf">Eigenes WEP</h2>
      {inhalt}
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
      {dialog && eigene && (
        <ZusammenfuehrenDialog
          wep={wep}
          eigene={eigene}
          onSchliessen={() => setDialog(false)}
          onFertig={(text) => {
            setDialog(false)
            setMeldung({ text })
            onGeaendert()
          }}
        />
      )}
      {frage && (
        <Rueckfrage
          titel="Zusammenführen rückgängig machen?"
          text={
            vorgemerkt
              ? 'Das Bau-WEP bekommt seinen Stand von vorher zurück, dein eigenes WEP erscheint wieder in der Liste. Was du seither am Grün-Teil hier geändert hast, geht dabei verloren.'
              : 'Das Bau-WEP bekommt den Stand von vor dem Zusammenführen, dein eigenes WEP kommt so zurück, wie es beim Zusammenführen war. Was du seither am Grün-Teil im Bau-WEP geändert hast, geht dabei verloren. Dafür braucht es Netz.'
          }
          bestaetigen="Rückgängig machen"
          onAbbrechen={() => setFrage(false)}
          onBestaetigen={() => void zurueck()}
        />
      )}
    </section>
  )
}
