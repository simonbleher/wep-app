// Startseite: Liste aller WEPs + Button „Neues WEP".
import { useCallback, useEffect, useState } from 'react'
import type { Wep } from '@/model'
import type { Konto } from '@/konto'
import { lokalesProfil, neuerWepMitProfil } from '@/profil'
import { alleWeps, speichereWep, loescheWep } from './db'
import { SyncLeiste } from './SyncLeiste'

interface Props {
  /** Angemeldetes Konto oder null („ohne Konto“). */
  konto: Konto | null
  /** Ist die Anmeldung auf dieser Plattform eingerichtet? */
  verfuegbar: boolean
  onProfil: () => void
  /** Öffnet die Detailansicht des WEP mit der angegebenen id. */
  onOeffnen: (wepId: string) => void
}

/**
 * Erzeugt eine neue Vorgangs-Nr. der Form "<Jahr>-<lfd. Nummer>".
 * Die laufende Nummer ergibt sich aus den bereits vorhandenen WEPs des Jahres.
 */
function naechsteId(vorhandene: Wep[]): string {
  const jahr = new Date().getFullYear()
  const prefix = `${jahr}-`
  const nummern = vorhandene
    .filter((w) => w.id.startsWith(prefix))
    .map((w) => Number.parseInt(w.id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
  const naechste = (nummern.length ? Math.max(...nummern) : 0) + 1
  return `${prefix}${String(naechste).padStart(3, '0')}`
}

/** Anzeigename eines WEP für die Liste. */
function bezeichnung(wep: Wep): string {
  const { parzelle, kleingartenanlage } = wep.formalien
  const teile = [kleingartenanlage, parzelle].filter((t) => t.trim().length > 0)
  return teile.length ? teile.join(' · ') : 'ohne Bezeichnung'
}

export function Startseite({ konto, verfuegbar, onProfil, onOeffnen }: Props) {
  const [weps, setWeps] = useState<Wep[]>([])
  const [geladen, setGeladen] = useState(false)

  const neuLaden = useCallback(() => {
    void alleWeps().then((liste) => {
      setWeps(liste)
      setGeladen(true)
    })
  }, [])

  useEffect(neuLaden, [neuLaden])

  async function neuesWep() {
    const id = naechsteId(weps)
    const wep = neuerWepMitProfil(id, lokalesProfil.lade().profil)
    await speichereWep(wep)
    setWeps((alt) => [...alt, wep])
    onOeffnen(id)
  }

  async function loeschen(id: string) {
    if (!window.confirm(`WEP ${id} wirklich löschen?`)) return
    await loescheWep(id)
    setWeps((alt) => alt.filter((w) => w.id !== id))
  }

  return (
    <main className="seite">
      <header className="kopf">
        <h1>Wertermittlungsprotokolle</h1>
        <button
          type="button"
          className="btn btn-symbol kopf-rechts"
          aria-label="Profil und Einstellungen"
          onClick={onProfil}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        </button>
      </header>

      <SyncLeiste konto={konto} verfuegbar={verfuegbar} onGeaendert={neuLaden} />

      <button type="button" className="btn btn-primary btn-gross" onClick={neuesWep}>
        ➕ Neues WEP
      </button>

      {!geladen ? (
        <p className="hinweis">Lade …</p>
      ) : weps.length === 0 ? (
        <p className="hinweis">
          Noch kein Protokoll vorhanden. Mit „Neues WEP" ein erstes Protokoll
          anlegen.
        </p>
      ) : (
        <ul className="liste">
          {weps.map((wep) => (
            <li key={wep.id} className="karte">
              <button
                type="button"
                className="karte-haupt"
                onClick={() => onOeffnen(wep.id)}
              >
                <span className="karte-id">{wep.id}</span>
                <span className="karte-titel">{bezeichnung(wep)}</span>
              </button>
              <button
                type="button"
                className="btn btn-gefahr"
                aria-label={`WEP ${wep.id} löschen`}
                onClick={() => loeschen(wep.id)}
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
