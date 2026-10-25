// Profil und Einstellungen: Name, Rolle, Standard-Anlage (werden über OneDrive
// abgeglichen), Geräte-Einstellungen (nur lokal), Konto, App-Version, Speicherort.
import { useEffect, useId, useRef, useState } from 'react'
import { BookOpen, ChevronLeft } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import type { Konto } from '@/konto'
import {
  ROLLEN,
  aendereProfil,
  ladeGeraeteEinstellungen,
  lokalesProfil,
  speichereGeraeteEinstellungen,
  wendeKontrastAn,
  type Profil as ProfilDaten,
  type Rolle,
} from '@/profil'
import { BaupreisindexProfil } from './BauIndexProfil'
import { EigenePositionen } from './EigenePositionen'
import { KgaAuswahl } from './KgaAuswahl'
import { Fehlersuche } from './Fehlersuche'
import { Sicherung } from './Sicherung'
import { Synchronisierung } from './Synchronisierung'
import { Unterschrift } from './Unterschrift'
import { UpdateHinweis, UpdateStandZeilen } from './UpdateHinweis'
import { hatSelbstUpdate, ladeUpdateDienst } from './updateModul'
import { ladeWebAppNeu, versionText } from './versionText'
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
  const [sonne, setSonne] = useState(() => ladeGeraeteEinstellungen().sonnenKontrast)
  const [ohneExcel, setOhneExcel] = useState(() => ladeGeraeteEinstellungen().ohneExcel)
  const nativ = Capacitor.isNativePlatform()
  // Android-App oder Windows-Programm: Selbst-Update (Anzeige, Knopf „Nach Update suchen“)
  const mitUpdate = hatSelbstUpdate()
  const [fehlersuche, setFehlersuche] = useState(false)
  const [updateMeldung, setUpdateMeldung] = useState('')
  const [suche, setSuche] = useState(false)
  const druckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** Langes Drücken auf die Version öffnet das ausführliche Upload-Protokoll. */
  const druckStart = () => {
    if (!nativ) return
    druckTimer.current = setTimeout(() => setFehlersuche(true), 800)
  }
  const druckEnde = () => clearTimeout(druckTimer.current)

  async function nachUpdateSuchen() {
    setSuche(true)
    setUpdateMeldung('')
    const m = await ladeUpdateDienst()
    const s = await m?.pruefeUndMerke(true)
    setUpdateMeldung(s?.meldung ?? '')
    setSuche(false)
  }

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
        {/* Anleitung liegt als eigene Seite unter public/anleitung/ (auch offline, siehe vite.config.ts). Gleiches Fenster,
            damit es auch in der Android- und Windows-App funktioniert; dort führt „Zurück zur App“ hierher zurück. */}
        <a className="knopf knopf-breit" href={`${import.meta.env.BASE_URL}anleitung/index.html`} style={{ marginBottom: 24, color: 'inherit', textDecoration: 'none' }}>
          <BookOpen {...ICON} />
          Anleitung
        </a>

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
          <KgaAuswahl
            label="Standard-Kleingartenanlage (Vorbelegung neuer WEPs)"
            wert={profil.standardAnlage}
            onChange={(v) => aendern({ standardAnlage: v })}
          />
          <p className="neben">
            {konto
              ? 'Name, Rolle und Anlage werden mit deinen anderen Geräten abgeglichen.'
              : 'Ohne Konto bleiben diese Angaben auf diesem Gerät.'}
          </p>
        </section>

        <Unterschrift konto={konto !== null} />

        {profil.rolle !== 'gruen' && <BaupreisindexProfil profil={profil} onAendern={setProfil} />}

        <EigenePositionen id={`${id}-eigene`} konto={konto !== null} />

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
          <p className="neben">Gilt für Fotos und den Hintergrund-Upload der Android-App. Im Browser wirkt sie für Fotos nur, wenn der Browser die Verbindungsart meldet.</p>
          <div>
            <label className="schalter-zeile" htmlFor={`${id}-sonne`}>
              <span>Sonnen-Kontrast</span>
              <input
                id={`${id}-sonne`}
                type="checkbox"
                role="switch"
                className="schalter"
                checked={sonne}
                onChange={(e) => {
                  setSonne(e.target.checked)
                  speichereGeraeteEinstellungen({ sonnenKontrast: e.target.checked })
                  wendeKontrastAn(e.target.checked)
                }}
              />
            </label>
          </div>
          <p className="neben">Kräftigere Linien und Texte und größere Schrift, damit alles im Freien bei Sonne lesbar bleibt. Gilt nur für dieses Gerät.</p>
          <div>
            <label className="schalter-zeile" htmlFor={`${id}-ohne-excel`}>
              <span>Ohne Excel arbeiten</span>
              <input
                id={`${id}-ohne-excel`}
                type="checkbox"
                role="switch"
                className="schalter"
                checked={ohneExcel}
                onChange={(e) => {
                  setOhneExcel(e.target.checked)
                  speichereGeraeteEinstellungen({ ohneExcel: e.target.checked })
                }}
              />
            </label>
          </div>
          <p className="neben">
            An (Standard): Alle Excel-Funktionen sind ausgeblendet – Excel-Export, Bau-Excel hinterlegen und übernehmen, „Neues WEP aus Bau-Excel“.
            Das PDF bleibt. Bereits gespeicherte Daten und Bau-Excel-Dateien bleiben erhalten. Gilt nur für dieses Gerät.
          </p>
        </section>

        <Sicherung id={`${id}-sicherung`} appVersion={__APP_VERSION__} />

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

        {nativ && <Synchronisierung id={`${id}-sync`} />}
        {nativ && fehlersuche && <Fehlersuche />}

        <section className="abschnitt" aria-labelledby={`${id}-app`}>
          <h2 className="gruppenkopf" id={`${id}-app`}>
            Über die App
          </h2>
          <dl className="werte">
            <div
              onPointerDown={druckStart}
              onPointerUp={druckEnde}
              onPointerLeave={druckEnde}
              onPointerCancel={druckEnde}
              onContextMenu={(e) => nativ && e.preventDefault()}
            >
              <dt>Version</dt>
              <dd>{versionText()}</dd>
            </div>
            {mitUpdate && <UpdateStandZeilen />}
            <div>
              <dt>Speicherort</dt>
              <dd>
                Auf diesem Gerät (Browser-Speicher)
                {konto ? '; Abgleich in OneDrive, Ordner Apps/WEP-App' : ''}
              </dd>
            </div>
          </dl>
          {!mitUpdate && !nativ && (
            <div className="knopf-reihe">
              <button type="button" className="knopf" onClick={() => void ladeWebAppNeu()}>
                Neueste Version laden
              </button>
            </div>
          )}
          {mitUpdate && (
            <>
              <UpdateHinweis />
              <div className="knopf-reihe">
                <button type="button" className="knopf" disabled={suche} onClick={() => void nachUpdateSuchen()}>
                  {suche ? 'Suche …' : 'Nach Update suchen'}
                </button>
              </div>
              {updateMeldung && (
                <p className="neben" role="status">
                  {updateMeldung}
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
