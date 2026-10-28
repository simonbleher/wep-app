// Einstieg /bv: Zugangsprüfung (Ziel 4), dann die Kontrollseite oder – unter /bv/admin, nur für Admins – die Freigaben.
// Im Server-Modus (v2): Anmeldung über den Server, Kontrollseite mit den abgegebenen WEPs vom Server (BV und Admin).
import BvApp from './BvApp'
import { BvAdmin } from './BvAdmin'
import { BvServerApp } from './BvServer'
import { BvZugang } from './BvZugang'
import { serverModus } from '@/server/modus'
import { V2Tor } from '@/server/V2Tor'

export default function BvSeite() {
  if (serverModus)
    return (
      <V2Tor>
        {(sitzung) =>
          sitzung.konto.rollen.includes('bv') || sitzung.konto.rollen.includes('admin') ? (
            <BvServerApp sitzung={sitzung} />
          ) : (
            <div className="bv">
              <main className="bv-inhalt bv-zugang">
                <h1 className="h1">Kontrollseite BV</h1>
                <p>Die Kontrollseite ist für Konten mit der Rolle BV. Der Admin vergibt sie unter „Konten verwalten“.</p>
                <a className="knopf" href="/">
                  Zur App
                </a>
              </main>
            </div>
          )
        }
      </V2Tor>
    )
  const admin = /^\/bv\/admin\/?$/.test(window.location.pathname)
  return <BvZugang>{(zugang) => (admin && zugang?.admin ? <BvAdmin /> : <BvApp zugang={zugang} />)}</BvZugang>
}
