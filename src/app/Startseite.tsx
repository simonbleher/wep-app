// Startseite: Liste aller WEPs + Button „Neues WEP".
import { useEffect, useState } from 'react'
import { neuerWep, type Wep } from '@/model'
import { alleWeps, speichereWep, loescheWep } from './db'

interface Props {
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

export function Startseite({ onOeffnen }: Props) {
  const [weps, setWeps] = useState<Wep[]>([])
  const [geladen, setGeladen] = useState(false)

  useEffect(() => {
    void alleWeps().then((liste) => {
      setWeps(liste)
      setGeladen(true)
    })
  }, [])

  async function neuesWep() {
    const id = naechsteId(weps)
    const wep = neuerWep(id)
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
      </header>

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
