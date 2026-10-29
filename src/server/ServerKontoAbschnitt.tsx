// Server-Modus (v2): Abschnitt „Konto“ im Profil – angemeldet als, Rollen, Mail-Benachrichtigung, Konten verwalten
// (Admins), Kontrollseite BV, angemeldete Geräte, Abmelden. Ersetzt im Server-Modus die OneDrive-Anmeldung.
import { useEffect, useId, useState } from 'react'
import { ShieldCheck, Users } from 'lucide-react'
import { ICON, Meldung, datumDe } from '@/app/ui'
import { beendeSitzung, ladeSitzungen, setzeMailBenachrichtigung } from './api'
import { GERAET_TEXT, ROLLEN_TEXT, type ServerSitzung } from './typen'
import type { V2Sitzung } from './V2Tor'

export function ServerKontoAbschnitt({ sitzung, onKontenVerwalten, onBv }: { sitzung: V2Sitzung; onKontenVerwalten: () => void; onBv?: () => void }) {
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
        {onBv && (konto.rollen.includes('bv') || konto.rollen.includes('admin')) && (
          <button type="button" className="knopf" onClick={onBv}>
            <ShieldCheck {...ICON} />
            Kontrollseite BV
          </button>
        )}
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
      {!sitzung.offline && <Geraete />}
    </section>
  )
}

/** Angemeldete Geräte (Browser, Android-App, Windows-App); andere lassen sich abmelden, z. B. ein verlorenes Handy. */
function Geraete() {
  const id = useId()
  const [liste, setListe] = useState<ServerSitzung[]>()
  const [fehler, setFehler] = useState('')

  useEffect(() => {
    let aktiv = true
    ladeSitzungen()
      .then((l) => aktiv && setListe(l))
      .catch(() => undefined)
    return () => {
      aktiv = false
    }
  }, [])

  async function beenden(s: ServerSitzung) {
    setFehler('')
    try {
      setListe(await beendeSitzung(s.id))
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  if (!liste?.length) return null
  return (
    <>
      <h3 className="gruppenkopf" id={`${id}-geraete`}>
        Angemeldete Geräte
      </h3>
      <ul className="liste" aria-labelledby={`${id}-geraete`}>
        {liste.map((s) => (
          <li key={s.id} className="schalter-zeile">
            <span>
              {GERAET_TEXT[s.geraet]}
              {s.diese ? ' (dieses Gerät)' : ''}
              <span className="neben"> · angemeldet am {datumDe(s.erstelltAm.slice(0, 10))}</span>
            </span>
            {!s.diese && (
              <button type="button" className="textknopf" onClick={() => void beenden(s)}>
                Abmelden
              </button>
            )}
          </li>
        ))}
      </ul>
      {fehler && (
        <Meldung alarm>
          <p>{fehler}</p>
        </Meldung>
      )}
    </>
  )
}
