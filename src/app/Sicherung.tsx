// Profil → „Sicherung“: alle Daten dieses Geräts als eine Datei sichern und eine Sicherung wieder
// einspielen. Beim Einspielen zeigt eine Vorschau, was neu und was abweichend ist; ohne Auswahl wird
// nichts überschrieben.
import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import {
  SicherungsFehler,
  erstelleSicherung,
  erstelleVorschau,
  leseSicherung,
  lokalerStand,
  lokalesZiel,
  spieleEin,
  standardEntscheidungen,
  WAHL_TEXT,
  type EinspielErgebnis,
  type Entscheidungen,
  type GeleseneSicherung,
  type Punkt,
  type SicherungsZaehlung,
  type Vorschau,
} from '@/sicherung'
import { ICON, Meldung, zeitDe } from './ui'
import { speichereDatei } from './dateiSpeichern'
import { useOhneExcel } from './ohneExcel'

const LETZTE_KEY = 'wep-letzte-sicherung'

export function ladeLetzteSicherung(): string | undefined {
  try {
    return localStorage.getItem(LETZTE_KEY) ?? undefined
  } catch {
    return undefined
  }
}
function merkeLetzteSicherung(iso: string): void {
  try {
    localStorage.setItem(LETZTE_KEY, iso)
  } catch {
    /* nur Komfort */
  }
}

const STATUS_TEXT: Record<Punkt['status'], string> = {
  neu: 'Neu',
  gleich: 'Gleich',
  anders: 'Weicht ab',
  'im-papierkorb': 'Im Papierkorb',
  vorhanden: 'Vorhanden',
}

const n = (anzahl: number, einzahl: string, mehrzahl: string) => `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`

/** Kurzer Satz zum Ergebnis des Einspielens. */
export function ergebnisText(e: EinspielErgebnis): string {
  const teile = [
    e.weps.length ? n(e.weps.length, 'WEP', 'WEPs') : '',
    e.papierkorb ? `${n(e.papierkorb, 'WEP', 'WEPs')} im Papierkorb` : '',
    e.eigene ? n(e.eigene, 'eigene Position', 'eigene Positionen') : '',
    e.profil ? 'Profil' : '',
    e.fotos ? n(e.fotos, 'Foto', 'Fotos') : '',
    e.bauExcel ? n(e.bauExcel, 'Bau-Excel', 'Bau-Excel-Dateien') : '',
  ].filter(Boolean)
  return teile.length ? `Eingespielt: ${teile.join(', ')}.` : 'Es wurde nichts eingespielt.'
}

/** Kurzer Satz zum Inhalt einer erstellten Sicherung. */
export function inhaltText(z: SicherungsZaehlung): string {
  const teile = [
    n(z.weps, 'WEP', 'WEPs'),
    z.papierkorb ? `${z.papierkorb} im Papierkorb` : '',
    z.eigenePositionen ? n(z.eigenePositionen, 'eigene Position', 'eigene Positionen') : '',
    z.fotos ? n(z.fotos, 'Foto', 'Fotos') : '',
    z.bauExcel ? n(z.bauExcel, 'Bau-Excel', 'Bau-Excel-Dateien') : '',
  ].filter(Boolean)
  return teile.join(', ')
}

export function Sicherung({ id, appVersion }: { id: string; appVersion: string }) {
  const [mitFotos, setMitFotos] = useState(false)
  const [mitBau, setMitBau] = useState(false)
  const ohneExcel = useOhneExcel()
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<{ text: string; alarm?: boolean }>()
  const [letzte, setLetzte] = useState(ladeLetzteSicherung)
  const [geoeffnet, setGeoeffnet] = useState<{ sicherung: GeleseneSicherung; vorschau: Vorschau; wahl: Entscheidungen }>()
  const eingabe = useRef<HTMLInputElement>(null)

  async function erstellen() {
    setLaeuft(true)
    setMeldung(undefined)
    try {
      const s = await erstelleSicherung(lokalerStand, { mitFotos, mitBauExcel: mitBau, appVersion })
      const gespeichert = await speichereDatei(s.blob, s.dateiname)
      if (gespeichert === 'abgebrochen') {
        setMeldung({ text: 'Die Sicherung wurde nicht gespeichert (abgebrochen).' })
        return
      }
      const jetzt = new Date().toISOString()
      merkeLetzteSicherung(jetzt)
      setLetzte(jetzt)
      const fehlt = s.inhalt.fotosOhneDatei + s.inhalt.bauExcelOhneDatei
      setMeldung({
        text:
          `Sicherung ${s.dateiname} erstellt: ${inhaltText(s.inhalt)}.` +
          (fehlt ? ` ${n(fehlt, 'Datei fehlt', 'Dateien fehlen')} auf diesem Gerät (nur in OneDrive) und ${fehlt === 1 ? 'ist' : 'sind'} nicht enthalten.` : ''),
      })
    } catch (e) {
      setMeldung({ text: `Die Sicherung ist fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, alarm: true })
    } finally {
      setLaeuft(false)
    }
  }

  async function oeffnen(datei: File) {
    setLaeuft(true)
    setMeldung(undefined)
    try {
      const sicherung = await leseSicherung(datei)
      const vorschau = await erstelleVorschau(sicherung, lokalerStand)
      setGeoeffnet({ sicherung, vorschau, wahl: standardEntscheidungen(vorschau) })
    } catch (e) {
      setMeldung({ text: e instanceof SicherungsFehler ? e.message : `Die Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`, alarm: true })
    } finally {
      setLaeuft(false)
    }
  }

  async function einspielen() {
    if (!geoeffnet) return
    setLaeuft(true)
    try {
      const e = await spieleEin({ ...geoeffnet, lokal: lokalerStand, ziel: lokalesZiel })
      setGeoeffnet(undefined)
      setMeldung({
        text: `${ergebnisText(e)}${e.fotosFehlen ? ` ${n(e.fotosFehlen, 'Foto lag', 'Fotos lagen')} nicht in der Sicherung.` : ''}${e.fehler.length ? ` Fehler: ${e.fehler.join('; ')}` : ''}`,
        alarm: e.fehler.length > 0,
      })
    } catch (err) {
      setMeldung({ text: `Das Einspielen ist fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, alarm: true })
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <section className="abschnitt" aria-labelledby={`${id}-titel`}>
      <h2 className="gruppenkopf" id={`${id}-titel`}>
        Sicherung
      </h2>
      {!geoeffnet && (
        <>
          <p className="neben">
            Eine Datei mit allen WEPs, dem Papierkorb, den eigenen Positionen und dem Profil. Zusätzlich zum Abgleich über OneDrive, z. B. vor einem Gerätewechsel.
          </p>
          <div>
            <label className="schalter-zeile" htmlFor={`${id}-fotos`}>
              <span>Fotos einschließen (große Datei)</span>
              <input id={`${id}-fotos`} type="checkbox" role="switch" className="schalter" checked={mitFotos} onChange={(e) => setMitFotos(e.target.checked)} />
            </label>
            {!ohneExcel && (
            <label className="schalter-zeile" htmlFor={`${id}-bau`}>
              <span>Bau-Excel-Dateien einschließen</span>
              <input id={`${id}-bau`} type="checkbox" role="switch" className="schalter" checked={mitBau} onChange={(e) => setMitBau(e.target.checked)} />
            </label>
            )}
          </div>
          <div className="knopf-reihe">
            <button type="button" className="knopf" disabled={laeuft} onClick={() => void erstellen()}>
              <Download {...ICON} />
              Sicherung erstellen
            </button>
            <button type="button" className="knopf" disabled={laeuft} onClick={() => eingabe.current?.click()}>
              <Upload {...ICON} />
              Sicherung einspielen
            </button>
          </div>
          <input
            ref={eingabe}
            type="file"
            hidden
            accept=".zip,application/zip"
            aria-label="Sicherungsdatei wählen"
            data-testid="sicherung-eingabe"
            onChange={(e) => {
              const datei = e.target.files?.[0]
              e.target.value = ''
              if (datei) void oeffnen(datei)
            }}
          />
          <p className="neben">{letzte ? `Letzte Sicherung auf diesem Gerät: ${zeitDe(letzte)}.` : 'Auf diesem Gerät wurde noch keine Sicherung erstellt.'}</p>
        </>
      )}
      {meldung &&
        (meldung.alarm ? (
          <Meldung alarm>
            <p>{meldung.text}</p>
          </Meldung>
        ) : (
          <p className="neben" role="status">
            {meldung.text}
          </p>
        ))}
      {geoeffnet && (
        <VorschauAnsicht
          vorschau={geoeffnet.vorschau}
          wahl={geoeffnet.wahl}
          laeuft={laeuft}
          onWahl={(schluessel, w) => setGeoeffnet({ ...geoeffnet, wahl: { ...geoeffnet.wahl, [schluessel]: w } })}
          onEinspielen={() => void einspielen()}
          onAbbrechen={() => setGeoeffnet(undefined)}
        />
      )}
    </section>
  )
}

export function VorschauAnsicht({
  vorschau,
  wahl,
  laeuft = false,
  onWahl,
  onEinspielen,
  onAbbrechen,
}: {
  vorschau: Vorschau
  wahl: Entscheidungen
  laeuft?: boolean
  onWahl: (schluessel: string, w: Entscheidungen[string]) => void
  onEinspielen: () => void
  onAbbrechen: () => void
}) {
  const gruppen: { titel: string; punkte: Punkt[] }[] = [
    { titel: 'WEPs', punkte: vorschau.weps },
    { titel: 'Papierkorb', punkte: vorschau.papierkorb },
    { titel: 'Eigene Positionen', punkte: vorschau.eigene },
    { titel: 'Profil', punkte: vorschau.profil ? [vorschau.profil] : [] },
  ]
  const schonDa = gruppen.reduce((s, g) => s + g.punkte.filter((p) => p.optionen.length === 0).length, 0)
  const anzahlGewaehlt = Object.entries(wahl).filter(([, w]) => w === 'uebernehmen' || w === 'kopie').length
  return (
    <div className="sicherung-vorschau" role="region" aria-label="Vorschau der Sicherung">
      <h3 className="h2">Vorschau</h3>
      <p className="neben">
        Sicherung vom {zeitDe(vorschau.erstelltAm)}
        {vorschau.appVersion ? ` (App ${vorschau.appVersion})` : ''}. Es wird nichts überschrieben, was du nicht ausdrücklich wählst.
      </p>
      {!vorschau.hatAenderungen && (
        <Meldung>
          <p>Alles aus dieser Sicherung ist auf diesem Gerät schon vorhanden. Es gibt nichts einzuspielen.</p>
        </Meldung>
      )}
      {gruppen.map((g) => {
        const zeilen = g.punkte.filter((p) => p.optionen.length > 0)
        if (zeilen.length === 0) return null
        return (
          <div key={g.titel}>
            <h4 className="gruppenkopf">{g.titel}</h4>
            <ul className="liste">
              {zeilen.map((p) => (
                <li key={p.schluessel} className="sicherung-zeile">
                  <div className="sicherung-kopf">
                    <span className="zeile-titel">{p.titel}</span>
                    <span className={p.status === 'anders' || p.status === 'im-papierkorb' ? 'status status-konflikt' : 'status'}>{STATUS_TEXT[p.status]}</span>
                  </div>
                  <p className="neben">{p.detail}</p>
                  <select
                    className="eingabe"
                    aria-label={`Entscheidung für ${p.titel}`}
                    value={wahl[p.schluessel] ?? p.standard}
                    onChange={(e) => onWahl(p.schluessel, e.target.value as Entscheidungen[string])}
                  >
                    {p.optionen.map((o) => (
                      <option key={o} value={o}>
                        {o === 'uebernehmen' && p.status === 'anders' ? 'Aus der Sicherung übernehmen (ersetzt den Stand hier)' : WAHL_TEXT[o]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {schonDa > 0 && <p className="neben">{n(schonDa, 'Eintrag ist', 'Einträge sind')} schon genau so vorhanden und bleibt unverändert.</p>}
      <div className="knopf-reihe">
        <button type="button" className="knopf knopf-primaer" disabled={laeuft || anzahlGewaehlt === 0} onClick={onEinspielen}>
          Einspielen{anzahlGewaehlt > 0 ? ` (${anzahlGewaehlt})` : ''}
        </button>
        <button type="button" className="knopf" disabled={laeuft} onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
