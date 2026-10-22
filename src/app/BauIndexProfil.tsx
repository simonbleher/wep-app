// Profil: Baupreisindex je Jahr (Beta 4, Paket 2). Die App bringt die Werte mit Quelle mit; hier lassen sie sich
// überschreiben oder für ein Jahr ergänzen, das die App noch nicht kennt. Wirkt auf alle neuen und offenen WEPs.
import { useId } from 'react'
import { BAUPREISINDEX, ermittleBaupreisindex } from '@/bau'
import { aendereProfil, type Profil } from '@/profil'
import { zahlDe } from '@/gruen/format'
import { ZahlFeld } from './BauKomponenten'

export function BaupreisindexProfil({ profil, onAendern }: { profil: Profil; onAendern: (p: Profil) => void }) {
  const id = useId()
  const jetzt = new Date().getFullYear()
  const eigene = profil.baupreisindex ?? {}
  const jahre = [
    ...new Set([jetzt + 1, jetzt, jetzt - 1, jetzt - 2, ...Object.keys(eigene).map(Number)]),
  ].sort((a, b) => b - a)

  function setze(jahr: number, wert: number | undefined) {
    const neu = { ...eigene }
    if (wert && wert > 0) neu[String(jahr)] = wert
    else delete neu[String(jahr)]
    onAendern(aendereProfil({ baupreisindex: Object.keys(neu).length ? neu : undefined }).profil)
  }

  return (
    <section className="abschnitt" aria-labelledby={`${id}-bpi`}>
      <h2 className="gruppenkopf" id={`${id}-bpi`}>
        Baupreisindex (Bau)
      </h2>
      <p className="neben">
        Index des IV. Quartals des Vorjahres für das ganze Folgejahr (2015 = 100, Richtlinie S. 11). Die App kennt die Werte {BAUPREISINDEX[0].jahr} bis {BAUPREISINDEX[BAUPREISINDEX.length - 1].jahr} (Amt für Statistik Berlin-Brandenburg). Trage hier einen Wert ein, um den der App zu überschreiben oder ein neues Jahr zu ergänzen.
      </p>
      <ul className="liste-frei">
        {jahre.map((j) => {
          const app = ermittleBaupreisindex(j)
          return (
            <li key={j}>
              <ZahlFeld
                label={`Index für ${j}`}
                wert={eigene[String(j)]}
                onChange={(v) => setze(j, v)}
                platzhalter={app && !app.ersatz ? zahlDe(app.wert, 1) : 'noch kein Wert'}
                hilfe={app && !app.ersatz ? `App: ${zahlDe(app.wert, 1)} – ${app.quelle}` : `Die App kennt den Wert für ${j} noch nicht (sie nimmt ersatzweise den letzten bekannten).`}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
