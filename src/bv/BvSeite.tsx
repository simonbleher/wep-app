// Einstieg /bv: Zugangsprüfung (Ziel 4), dann die Kontrollseite oder – unter /bv/admin, nur für Admins – die Freigaben.
import BvApp from './BvApp'
import { BvAdmin } from './BvAdmin'
import { BvZugang } from './BvZugang'

export default function BvSeite() {
  const admin = /^\/bv\/admin\/?$/.test(window.location.pathname)
  return <BvZugang>{(zugang) => (admin && zugang?.admin ? <BvAdmin /> : <BvApp zugang={zugang} />)}</BvZugang>
}
