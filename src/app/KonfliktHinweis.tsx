// Hinweis an einem WEP mit offenem Konflikt (Beta 3, Paket 2):
// - „Auf zwei Geräten geändert“: neuere Fassung gilt, die andere ist gesichert →
//   „Diese Fassung behalten“ / „Andere Fassung übernehmen“
// - „Gelöscht und danach geändert“: das WEP bleibt erhalten → „WEP behalten“ / „Doch löschen“
// Nach der Entscheidung räumt der nächste Abgleich die Konflikt-Kopie in OneDrive auf.
import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { Wep } from '@/model'
import { loeseKonflikt, type KonfliktWahl } from '@/sync/aktionen'
import type { KonfliktInfo } from '@/sync/types'
import { ICON, zeitDe } from './ui'

/** Kurzbeschreibung einer Fassung, damit man vergleichen kann: „Parzelle 42 · 5 Positionen“. */
export function fassungInfo(w: Wep): string {
  const n = w.gruen.aussenanlagen.length + w.gruen.aufwuchs.length + w.gruen.beseitigungAA.length
  return [w.formalien.parzelle.trim(), n === 1 ? '1 Position' : `${n} Positionen`].filter(Boolean).join(' · ')
}

interface Props {
  wepId: string
  /** Die angezeigte (aktuell gültige) Fassung. */
  wep: Wep
  konflikt: KonfliktInfo
  /** Nach der Entscheidung: die danach gültige Fassung (undefined = WEP wurde gelöscht). */
  onGeloest: (wep?: Wep) => void
}

export function KonfliktHinweis({ wepId, wep, konflikt, onGeloest }: Props) {
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const zwei = konflikt.art === 'zwei-geraete'

  async function entscheide(wahl: KonfliktWahl) {
    setLaeuft(true)
    setFehler('')
    try {
      const r = await loeseKonflikt(wepId, wahl)
      onGeloest(r?.wep)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      setLaeuft(false)
    }
  }

  return (
    <section className="warnung konflikt" role="note" aria-labelledby={`konflikt-${wepId}`}>
      <TriangleAlert {...ICON} size={20} />
      <div className="warnung-text">
        {zwei ? (
          <>
            <strong id={`konflikt-${wepId}`}>Auf zwei Geräten geändert</strong>
            <p>
              Dieses WEP wurde auf zwei Geräten gleichzeitig geändert. Du siehst die neuere Fassung; die andere ist
              gesichert.
            </p>
            <dl className="konflikt-fassungen">
              <div>
                <dt>Diese Fassung</dt>
                <dd>{fassungInfo(wep)}</dd>
              </div>
              {konflikt.fassung && (
                <div>
                  <dt>Andere Fassung</dt>
                  <dd>
                    {fassungInfo(konflikt.fassung)}
                    {konflikt.fassungGeaendertAm && <> · geändert {zeitDe(konflikt.fassungGeaendertAm)}</>}
                  </dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <>
            <strong id={`konflikt-${wepId}`}>Gelöscht und danach geändert</strong>
            <p>
              {konflikt.geloeschtWo === 'hier'
                ? 'Du hast dieses WEP gelöscht, aber auf einem anderen Gerät wurde es danach noch geändert.'
                : 'Dieses WEP wurde auf einem anderen Gerät gelöscht, aber hier danach noch geändert.'}{' '}
              Es bleibt erhalten, bis du entscheidest.
            </p>
          </>
        )}
        <div className="knopf-reihe">
          <button type="button" className="knopf" disabled={laeuft} onClick={() => void entscheide('diese')}>
            {zwei ? 'Diese Fassung behalten' : 'WEP behalten'}
          </button>
          <button type="button" className="knopf" disabled={laeuft} onClick={() => void entscheide('andere')}>
            {zwei ? 'Andere Fassung übernehmen' : 'Doch löschen'}
          </button>
        </div>
        {fehler && <p role="alert">{fehler}</p>}
      </div>
    </section>
  )
}
