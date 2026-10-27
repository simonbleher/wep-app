// /bv/admin: Anträge und Freigaben der BV-Kontrollseite verwalten (nur Admins, BV_ADMINS). Freigeben, sperren, löschen.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { ICON, Meldung, Rueckfrage, zeitDe } from '@/app/ui'
import { idToken } from './anmeldung'
import { aendereNutzer, ladeNutzer, type Nutzer, type Status } from './zugang'

const STATUS_TEXT: Record<Status, string> = { beantragt: 'beantragt', freigegeben: 'freigegeben', gesperrt: 'gesperrt' }
const STATUS_KLASSE: Record<Status, string> = { beantragt: 'neu', freigegeben: 'geprueft', gesperrt: 'rueckfrage' }

export function BvAdmin() {
  const [nutzer, setNutzer] = useState<Nutzer[]>()
  const [fehler, setFehler] = useState<string>()
  const [loeschen, setLoeschen] = useState<Nutzer>()

  const token = async () => {
    const t = await idToken()
    if (!t) throw new Error('Nicht angemeldet.')
    return t
  }
  const laden = useCallback(async () => {
    setFehler(undefined)
    try {
      setNutzer(await ladeNutzer(await token()))
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    document.title = 'WEP – Freigaben BV'
    void laden()
  }, [laden])

  async function aktion(n: Nutzer, a: 'freigeben' | 'sperren' | 'loeschen') {
    setFehler(undefined)
    try {
      setNutzer(await aendereNutzer(await token(), n, a))
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="bv">
      <main className="bv-inhalt">
        <header className="bv-detail-kopf">
          <a className="textknopf zurueck" href="/bv">
            <ChevronLeft {...ICON} />
            Kontrollseite
          </a>
          <h1 className="h1">Freigaben</h1>
          <p className="neben">Wer die Kontrollseite nutzen darf. Neue Anträge entstehen, wenn sich jemand zum ersten Mal anmeldet. Gespeichert sind nur Name, E-Mail und Status.</p>
        </header>
        {fehler && (
          <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
        )}
        {nutzer && nutzer.length === 0 && <p className="neben">Noch keine Anträge.</p>}
        {nutzer && nutzer.length > 0 && (
          <div className="ueb-scroll">
            <table className="ueb-tabelle bv-tabelle">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">E-Mail</th>
                  <th scope="col">Status</th>
                  <th scope="col">Beantragt</th>
                  <th scope="col">Geändert</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {nutzer.map((n) => (
                  <tr key={`${n.tid}:${n.oid}`}>
                    <td>{n.name}</td>
                    <td>{n.email}</td>
                    <td>
                      <span className={`bv-status bv-status-${STATUS_KLASSE[n.status]}`}>{STATUS_TEXT[n.status]}</span>
                    </td>
                    <td>{zeitDe(n.beantragtAm)}</td>
                    <td>
                      {zeitDe(n.geaendertAm)}
                      {n.geaendertVon && <span className="c-neben ueb-block">{n.geaendertVon}</span>}
                    </td>
                    <td>
                      <div className="knopf-reihe">
                        {n.status !== 'freigegeben' && (
                          <button type="button" className="knopf knopf-primaer" onClick={() => void aktion(n, 'freigeben')}>
                            Freigeben
                          </button>
                        )}
                        {n.status !== 'gesperrt' && (
                          <button type="button" className="knopf" onClick={() => void aktion(n, 'sperren')}>
                            Sperren
                          </button>
                        )}
                        <button type="button" className="knopf knopf-loeschen" onClick={() => setLoeschen(n)}>
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {loeschen && (
          <Rueckfrage
            titel={`${loeschen.name || loeschen.email} löschen?`}
            text="Der Eintrag verschwindet. Meldet sich die Person wieder an, entsteht ein neuer Antrag."
            bestaetigen="Löschen"
            onAbbrechen={() => setLoeschen(undefined)}
            onBestaetigen={() => {
              const n = loeschen
              setLoeschen(undefined)
              void aktion(n, 'loeschen')
            }}
          />
        )}
      </main>
    </div>
  )
}
