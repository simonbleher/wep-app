// Profil und Einstellungen: Name, Rolle, Standard-Anlage (werden über OneDrive
// abgeglichen), Geräte-Einstellungen (nur lokal), Konto, App-Version, Speicherort.
import { useEffect, useId, useState } from 'react'
import type { Konto } from '@/konto'
import {
  ROLLEN,
  aendereProfil,
  ladeGeraeteEinstellungen,
  lokalesProfil,
  speichereGeraeteEinstellungen,
  type Profil as ProfilDaten,
  type Rolle,
} from '@/profil'

interface Props {
  konto: Konto | null
  verfuegbar: boolean
  onZurueck: () => void
  onAnmelden: () => void
  onAbmelden: () => void
}

export function Profil({ konto, verfuegbar, onZurueck, onAnmelden, onAbmelden }: Props) {
  const id = useId()
  const [profil, setProfil] = useState<ProfilDaten>(() => lokalesProfil.lade().profil)
  const [nurWlan, setNurWlan] = useState(() => ladeGeraeteEinstellungen().nurWlan)

  useEffect(() => {
    setProfil(lokalesProfil.lade().profil)
  }, [])

  function aendern(teil: Partial<ProfilDaten>) {
    setProfil(aendereProfil(teil).profil)
  }

  return (
    <main className="seite">
      <header className="kopf">
        <button type="button" className="btn" onClick={onZurueck}>
          Zurück
        </button>
        <h1>Profil</h1>
      </header>

      <section className="formular">
        <h2 className="abschnitt-titel">Wertermittler</h2>
        <div className="eingabe-gruppe">
          <label className="eingabe-label" htmlFor={`${id}-name`}>
            Name (wird Wertermittler in neuen WEPs)
          </label>
          <input
            id={`${id}-name`}
            className="eingabe"
            value={profil.name}
            autoComplete="name"
            onChange={(e) => aendern({ name: e.target.value })}
          />
        </div>
        <div className="eingabe-gruppe">
          <label className="eingabe-label" htmlFor={`${id}-rolle`}>
            Rolle
          </label>
          <select
            id={`${id}-rolle`}
            className="eingabe"
            value={profil.rolle}
            onChange={(e) => aendern({ rolle: e.target.value as Rolle })}
          >
            {ROLLEN.map((r) => (
              <option key={r.wert} value={r.wert}>
                {r.text}
              </option>
            ))}
          </select>
        </div>
        <div className="eingabe-gruppe">
          <label className="eingabe-label" htmlFor={`${id}-anlage`}>
            Standard-Kleingartenanlage (Vorbelegung neuer WEPs)
          </label>
          <input
            id={`${id}-anlage`}
            className="eingabe"
            value={profil.standardAnlage}
            onChange={(e) => aendern({ standardAnlage: e.target.value })}
          />
        </div>
        <p className="hinweis">
          {konto
            ? 'Name, Rolle und Anlage werden mit deinen anderen Geräten abgeglichen.'
            : 'Ohne Konto bleiben diese Angaben auf diesem Gerät.'}
        </p>
      </section>

      <section className="formular">
        <h2 className="abschnitt-titel">Dieses Gerät</h2>
        <label className="zeile-schalter">
          <input
            type="checkbox"
            checked={nurWlan}
            onChange={(e) => {
              setNurWlan(e.target.checked)
              speichereGeraeteEinstellungen({ nurWlan: e.target.checked })
            }}
          />
          <span>Upload nur über WLAN</span>
        </label>
        <p className="hinweis">Wirkt in der Android-App. Im Browser wird die Einstellung nur gespeichert.</p>
      </section>

      <section className="formular">
        <h2 className="abschnitt-titel">Konto</h2>
        {konto ? (
          <>
            <p>Angemeldet als {konto.benutzername || konto.name}</p>
            <button type="button" className="btn" onClick={onAbmelden}>
              Abmelden
            </button>
          </>
        ) : verfuegbar ? (
          <>
            <p>Nicht angemeldet. Die WEPs liegen nur auf diesem Gerät.</p>
            <button type="button" className="btn" onClick={onAnmelden}>
              Mit Microsoft anmelden
            </button>
            <p className="hinweis">Beim ersten Abgleich werden die vorhandenen WEPs hochgeladen.</p>
          </>
        ) : (
          <p>Die Anmeldung ist in dieser Installation nicht eingerichtet.</p>
        )}
      </section>

      <section className="formular">
        <h2 className="abschnitt-titel">Über die App</h2>
        <dl className="daten-liste">
          <dt>Version</dt>
          <dd>{__APP_VERSION__}</dd>
          <dt>Speicherort</dt>
          <dd>
            Auf diesem Gerät (Browser-Speicher)
            {konto ? '; Abgleich in OneDrive, Ordner Apps/WEP-App' : ''}
          </dd>
        </dl>
      </section>
    </main>
  )
}
