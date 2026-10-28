// Server-Modus (v2): Abschnitt „Konto“ im Profil – angemeldet als, Rollen, Mail-Benachrichtigung, Konten verwalten
// (Admins), Abmelden. Ersetzt im Server-Modus die OneDrive-Anmeldung.
import { useId, useState } from 'react'
import { Users } from 'lucide-react'
import { ICON, Meldung } from '@/app/ui'
import { setzeMailBenachrichtigung } from './api'
import { ROLLEN_TEXT } from './typen'
import type { V2Sitzung } from './V2Tor'

export function ServerKontoAbschnitt({ sitzung, onKontenVerwalten }: { sitzung: V2Sitzung; onKontenVerwalten: () => void }) {
  const id = useId()
  const { konto } = sitzung
  const [fehler, setFehler] = useState('')
  const rollen = konto.rollen.map((r) => ROLLEN_TEXT[r]).join(', ') || 'noch keine'

  async function mail(an: boolean) {
    setFehler('')
    try {
      sitzung.aktualisiere(await setzeMailBenachrichtigung(an))
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="abschnitt" aria-labelledby={`${id}-konto`}>
      <h2 className="gruppenkopf" id={`${id}-konto`}>
        Konto
      </h2>
      <p>
        Angemeldet als {konto.name || konto.email}
        {konto.email && konto.name ? ` (${konto.email})` : ''} über {konto.anbieter === 'google' ? 'Google' : 'Microsoft'}
      </p>
      <p className="neben">Rollen: {rollen}</p>
      {sitzung.offline && <p className="neben">Ohne Verbindung zum Server – du arbeitest auf diesem Gerät weiter.</p>}
      <div>
        <label className="schalter-zeile" htmlFor={`${id}-mail`}>
          <span>Benachrichtigungen per E-Mail</span>
          <input
            id={`${id}-mail`}
            type="checkbox"
            role="switch"
            className="schalter"
            checked={konto.mailBenachrichtigung}
            disabled={sitzung.offline}
            onChange={(e) => void mail(e.target.checked)}
          />
        </label>
      </div>
      <p className="neben">Die Mails nennen nur Vorgangs-Nr., Anlage und Parzelle und enthalten einen Link – keine Namen, keine Beträge.</p>
      {fehler && (
        <Meldung alarm>
          <p>{fehler}</p>
        </Meldung>
      )}
      <div className="knopf-reihe">
        {konto.rollen.includes('admin') && (
          <button type="button" className="knopf" onClick={onKontenVerwalten}>
            <Users {...ICON} />
            Konten verwalten
          </button>
        )}
        <button type="button" className="knopf" onClick={() => void sitzung.abmelden()}>
          Abmelden
        </button>
      </div>
    </section>
  )
}
