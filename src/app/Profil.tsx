// Profil und Einstellungen: Name, Rolle, Standard-Anlage (werden über OneDrive
// abgeglichen), Geräte-Einstellungen (nur lokal), Konto, App-Version, Speicherort.
import { useEffect, useId, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
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
import { AndroidTest } from './AndroidTest'
import { HauptSeitenleiste, ICON, Kopf } from './ui'

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
    <div className="rahmen">
      <HauptSeitenleiste aktiv="profil" onProtokolle={onZurueck} onProfil={() => undefined} />

      <main className="inhalt">
        <Kopf
          titel="Profil"
          links={
            <button type="button" className="zurueck" onClick={onZurueck}>
              <ChevronLeft {...ICON} />
              Protokolle
            </button>
          }
        />
        <header className="seitenkopf">
          <h1 className="h1">Profil und Einstellungen</h1>
        </header>

        <section className="abschnitt" aria-labelledby={`${id}-wm`}>
          <h2 className="gruppenkopf" id={`${id}-wm`}>
            Wertermittler
          </h2>
          <div className="feld">
            <label className="label" htmlFor={`${id}-name`}>
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
          <div className="feld">
            <label className="label" htmlFor={`${id}-rolle`}>
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
          <div className="feld">
            <label className="label" htmlFor={`${id}-anlage`}>
              Standard-Kleingartenanlage (Vorbelegung neuer WEPs)
            </label>
            <input
              id={`${id}-anlage`}
              className="eingabe"
              value={profil.standardAnlage}
              onChange={(e) => aendern({ standardAnlage: e.target.value })}
            />
          </div>
          <p className="neben">
            {konto
              ? 'Name, Rolle und Anlage werden mit deinen anderen Geräten abgeglichen.'
              : 'Ohne Konto bleiben diese Angaben auf diesem Gerät.'}
          </p>
        </section>

        <section className="abschnitt" aria-labelledby={`${id}-geraet`}>
          <h2 className="gruppenkopf" id={`${id}-geraet`}>
            Dieses Gerät
          </h2>
          <div>
            <label className="schalter-zeile" htmlFor={`${id}-wlan`}>
              <span>Upload nur über WLAN</span>
              <input
                id={`${id}-wlan`}
                type="checkbox"
                role="switch"
                className="schalter"
                checked={nurWlan}
                onChange={(e) => {
                  setNurWlan(e.target.checked)
                  speichereGeraeteEinstellungen({ nurWlan: e.target.checked })
                  if (Capacitor.isNativePlatform()) {
                    void import('@/android').then((m) => m.planeHintergrundUpload())
                  }
                }}
              />
            </label>
          </div>
          <p className="neben">Wirkt in der Android-App. Im Browser wird die Einstellung nur gespeichert.</p>
        </section>

        <section className="abschnitt" aria-labelledby={`${id}-konto`}>
          <h2 className="gruppenkopf" id={`${id}-konto`}>
            Konto
          </h2>
          {konto ? (
            <>
              <p>Angemeldet als {konto.benutzername || konto.name}</p>
              <div className="knopf-reihe">
                <button type="button" className="knopf" onClick={onAbmelden}>
                  Abmelden
                </button>
              </div>
            </>
          ) : verfuegbar ? (
            <>
              <p>Nicht angemeldet. Die WEPs liegen nur auf diesem Gerät.</p>
              <div className="knopf-reihe">
                <button type="button" className="knopf" onClick={onAnmelden}>
                  Mit Microsoft anmelden
                </button>
              </div>
              <p className="neben">Beim ersten Abgleich werden die vorhandenen WEPs hochgeladen.</p>
            </>
          ) : (
            <p>Die Anmeldung ist in dieser Installation nicht eingerichtet.</p>
          )}
        </section>

        {Capacitor.isNativePlatform() && <AndroidTest />}

        <section className="abschnitt" aria-labelledby={`${id}-app`}>
          <h2 className="gruppenkopf" id={`${id}-app`}>
            Über die App
          </h2>
          <dl className="werte">
            <div>
              <dt>Version</dt>
              <dd>{__APP_VERSION__}</dd>
            </div>
            <div>
              <dt>Speicherort</dt>
              <dd>
                Auf diesem Gerät (Browser-Speicher)
                {konto ? '; Abgleich in OneDrive, Ordner Apps/WEP-App' : ''}
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  )
}
