// Bau-Excel am WEP (Beta 3, Paket 5): Karte mit Auswählen/Austauschen/Entfernen und der Abgleich der
// Formalien („Bau-Excel sagt … / im WEP steht …“, Auswahl je Feld). Die Logik steht in src/bauexcel;
// hier nur Oberfläche und Zustand.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CloudDownload, FileSpreadsheet, RefreshCw, Trash2, Upload } from 'lucide-react'
import { hatBauTeil, hatGruenTeil, wepRolle, type BauExcel, type Formalien, type Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import {
  beiBauExcelAenderung,
  dbBauAblage,
  entferneBauExcel,
  ladeBauExcelNach,
  leseHinterlegteFormalien,
  leseHinterlegtenInhalt,
  setzeBauExcel,
} from '@/bauexcel'
import {
  fuelleLeereFelder,
  pruefeFormalien,
  wendeAbgleichAn,
  type FormalienAbgleich,
  type FormalienFeld,
} from '@/bauexcel/abgleich'
import { offeneZeilen, pruefeAlles, uebernimmAlles, type BauExcelInhalt, type Liste, type ListenAbgleich } from '@/bauexcel/uebernahme'
import type { BauExcelRecord } from '@/bauexcel/types'
import type { BauFormalien } from '@/export/bauExcelLesen'
import { parzelleAusBauExcel, setzeParzelle } from '@/parzelle'
import { fotoNetzStatus, ladeBauExcelAusOneDrive, type FotoNetz } from '@/sync'
import { Dialog, ICON, Meldung, Rueckfrage } from './ui'

export const BAU_EXCEL_ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

export interface BauStand {
  record?: BauExcelRecord
  /** Ausgefüllte Formalien der hinterlegten Datei; undefined, solange sie nicht auf diesem Gerät liegt. */
  formalien?: BauFormalien
  /** Bau- und Grün-Teil der hinterlegten Datei (alles außer den Formalien). */
  inhalt?: BauExcelInhalt
}

/** Eintrag der Bau-Excel dieses Geräts und ihre gelesenen Formalien; lädt neu, sobald sich etwas ändert. */
export function useBauStand(wep: Wep | null): BauStand {
  const [stand, setStand] = useState<BauStand>({})
  const version = wep?.bauExcel?.version
  const wepId = wep?.id
  const lade = useCallback(() => {
    if (!wep || !wep.bauExcel) {
      setStand({})
      return
    }
    void (async () => {
      const record = (await dbBauAblage.alleRecords()).find((r) => r.wepId === wep.id)
      let formalien: BauFormalien | undefined
      try {
        formalien = await leseHinterlegteFormalien(wep)
      } catch {
        formalien = undefined
      }
      setStand({ record, formalien })
      // Übriger Inhalt danach: die Formalien erscheinen so ohne Verzögerung
      if (!formalien) return
      try {
        const inhalt = await leseHinterlegtenInhalt(wep)
        setStand((alt) => (alt.record === record ? { ...alt, inhalt } : alt))
      } catch {
        // Zugabe: ohne lesbaren Inhalt gibt es nichts anzubieten
      }
    })()
    // Nur bei anderer Datei/anderem WEP; nicht bei jeder Änderung an den Formalien
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wepId, version])
  useEffect(() => {
    lade()
    return beiBauExcelAenderung(lade)
  }, [lade])
  return stand
}

export interface BauNachladeStand {
  laeuft: boolean
  netz: FotoNetz
  /** Die Datei muss aus OneDrive geholt werden, ist aber noch nicht da. */
  fehlt: boolean
  /** In OneDrive liegt noch die ältere Fassung (das andere Gerät hat die neue noch nicht hochgeladen). */
  veraltet: boolean
  jetztLaden: () => void
}

/** Lädt die Bau-Excel beim Öffnen des WEP nach, wenn sie hier fehlt (wie die Fotos; „nur WLAN“ gilt). */
export function useBauNachladen(wep: Wep | null, stand: BauStand): BauNachladeStand {
  const [laeuft, setLaeuft] = useState(false)
  const [netz, setNetz] = useState<FotoNetz>('ok')
  const [veraltet, setVeraltet] = useState(false)
  const [erzwingen, setErzwingen] = useState(0)
  const version = wep?.bauExcel?.version
  const hatDatei = !!stand.record?.hatDatei && !stand.record.geloescht && stand.record.version === version
  const fehlt = !!version && !hatDatei

  useEffect(() => {
    if (!wep || !fehlt) return
    let aktiv = true
    void (async () => {
      const status = await fotoNetzStatus()
      if (!aktiv) return
      setNetz(status)
      if (status === 'kein-konto' || status === 'offline' || (status === 'nur-wlan' && erzwingen === 0)) return
      setLaeuft(true)
      try {
        const erg = await ladeBauExcelNach({ wep, quelle: { hole: ladeBauExcelAusOneDrive } })
        if (aktiv) setVeraltet(erg === 'veraltet')
      } finally {
        if (aktiv) setLaeuft(false)
      }
    })()
    return () => {
      aktiv = false
    }
    // Nur bei anderer Datei oder auf Wunsch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wep?.id, version, fehlt, erzwingen])

  return { laeuft, netz, fehlt, veraltet, jetztLaden: () => setErzwingen((n) => n + 1) }
}

// ---------------------------------------------------------------------------
// Karte (reine Darstellung)
// ---------------------------------------------------------------------------

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Zeile „auf diesem Gerät · in OneDrive“ usw. */
export function bauStatusText(bauExcel: BauExcel, stand: BauStand, nachladen: BauNachladeStand): string {
  const r = stand.record
  const lokal = !!r && r.hatDatei && !r.geloescht && r.version === bauExcel.version
  if (lokal) return r.hochgeladen ? 'auf diesem Gerät · in OneDrive' : 'auf diesem Gerät · wartet auf Upload'
  if (nachladen.laeuft) return 'wird aus OneDrive geladen …'
  if (nachladen.veraltet) return 'noch nicht auf diesem Gerät · in OneDrive liegt noch die alte Fassung'
  if (nachladen.netz === 'nur-wlan') return 'noch nicht auf diesem Gerät · wird im WLAN geladen'
  if (nachladen.netz === 'kein-konto') return 'noch nicht auf diesem Gerät · nur mit OneDrive-Konto ladbar'
  if (nachladen.netz === 'offline') return 'noch nicht auf diesem Gerät · wird mit Netz geladen'
  return 'noch nicht auf diesem Gerät'
}

export interface BauExcelKarteProps {
  bauExcel?: BauExcel
  stand: BauStand
  nachladen: BauNachladeStand
  /** Anzahl Angaben der Bau-Excel, die noch nicht abgeglichen sind (leere Felder und Unterschiede). */
  offeneAngaben: number
  /** Einträge der Bau-Excel (Baulichkeiten, Außenanlagen, Aufwuchs …), die im WEP noch fehlen. */
  offeneEintraege?: number
  beschaeftigt?: boolean
  onWaehlen: () => void
  onAustauschen: () => void
  onEntfernen: () => void
  onAbgleichen: () => void
  onInhalt?: () => void
}

export function BauExcelKarte(p: BauExcelKarteProps) {
  if (!p.bauExcel) {
    return (
      <>
        <p className="neben">
          Falls der Bau-Wertermittler seine Excel-Datei schon ausgefüllt hat: hier wählen. Sie bleibt am WEP (auch auf deinen
          anderen Geräten), die Formalien werden daraus vorbefüllt und der Export nimmt sie automatisch. Ohne Datei wird die
          leere Vorlage verwendet.
        </p>
        <button type="button" className="knopf knopf-breit" disabled={p.beschaeftigt} onClick={p.onWaehlen}>
          <Upload {...ICON} />
          Bau-Excel auswählen
        </button>
      </>
    )
  }
  const b = p.bauExcel
  return (
    <>
      <div className="zeile datei" data-testid="bau-excel-karte">
        <FileSpreadsheet {...ICON} />
        <span className="zeile-text">
          <span className="zeile-titel einzeilig">{b.name}</span>
          <span className="neben">
            {kb(b.groesse)} · {bauStatusText(b, p.stand, p.nachladen)}
          </span>
        </span>
      </div>
      <div className="knopf-reihe">
        <button type="button" className="knopf" disabled={p.beschaeftigt} onClick={p.onAustauschen}>
          <RefreshCw {...ICON} />
          Austauschen
        </button>
        <button type="button" className="knopf" disabled={p.beschaeftigt} onClick={p.onEntfernen}>
          <Trash2 {...ICON} />
          Entfernen
        </button>
        {p.nachladen.fehlt && !p.nachladen.laeuft && p.nachladen.netz === 'nur-wlan' && (
          <button type="button" className="knopf" onClick={p.nachladen.jetztLaden}>
            <CloudDownload {...ICON} />
            Jetzt laden
          </button>
        )}
      </div>
      {p.stand.formalien && p.offeneAngaben > 0 && !b.abgeglichen && (
        <Meldung>
          <p>
            Die Bau-Excel enthält {p.offeneAngaben} Angabe{p.offeneAngaben === 1 ? '' : 'n'} für die Formalien, die noch nicht
            abgeglichen {p.offeneAngaben === 1 ? 'ist' : 'sind'}.
          </p>
          <button type="button" className="textknopf" onClick={p.onAbgleichen}>
            Formalien abgleichen
          </button>
        </Meldung>
      )}
      {p.stand.inhalt && (p.offeneEintraege ?? 0) > 0 && p.onInhalt && (
        <Meldung>
          <p>
            Die Bau-Excel enthält {p.offeneEintraege} Eintr{p.offeneEintraege === 1 ? 'ag' : 'äge'} (Baulichkeiten, Mängel, Abwasser,
            Außenanlagen, Aufwuchs, Beseitigung …), die im WEP noch fehlen.
          </p>
          <button type="button" className="textknopf" onClick={p.onInhalt}>
            Inhalt übernehmen
          </button>
        </Meldung>
      )}
      {p.stand.formalien && (b.abgeglichen || p.offeneAngaben === 0) && (
        <button type="button" className="textknopf textknopf-leise" onClick={p.onAbgleichen}>
          Formalien erneut vergleichen
        </button>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Abgleich-Dialog: je Feld wählen
// ---------------------------------------------------------------------------

export type Wahl = 'bau' | 'wep'

export function AbgleichDialog({
  abgleich,
  dateiName,
  onUebernehmen,
  onSpaeter,
}: {
  abgleich: FormalienAbgleich
  dateiName: string
  onUebernehmen: (waehleBau: ReadonlySet<keyof Formalien>) => void
  onSpaeter: () => void
}) {
  const id = useId()
  // Nichts überschreiben, solange der Nutzer nicht gewählt hat: Voreinstellung ist der Wert im WEP
  const [wahl, setWahl] = useState<Record<string, Wahl>>({})
  const gewaehlt = (f: FormalienFeld): Wahl => wahl[f.feld] ?? 'wep'
  const setzeAlle = (w: Wahl) => setWahl(Object.fromEntries(abgleich.unterschiede.map((f) => [f.feld, w])))
  const mitBau = new Set(abgleich.unterschiede.filter((f) => gewaehlt(f) === 'bau').map((f) => f.feld))

  return (
    <Dialog titel="Formalien abgleichen" onSchliessen={onSpaeter}>
      <p className="neben">
        In der Bau-Excel „{dateiName}“ steht bei {abgleich.unterschiede.length === 1 ? 'einem Feld' : `${abgleich.unterschiede.length} Feldern`}{' '}
        etwas anderes als im WEP. Wähle je Feld, was gelten soll.
        {abgleich.neu.length > 0 && ` ${abgleich.neu.length} leere${abgleich.neu.length === 1 ? 's Feld wird' : ' Felder werden'} aus der Bau-Excel ergänzt.`}
      </p>
      <ul className="abgleich-liste" aria-label="Unterschiede zwischen Bau-Excel und WEP">
        {abgleich.unterschiede.map((f) => (
          <li key={f.feld} className="abgleich-feld">
            <fieldset>
              <legend className="zeile-titel">{f.name}</legend>
              <label className="abgleich-wahl">
                <input
                  type="radio"
                  name={`${id}-${f.feld}`}
                  checked={gewaehlt(f) === 'bau'}
                  onChange={() => setWahl((w) => ({ ...w, [f.feld]: 'bau' }))}
                />
                <span>
                  <span className="neben">Bau-Excel sagt</span>
                  <strong>{f.bau}</strong>
                </span>
              </label>
              <label className="abgleich-wahl">
                <input
                  type="radio"
                  name={`${id}-${f.feld}`}
                  checked={gewaehlt(f) === 'wep'}
                  onChange={() => setWahl((w) => ({ ...w, [f.feld]: 'wep' }))}
                />
                <span>
                  <span className="neben">Im WEP steht</span>
                  <strong>{f.wep}</strong>
                </span>
              </label>
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="knopf-reihe">
        <button type="button" className="textknopf" onClick={() => setzeAlle('bau')}>
          Alle aus der Bau-Excel
        </button>
        <button type="button" className="textknopf" onClick={() => setzeAlle('wep')}>
          Alle im WEP lassen
        </button>
      </div>
      <div className="dialog-knoepfe">
        <button type="button" className="knopf" onClick={onSpaeter}>
          Später
        </button>
        <button type="button" className="knopf knopf-primaer" onClick={() => onUebernehmen(mitBau)}>
          Übernehmen
        </button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Bau-Teil (Baulichkeiten, Mängel, Beseitigung) übernehmen
// ---------------------------------------------------------------------------

export function InhaltUebernehmenDialog({
  abgleich,
  dateiName,
  wirdBeides,
  onUebernehmen,
  onSpaeter,
}: {
  abgleich: readonly ListenAbgleich[]
  dateiName: string
  /** Das WEP hat bisher nur einen Teil (Grün oder Bau): mit der Übernahme bekommt es beide. */
  wirdBeides: boolean
  onUebernehmen: (listen: ReadonlySet<Liste>) => void
  onSpaeter: () => void
}) {
  const mitNeuem = abgleich.filter((l) => l.neu.length > 0)
  const [abgewaehlt, setAbgewaehlt] = useState<ReadonlySet<Liste>>(new Set())
  const gewaehlt = new Set(mitNeuem.map((l) => l.liste).filter((l) => !abgewaehlt.has(l)))
  const umschalten = (l: Liste) =>
    setAbgewaehlt((alt) => {
      const neu = new Set(alt)
      if (neu.has(l)) neu.delete(l)
      else neu.add(l)
      return neu
    })
  return (
    <Dialog titel="Inhalt der Bau-Excel übernehmen" onSchliessen={onSpaeter}>
      <p className="neben">
        In „{dateiName}“ stehen schon Angaben (Baulichkeiten, Mängel, Abwasser, Außenanlagen, Aufwuchs, Beseitigung …). Sie können ins
        WEP übernommen werden, damit Excel und PDF alles enthalten. Was im WEP schon steht, bleibt unverändert.
        {wirdBeides && ' Das WEP bekommt dazu die fehlenden Reiter (Bau bzw. Grün).'}
      </p>
      <ul className="abgleich-liste" aria-label="Inhalt der Bau-Excel">
        {mitNeuem.map((l) => (
          <li key={l.liste} className="abgleich-feld">
            <label className="abgleich-wahl">
              <input type="checkbox" checked={gewaehlt.has(l.liste)} onChange={() => umschalten(l.liste)} />
              <span>
                <strong>
                  {l.name}: {l.neu.length} Eintr{l.neu.length === 1 ? 'ag' : 'äge'} übernehmen
                </strong>
                {l.gleich > 0 && <span className="neben"> ({l.gleich} schon im WEP)</span>}
              </span>
            </label>
            <ul className="neben">
              {l.neu.map((z, i) => (
                <li key={`${z.text}-${i}`}>
                  {z.text}
                  {z.detail ? ` – ${z.detail}` : ''}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="dialog-knoepfe">
        <button type="button" className="knopf" onClick={onSpaeter}>
          Später
        </button>
        <button type="button" className="knopf knopf-primaer" disabled={gewaehlt.size === 0} onClick={() => onUebernehmen(gewaehlt)}>
          Übernehmen
        </button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Bereich: Karte + Dateiauswahl + Rückfragen + Abgleich
// ---------------------------------------------------------------------------

export function BauExcelBereich({
  wep,
  aendere,
  leseWep,
  stand,
  nachladen,
  titel,
}: {
  wep: Wep
  aendere: WepAendern
  /** Der neueste Stand des WEP (die Bau-Excel kommt asynchron an). */
  leseWep: () => Wep | null
  stand: BauStand
  nachladen: BauNachladeStand
  titel?: string
}) {
  const eingabe = useRef<HTMLInputElement>(null)
  const id = useId()
  const [frage, setFrage] = useState<'austauschen' | 'entfernen' | null>(null)
  const [beschaeftigt, setBeschaeftigt] = useState(false)
  const [fehler, setFehler] = useState<string>()
  const [info, setInfo] = useState<string>()
  const [dialog, setDialog] = useState<{ bau: BauFormalien; abgleich: FormalienAbgleich; name: string }>()
  const [bauDialog, setBauDialog] = useState<{ inhalt: BauExcelInhalt; abgleich: ListenAbgleich[]; name: string }>()

  const abgleich = stand.formalien ? pruefeFormalien(wep.formalien, stand.formalien) : undefined
  const offeneAngaben = abgleich ? abgleich.neu.length + abgleich.unterschiede.length : 0
  const offeneBau = stand.inhalt ? offeneZeilen(pruefeAlles(wep, stand.inhalt)) : 0

  // Beim ersten Öffnen mit einer neuen Bau-Excel (auch „Neues WEP aus Bau-Excel“) einmal fragen, ob ihr Inhalt übernommen werden soll
  const bauExcel = wep.bauExcel
  useEffect(() => {
    if (!bauExcel || bauExcel.bauTeilGefragt || !stand.inhalt || offeneBau === 0) return
    setBauDialog({ inhalt: stand.inhalt, abgleich: pruefeAlles(leseWep() ?? wep, stand.inhalt), name: bauExcel.name })
    void aendere((w) => (w.bauExcel ? { ...w, bauExcel: { ...w.bauExcel, bauTeilGefragt: true } } : w))
    // Nur wenn der Inhalt der Datei geladen ist
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stand.inhalt, bauExcel?.version, bauExcel?.bauTeilGefragt])

  async function waehle(datei: File) {
    setFehler(undefined)
    setInfo(undefined)
    setBeschaeftigt(true)
    try {
      const erg = await setzeBauExcel({ wepId: wep.id, datei, aktuell: leseWep()?.bauExcel ?? wep.bauExcel, aendere })
      if (erg.unveraendert) {
        setInfo('Diese Bau-Excel ist schon hinterlegt.')
        return
      }
      await gleicheAb(erg.bau, datei.name, erg.ersetzt)
      await uebernehmeParzelleAusExcel(datei)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setBeschaeftigt(false)
    }
  }

  /**
   * Beta 6, Paket 1: Die Form „Grundstück“ der Bau-Excel wird zur Parzelle des WEP – aber nur, wenn es noch keine gibt
   * (eine vorhandene wird nie überschrieben).
   */
  async function uebernehmeParzelleAusExcel(datei: Blob) {
    if ((leseWep() ?? wep).parzelle) return
    try {
      const r = await parzelleAusBauExcel(new Uint8Array(await datei.arrayBuffer()), new Date().toISOString())
      if (r.parzelle) {
        const parzelle = r.parzelle
        await aendere((w) => (w.parzelle ? w : setzeParzelle(w, parzelle)))
        setInfo((alt) => [alt, r.hinweis].filter(Boolean).join(' '))
      }
    } catch {
      // Die Parzelle ist eine Zugabe: ein unlesbares Blatt „Skizze Bau“ ändert nichts an der übernommenen Bau-Excel
    }
  }

  /** Leere Felder füllen; gibt es Unterschiede, fragt der Dialog je Feld. */
  async function gleicheAb(bau: BauFormalien, name: string, ersetzt: boolean) {
    const aktuell = leseWep() ?? wep
    const ab = pruefeFormalien(aktuell.formalien, bau)
    await aendere((w) => fuelleLeereFelder(w, bau))
    const verb = ersetzt ? 'ausgetauscht' : 'hinterlegt'
    if (ab.unterschiede.length) {
      setDialog({ bau, abgleich: ab, name })
      setInfo(`Bau-Excel ${verb}.${ab.neu.length ? ` ${ab.neu.length} leere Felder ergänzt.` : ''}`)
    } else {
      setInfo(
        `Bau-Excel ${verb}. ${ab.neu.length ? `${ab.neu.length} Feld${ab.neu.length === 1 ? '' : 'er'} der Formalien aus der Bau-Excel übernommen.` : 'In den Formalien war nichts zu ergänzen.'}`,
      )
    }
  }

  async function zeigeInhalt() {
    setFehler(undefined)
    setInfo(undefined)
    try {
      const aktuell = leseWep() ?? wep
      const inhalt = stand.inhalt ?? (await leseHinterlegtenInhalt(aktuell))
      if (!inhalt) {
        setFehler('Die Bau-Excel liegt noch nicht auf diesem Gerät.')
        return
      }
      const ab = pruefeAlles(aktuell, inhalt)
      if (offeneZeilen(ab) === 0) setInfo('Der Inhalt der Bau-Excel steht schon im WEP.')
      else setBauDialog({ inhalt, abgleich: ab, name: aktuell.bauExcel?.name ?? 'Bau-Excel' })
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  async function uebernehmeInhalt(listen: ReadonlySet<Liste>) {
    const d = bauDialog
    setBauDialog(undefined)
    if (!d) return
    await aendere((w) => uebernimmAlles(w, d.inhalt, listen))
    const n = d.abgleich.filter((l) => listen.has(l.liste)).reduce((s, l) => s + l.neu.length, 0)
    setInfo(`${n} Eintr${n === 1 ? 'ag' : 'äge'} aus der Bau-Excel übernommen. Was im WEP schon stand, ist unverändert.`)
  }

  async function vergleicheNochmal() {
    setFehler(undefined)
    setInfo(undefined)
    try {
      const aktuell = leseWep() ?? wep
      const bau = await leseHinterlegteFormalien(aktuell)
      if (!bau) {
        setFehler('Die Bau-Excel liegt noch nicht auf diesem Gerät.')
        return
      }
      const ab = pruefeFormalien(aktuell.formalien, bau)
      if (ab.unterschiede.length) setDialog({ bau, abgleich: ab, name: aktuell.bauExcel?.name ?? 'Bau-Excel' })
      else {
        await aendere((w) => fuelleLeereFelder(w, bau))
        setInfo(ab.neu.length ? `${ab.neu.length} Feld${ab.neu.length === 1 ? '' : 'er'} aus der Bau-Excel übernommen.` : 'Die Formalien stimmen mit der Bau-Excel überein.')
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  async function uebernehme(waehleBau: ReadonlySet<keyof Formalien>) {
    const d = dialog
    setDialog(undefined)
    if (!d) return
    await aendere((w) => wendeAbgleichAn(w, d.bau, waehleBau))
    setInfo(
      waehleBau.size
        ? `${waehleBau.size} Feld${waehleBau.size === 1 ? '' : 'er'} aus der Bau-Excel übernommen, der Rest im WEP bleibt.`
        : 'Die Formalien im WEP bleiben unverändert.',
    )
  }

  async function entferne() {
    setFrage(null)
    setFehler(undefined)
    try {
      await entferneBauExcel({ wepId: wep.id, aendere })
      setInfo('Bau-Excel entfernt. Der Export nimmt jetzt die leere Vorlage. Übernommene Formalien bleiben.')
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  function oeffneAuswahl() {
    setFrage(null)
    eingabe.current?.click()
  }

  return (
    <section className="abschnitt" aria-labelledby={`${id}-bau`}>
      <h2 className="gruppenkopf" id={`${id}-bau`}>
        {titel ?? 'Bau-Excel'}
      </h2>
      <input
        ref={eingabe}
        type="file"
        hidden
        accept={BAU_EXCEL_ACCEPT}
        aria-label="Bau-Excel wählen"
        data-testid="bau-excel-eingabe"
        onChange={(e) => {
          const datei = e.target.files?.[0]
          e.target.value = '' // dieselbe Datei später erneut wählbar
          if (datei) void waehle(datei)
        }}
      />
      <BauExcelKarte
        bauExcel={wep.bauExcel}
        stand={stand}
        nachladen={nachladen}
        offeneAngaben={offeneAngaben}
        offeneEintraege={offeneBau}
        beschaeftigt={beschaeftigt}
        onWaehlen={oeffneAuswahl}
        onAustauschen={() => setFrage('austauschen')}
        onEntfernen={() => setFrage('entfernen')}
        onAbgleichen={() => void vergleicheNochmal()}
        onInhalt={() => void zeigeInhalt()}
      />
      {fehler && (
        <Meldung alarm>
          <p>{fehler}</p>
        </Meldung>
      )}
      {info && (
        <p className="neben" role="status">
          {info}
        </p>
      )}

      {frage === 'austauschen' && (
        <Rueckfrage
          titel="Bau-Excel austauschen?"
          text={`Die bisherige Bau-Excel „${wep.bauExcel?.name ?? ''}“ wird durch die neue Datei ersetzt, auch in OneDrive und auf deinen anderen Geräten. Danach werden die Formalien noch einmal verglichen.`}
          bestaetigen="Datei wählen"
          onAbbrechen={() => setFrage(null)}
          onBestaetigen={oeffneAuswahl}
        />
      )}
      {frage === 'entfernen' && (
        <Rueckfrage
          titel="Bau-Excel entfernen?"
          text={`Die Datei „${wep.bauExcel?.name ?? ''}“ wird vom WEP gelöst und in OneDrive gelöscht. Die bereits übernommenen Formalien bleiben. Der Export nimmt dann die leere Vorlage.`}
          bestaetigen="Entfernen"
          onAbbrechen={() => setFrage(null)}
          onBestaetigen={() => void entferne()}
        />
      )}
      {bauDialog && (
        <InhaltUebernehmenDialog
          abgleich={bauDialog.abgleich}
          dateiName={bauDialog.name}
          wirdBeides={!(hatBauTeil(wepRolle(leseWep() ?? wep)) && hatGruenTeil(wepRolle(leseWep() ?? wep)))}
          onUebernehmen={(l) => void uebernehmeInhalt(l)}
          onSpaeter={() => setBauDialog(undefined)}
        />
      )}
      {dialog && (
        <AbgleichDialog
          abgleich={dialog.abgleich}
          dateiName={dialog.name}
          onUebernehmen={(w) => void uebernehme(w)}
          onSpaeter={() => setDialog(undefined)}
        />
      )}
    </section>
  )
}
