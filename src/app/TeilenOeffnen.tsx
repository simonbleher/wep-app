// WEP-Datei öffnen (Beta 5, Paket 2): Vorschau nach dem Muster von „Sicherung einspielen“ – neu, gleich oder
// unterschiedlich; bei Abweichung Auswahl je Teil (Bau, Grün, Fotos, Bau-Excel, Formalien). Nichts wird still
// überschrieben.
import { useEffect, useState } from 'react'
import { lokalerStand, lokalesZiel, WAHL_TEXT } from '@/sicherung'
import {
  TEIL_TITEL,
  TeilenFehler,
  anzahlGewaehlt,
  erstelleTeilenVorschau,
  leseTeilen,
  spieleTeilenEin,
  standardTeilenWahl,
  wepOptionen,
  type GeleseneTeilen,
  type TeilId,
  type TeilenErgebnis,
  type TeilenVorschau,
  type TeilenWahl,
} from '@/teilen'
import { Dialog, Laedt, Meldung, zeitDe } from './ui'

const STATUS_TEXT = { neu: 'Neu', gleich: 'Gleich', anders: 'Weicht ab', 'im-papierkorb': 'Im Papierkorb', vorhanden: 'Vorhanden' } as const

const TEIL_UEBERNEHMEN: Record<TeilId, string> = {
  bau: 'Bau-Teil aus der Datei übernehmen (ersetzt den Stand hier)',
  gruen: 'Grün-Teil aus der Datei übernehmen (ersetzt den Stand hier)',
  fotos: 'Neue Fotos aus der Datei hinzufügen',
  bauExcel: 'Bau-Excel aus der Datei übernehmen (ersetzt die Datei hier)',
  formalien: 'Formalien und Status aus der Datei übernehmen (ersetzt den Stand hier)',
}

const n = (anzahl: number, einzahl: string, mehrzahl: string) => `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`

/** Kurzer Satz zum Ergebnis. */
export function teilenErgebnisText(e: TeilenErgebnis): string {
  if (e.weps.length === 0) return 'Es wurde nichts eingespielt.'
  const w = e.weps[0]
  const was = e.teile.length ? `: ${e.teile.map((t) => TEIL_TITEL[t]).join(', ')}` : ''
  const dateien = [e.fotos ? n(e.fotos, 'Foto', 'Fotos') : '', e.bauExcel ? 'Bau-Excel' : ''].filter(Boolean).join(', ')
  return `WEP ${w.id}${w.von ? ` (als Kopie von ${w.von})` : ''} eingespielt${was}${dateien && !e.teile.length ? ` (${dateien})` : ''}.`
}

export function TeilenOeffnen({
  datei,
  onSchliessen,
  onEingespielt,
  onWepOeffnen,
}: {
  datei: Blob
  onSchliessen: () => void
  /** Es wurde etwas eingespielt (ein offenes WEP muss neu geladen werden). */
  onEingespielt: () => void
  /** Zeigt das eingespielte WEP an. */
  onWepOeffnen: (wepId: string) => void
}) {
  const [stand, setStand] = useState<{ gelesen: GeleseneTeilen; vorschau: TeilenVorschau; wahl: TeilenWahl }>()
  const [fehler, setFehler] = useState<string>()
  const [laeuft, setLaeuft] = useState(false)
  const [fertig, setFertig] = useState<TeilenErgebnis>()

  useEffect(() => {
    let aktiv = true
    void (async () => {
      try {
        const gelesen = await leseTeilen(datei)
        const vorschau = await erstelleTeilenVorschau(gelesen, lokalerStand)
        if (aktiv) setStand({ gelesen, vorschau, wahl: standardTeilenWahl(vorschau) })
      } catch (e) {
        if (aktiv) setFehler(e instanceof TeilenFehler ? e.message : `Die Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
    return () => {
      aktiv = false
    }
  }, [datei])

  async function einspielen() {
    if (!stand) return
    setLaeuft(true)
    try {
      const e = await spieleTeilenEin({ ...stand, lokal: lokalerStand, ziel: lokalesZiel })
      if (e.fehler.length) setFehler(`Beim Einspielen ist etwas schiefgegangen: ${e.fehler.join('; ')}`)
      if (e.weps.length > 0) onEingespielt()
      setFertig(e)
    } catch (err) {
      setFehler(`Das Einspielen ist fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLaeuft(false)
    }
  }

  const schliessen = (
    <button type="button" className="knopf" disabled={laeuft} onClick={onSchliessen}>
      {fertig || fehler ? 'Schließen' : 'Abbrechen'}
    </button>
  )

  if (fertig) {
    return (
      <Dialog titel="WEP-Datei geöffnet" onSchliessen={onSchliessen}>
        <p role="status">{teilenErgebnisText(fertig)}</p>
        {fertig.fotosFehlen > 0 && <p className="neben">{n(fertig.fotosFehlen, 'Foto lag', 'Fotos lagen')} nicht in der Datei.</p>}
        {fehler && (
          <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
        )}
        <div className="dialog-knoepfe">
          {schliessen}
          {fertig.weps[0] && (
            <button type="button" className="knopf knopf-primaer" onClick={() => onWepOeffnen(fertig.weps[0].id)}>
              WEP öffnen
            </button>
          )}
        </div>
      </Dialog>
    )
  }
  if (!stand) {
    return (
      <Dialog titel="WEP-Datei öffnen" onSchliessen={onSchliessen}>
        {fehler ? (
          <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
        ) : (
          <Laedt />
        )}
        <div className="dialog-knoepfe">{schliessen}</div>
      </Dialog>
    )
  }

  const { vorschau: v, wahl } = stand
  const p = v.punkt
  const gewaehlt = anzahlGewaehlt(v, wahl)
  const setzeWahl = (w: TeilenWahl) => setStand({ ...stand, wahl: w })
  return (
    <Dialog titel="WEP-Datei öffnen" onSchliessen={onSchliessen}>
      <p className="neben">
        Datei vom {zeitDe(v.erstelltAm)}
        {v.appVersion ? ` (App ${v.appVersion})` : ''}. Es wird nichts überschrieben, was du nicht ausdrücklich wählst.
      </p>
      <div className="sicherung-zeile" role="region" aria-label="Vorschau der WEP-Datei">
        <div className="sicherung-kopf">
          <span className="zeile-titel">{p.titel}</span>
          <span className={p.status === 'anders' || p.status === 'im-papierkorb' ? 'status status-konflikt' : 'status'}>{STATUS_TEXT[p.status]}</span>
        </div>
        <p className="neben">{p.detail}</p>
        {p.status === 'gleich' && (
          <Meldung>
            <p>Dieses WEP ist auf diesem Gerät schon genau so vorhanden. Es gibt nichts einzuspielen.</p>
          </Meldung>
        )}
        {wepOptionen(v).length > 0 && (
          <select
            className="eingabe"
            aria-label={`Entscheidung für ${p.titel}`}
            value={wahl.wep}
            onChange={(e) => setzeWahl({ ...wahl, wep: e.target.value as TeilenWahl['wep'] })}
          >
            {wepOptionen(v).map((o) => (
              <option key={o} value={o}>
                {p.status === 'anders' && o === 'uebernehmen' ? 'Teile einzeln wählen' : WAHL_TEXT[o]}
              </option>
            ))}
          </select>
        )}
      </div>
      {p.status === 'anders' && wahl.wep === 'uebernehmen' && (
        <>
          <h3 className="gruppenkopf">Was soll aus der Datei übernommen werden?</h3>
          {v.teile.length === 0 ? (
            <p className="neben">Kein Teil der Datei weicht so ab, dass er übernommen werden könnte.</p>
          ) : (
            <ul className="liste">
              {v.teile.map((t) => (
                <li key={t.teil} className="sicherung-zeile">
                  <span className="zeile-titel">{t.titel}</span>
                  <p className="neben">{t.detail}</p>
                  <select
                    className="eingabe"
                    aria-label={`Entscheidung für ${t.titel}`}
                    value={wahl.teile[t.teil] ?? 'behalten'}
                    onChange={(e) => setzeWahl({ ...wahl, teile: { ...wahl.teile, [t.teil]: e.target.value as 'uebernehmen' | 'behalten' } })}
                  >
                    <option value="behalten">Stand auf diesem Gerät behalten</option>
                    <option value="uebernehmen">{TEIL_UEBERNEHMEN[t.teil]}</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {fehler && (
        <Meldung alarm>
          <p>{fehler}</p>
        </Meldung>
      )}
      <div className="dialog-knoepfe">
        {schliessen}
        <button type="button" className="knopf knopf-primaer" disabled={laeuft || gewaehlt === 0} onClick={() => void einspielen()}>
          Einspielen{gewaehlt > 0 && p.status === 'anders' && wahl.wep === 'uebernehmen' ? ` (${n(gewaehlt, 'Teil', 'Teile')})` : ''}
        </button>
      </div>
    </Dialog>
  )
}
