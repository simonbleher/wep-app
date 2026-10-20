// Fotos am WEP (Beta 3, Paket 4): Registerkarte „Fotos“, Fotogruppe je Position bzw. fürs WEP
// allgemein, Großansicht mit Text und Löschen. Die Bilder werden beim Speichern verkleinert
// (src/fotos); angezeigt werden Vorschaubilder, die große Datei erst in der Großansicht.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, CloudUpload, ImageOff, Images, Trash2, X } from 'lucide-react'
import type { Foto, Wep } from '@/model'
import { dbAblage } from '@/fotos/ablage'
import { positionsListe } from '@/fotos/benennung'
import {
  beiFotoAenderung,
  fuegeFotosHinzu,
  ladeFehlendeFotos,
  loescheFoto,
  setzeFotoText,
  type WepAendern,
} from '@/fotos'
import type { FotoRecord } from '@/fotos/types'
import { fotoNetzStatus, ladeFotoAusOneDrive, offeneFotoAnzahl, type FotoNetz } from '@/sync'
import { aktuellesKonto, kontoVerfuegbar } from '@/konto'
import { Dialog, ICON, LeerZustand, Meldung, Rueckfrage } from './ui'

// ---------------------------------------------------------------------------
// Zustand: Verwaltungseinträge (mit Vorschau) des WEP
// ---------------------------------------------------------------------------

/** Verwaltungseinträge der Fotos eines WEP; lädt neu, sobald sich Fotos ändern. */
export function useFotoRecords(wepId: string): Map<string, FotoRecord> {
  const [records, setRecords] = useState<Map<string, FotoRecord>>(new Map())
  const lade = useCallback(() => {
    void dbAblage.recordsVon(wepId).then((liste) => setRecords(new Map(liste.map((r) => [r.id, r]))))
  }, [wepId])
  useEffect(() => {
    lade()
    return beiFotoAenderung(lade)
  }, [lade])
  return records
}

/** Object-URL für ein Bild (wird beim Wechsel freigegeben). */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export interface NachladeStand {
  /** Es werden gerade Fotos aus OneDrive geladen. */
  laeuft: boolean
  fertig: number
  gesamt: number
  /** Warum nicht automatisch geladen wird (z. B. nur WLAN). */
  netz: FotoNetz
  /** Fotos, die noch fehlen (auf diesem Gerät nicht vorhanden). */
  fehlend: number
  /** Jetzt laden, auch wenn „nur WLAN“ gilt. */
  jetztLaden: () => void
}

/**
 * Lädt beim Öffnen des WEP die Fotos nach, die nur in OneDrive liegen (auf einem anderen Gerät
 * aufgenommen). Nicht im Mobilfunk, wenn „nur WLAN“ gilt – dort bietet die Fotos-Ansicht „Jetzt laden“ an.
 */
export function useFotoNachladen(wep: Wep | null, records: Map<string, FotoRecord>): NachladeStand {
  const [stand, setStand] = useState({ laeuft: false, fertig: 0, gesamt: 0 })
  const [netz, setNetz] = useState<FotoNetz>('ok')
  const [erzwingen, setErzwingen] = useState(0)
  const laeuftRef = useRef(false)
  const fotos = wep?.fotos ?? []
  const fehlend = fotos.filter((f) => !records.get(f.id)?.hatDatei).length
  const schluessel = fotos.map((f) => f.id).join(',')

  useEffect(() => {
    if (!wep || !fehlend || laeuftRef.current) return
    let aktiv = true
    void (async () => {
      const status = await fotoNetzStatus()
      if (!aktiv) return
      setNetz(status)
      if (status === 'kein-konto' || status === 'offline' || (status === 'nur-wlan' && erzwingen === 0)) return
      laeuftRef.current = true
      setStand({ laeuft: true, fertig: 0, gesamt: fehlend })
      try {
        await ladeFehlendeFotos({
          wep,
          quelle: { hole: ladeFotoAusOneDrive },
          beiFortschritt: (fertig, gesamt) => aktiv && setStand({ laeuft: true, fertig, gesamt }),
        })
      } finally {
        laeuftRef.current = false
        if (aktiv) setStand({ laeuft: false, fertig: 0, gesamt: 0 })
      }
    })()
    return () => {
      aktiv = false
    }
    // Nur bei neuen/anderen Fotos oder auf Wunsch; nicht bei jeder Änderung am WEP
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wep?.id, schluessel, erzwingen])

  return { ...stand, netz, fehlend, jetztLaden: () => setErzwingen((n) => n + 1) }
}

// ---------------------------------------------------------------------------
// Fotogruppe: Kacheln + Aufnehmen/Galerie
// ---------------------------------------------------------------------------

function Kachel({ foto, record, laedt, onOeffnen }: { foto: Foto; record?: FotoRecord; laedt?: boolean; onOeffnen: () => void }) {
  const url = useObjectUrl(record?.vorschau)
  return (
    <button type="button" className="foto-kachel" onClick={onOeffnen} aria-label={foto.text ? `Foto: ${foto.text}` : 'Foto ansehen'}>
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="foto-platzhalter">
          <ImageOff {...ICON} />
          <span>{laedt ? 'Lädt …' : 'Noch nicht geladen'}</span>
        </span>
      )}
      {foto.text && <span className="foto-text">{foto.text}</span>}
    </button>
  )
}

/**
 * Die Fotos einer Position (positionId) oder des WEP allgemein (ohne positionId) mit den Knöpfen
 * „Foto aufnehmen“ und „Aus Galerie“.
 */
export function FotoGruppe({
  wep,
  positionId,
  aendere,
  records,
  titel,
  leerText,
  laedt,
}: {
  wep: Wep
  positionId?: string
  aendere: WepAendern
  records: Map<string, FotoRecord>
  titel: string
  leerText?: string
  /** Es werden gerade Fotos aus OneDrive nachgeladen. */
  laedt?: boolean
}) {
  const [verarbeite, setVerarbeite] = useState<{ fertig: number; gesamt: number } | null>(null)
  const [fehler, setFehler] = useState<string[]>([])
  const [offen, setOffen] = useState<string | null>(null)
  const kamera = useRef<HTMLInputElement>(null)
  const galerie = useRef<HTMLInputElement>(null)
  const id = useId()
  const fotos = (wep.fotos ?? []).filter((f) => (f.positionId ?? undefined) === positionId)

  async function hinzufuegen(dateien: FileList | null) {
    if (!dateien?.length) return
    const liste = Array.from(dateien)
    setFehler([])
    setVerarbeite({ fertig: 0, gesamt: liste.length })
    const erg = await fuegeFotosHinzu({
      wepId: wep.id,
      dateien: liste,
      positionId,
      aendere,
      beiFortschritt: (fertig, gesamt) => setVerarbeite({ fertig, gesamt }),
    })
    setVerarbeite(null)
    setFehler(erg.fehler.map((f) => `${f.name}: ${f.meldung}`))
  }

  return (
    <section className="foto-gruppe" aria-labelledby={`${id}-t`} data-gruppe={positionId ?? 'allgemein'}>
      <h2 className="gruppenkopf" id={`${id}-t`}>
        {titel}
        {fotos.length > 0 && <span className="neben"> · {fotos.length}</span>}
      </h2>
      {fotos.length > 0 ? (
        <div className="foto-raster">
          {fotos.map((f) => (
            <Kachel key={f.id} foto={f} record={records.get(f.id)} laedt={laedt} onOeffnen={() => setOffen(f.id)} />
          ))}
        </div>
      ) : (
        leerText && <p className="neben">{leerText}</p>
      )}

      <div className="foto-aktionen">
        <button type="button" className="knopf" disabled={!!verarbeite} onClick={() => kamera.current?.click()}>
          <Camera {...ICON} />
          Foto aufnehmen
        </button>
        <button type="button" className="knopf" disabled={!!verarbeite} onClick={() => galerie.current?.click()}>
          <Images {...ICON} />
          Aus Galerie
        </button>
      </div>
      <input
        ref={kamera}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        aria-label={`Foto aufnehmen: ${titel}`}
        onChange={(e) => {
          void hinzufuegen(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={galerie}
        type="file"
        hidden
        multiple
        accept="image/*"
        aria-label={`Fotos aus der Galerie wählen: ${titel}`}
        onChange={(e) => {
          void hinzufuegen(e.target.files)
          e.target.value = ''
        }}
      />
      {verarbeite && (
        <p className="neben" role="status">
          Verkleinere Foto {Math.min(verarbeite.fertig + 1, verarbeite.gesamt)} von {verarbeite.gesamt} …
        </p>
      )}
      {fehler.length > 0 && (
        <Meldung alarm>
          <p>Nicht alle Fotos konnten gespeichert werden:</p>
          <ul className="meldung-liste">
            {fehler.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Meldung>
      )}

      {offen && (
        <FotoAnsicht
          wep={wep}
          fotos={fotos}
          startId={offen}
          records={records}
          aendere={aendere}
          onSchliessen={() => setOffen(null)}
        />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Großansicht
// ---------------------------------------------------------------------------

function FotoAnsicht({
  wep,
  fotos,
  startId,
  records,
  aendere,
  onSchliessen,
}: {
  wep: Wep
  fotos: Foto[]
  startId: string
  records: Map<string, FotoRecord>
  aendere: WepAendern
  onSchliessen: () => void
}) {
  const [aktuellId, setAktuellId] = useState(startId)
  const [blob, setBlob] = useState<Blob | undefined>()
  const [loeschFrage, setLoeschFrage] = useState(false)
  const [text, setText] = useState('')
  const id = useId()
  const index = fotos.findIndex((f) => f.id === aktuellId)
  const foto = fotos[index]

  // Nach dem Löschen verschwindet das Foto aus der Liste: zum Nachbarn bzw. zurück
  useEffect(() => {
    if (!foto) {
      if (fotos.length === 0) onSchliessen()
      else setAktuellId(fotos[Math.min(Math.max(index, 0), fotos.length - 1)].id)
    }
  }, [foto, fotos, index, onSchliessen])

  useEffect(() => {
    setText(foto?.text ?? '')
    let aktiv = true
    setBlob(undefined)
    if (foto) {
      void (async () => {
        let datei = await dbAblage.ladeDatei(wep.id, foto.id)
        if (!datei) datei = await ladeFotoAusOneDrive(wep.id, foto.id).catch(() => undefined)
        if (aktiv) setBlob(datei)
      })()
    }
    return () => {
      aktiv = false
    }
  }, [foto?.id, wep.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const url = useObjectUrl(blob)
  const vorschau = useObjectUrl(records.get(aktuellId)?.vorschau)
  if (!foto) return null

  return (
    <Dialog titel={`Foto ${index + 1} von ${fotos.length}`} onSchliessen={onSchliessen}>
      <div className="foto-gross">
        {url || vorschau ? (
          <img src={url ?? vorschau} alt={foto.text ?? 'Foto'} />
        ) : (
          <span className="foto-platzhalter">
            <ImageOff {...ICON} />
            <span>Foto nicht verfügbar</span>
          </span>
        )}
        {fotos.length > 1 && (
          <div className="foto-blaettern">
            <button type="button" className="symbolknopf" aria-label="Voriges Foto" disabled={index === 0} onClick={() => setAktuellId(fotos[index - 1].id)}>
              <ChevronLeft {...ICON} />
            </button>
            <button
              type="button"
              className="symbolknopf"
              aria-label="Nächstes Foto"
              disabled={index === fotos.length - 1}
              onClick={() => setAktuellId(fotos[index + 1].id)}
            >
              <ChevronRight {...ICON} />
            </button>
          </div>
        )}
      </div>
      <div className="feld">
        <label className="label" htmlFor={`${id}-text`}>
          Text zum Foto (optional)
        </label>
        <input
          id={`${id}-text`}
          className="eingabe"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() !== (foto.text ?? '') && void setzeFotoText(aendere, foto.id, text)}
        />
      </div>
      <div className="dialog-knoepfe">
        <button type="button" className="knopf knopf-gefahr" onClick={() => setLoeschFrage(true)}>
          <Trash2 {...ICON} />
          Foto löschen
        </button>
        <button
          type="button"
          className="knopf"
          onClick={() => {
            if (text.trim() !== (foto.text ?? '')) void setzeFotoText(aendere, foto.id, text)
            onSchliessen()
          }}
        >
          <X {...ICON} />
          Schließen
        </button>
      </div>
      {loeschFrage && (
        <Rueckfrage
          titel="Foto löschen?"
          text="Das Foto wird auf allen deinen Geräten entfernt. Das lässt sich nicht rückgängig machen."
          bestaetigen="Foto löschen"
          onAbbrechen={() => setLoeschFrage(false)}
          onBestaetigen={() => {
            setLoeschFrage(false)
            void loescheFoto({ wepId: wep.id, fotoId: foto.id, aendere })
          }}
        />
      )}
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Registerkarte „Fotos“
// ---------------------------------------------------------------------------

export function FotosTab({
  wep,
  aendere,
  records,
  nachladen,
}: {
  wep: Wep
  aendere: WepAendern
  records: Map<string, FotoRecord>
  nachladen: NachladeStand
}) {
  const positionen = positionsListe(wep)
  const mitFotos = positionen.filter((p) => (wep.fotos ?? []).some((f) => f.positionId === p.id))
  const [gewaehlt, setGewaehlt] = useState('')
  const [offeneUploads, setOffeneUploads] = useState<number | null>(null)
  const id = useId()
  const anzahl = (wep.fotos ?? []).length
  const waehlbar = positionen.filter((p) => !mitFotos.some((m) => m.id === p.id))

  // Upload-Stand nur mit Konto anzeigen (ohne Konto bleibt alles „offen“)
  useEffect(() => {
    let aktiv = true
    const aktualisiere = async () => {
      if (!kontoVerfuegbar() || !(await aktuellesKonto())) return aktiv && setOffeneUploads(null)
      const n = await offeneFotoAnzahl()
      if (aktiv) setOffeneUploads(n)
    }
    void aktualisiere()
    const weg = beiFotoAenderung(() => void aktualisiere())
    return () => {
      aktiv = false
      weg()
    }
  }, [])

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Fotos</h1>
          <p className="neben">{anzahl === 1 ? '1 Foto' : `${anzahl} Fotos`}</p>
        </div>
      </header>

      {offeneUploads !== null && (
        <p className="neben foto-stand" role="status">
          <CloudUpload {...ICON} size={18} />
          {offeneUploads === 0 ? 'Alle Fotos sind in OneDrive.' : `${offeneUploads} ${offeneUploads === 1 ? 'Foto wartet' : 'Fotos warten'} auf den Upload (nur im WLAN).`}
        </p>
      )}
      {nachladen.laeuft && (
        <p className="neben foto-stand" role="status">
          Lade Fotos aus OneDrive … {nachladen.fertig} von {nachladen.gesamt}
        </p>
      )}
      {!nachladen.laeuft && nachladen.fehlend > 0 && nachladen.netz === 'nur-wlan' && (
        <div className="foto-stand">
          <p className="neben">{nachladen.fehlend} Fotos sind nur in OneDrive. Sie werden im WLAN geladen.</p>
          <button type="button" className="knopf" onClick={nachladen.jetztLaden}>
            Jetzt laden
          </button>
        </div>
      )}

      <FotoGruppe
        wep={wep}
        aendere={aendere}
        records={records}
        titel="Gesamtansicht"
        laedt={nachladen.laeuft}
        leerText="Fotos vom ganzen Garten oder der Laube, die zu keiner Position gehören."
      />

      {mitFotos.map((p) => (
        <FotoGruppe key={p.id} wep={wep} positionId={p.id} aendere={aendere} records={records} laedt={nachladen.laeuft} titel={`${String(p.nr).padStart(2, '0')} ${p.name}`} />
      ))}

      {positionen.length === 0 ? (
        <LeerZustand icon={Camera} titel="Noch keine Positionen" text="Fotos zu einer Position gehen, sobald es sie gibt – oder oben als Gesamtansicht." />
      ) : (
        waehlbar.length > 0 && (
          <section className="abschnitt" aria-labelledby={`${id}-pos`}>
            <h2 className="gruppenkopf" id={`${id}-pos`}>
              Foto zu einer Position
            </h2>
            <div className="feld">
              <label className="label" htmlFor={`${id}-wahl`}>
                Position wählen
              </label>
              <select id={`${id}-wahl`} className="eingabe" value={gewaehlt} onChange={(e) => setGewaehlt(e.target.value)}>
                <option value="">Bitte wählen …</option>
                {waehlbar.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${String(p.nr).padStart(2, '0')} ${p.name}`}
                  </option>
                ))}
              </select>
            </div>
            {gewaehlt && waehlbar.some((p) => p.id === gewaehlt) && (
              <FotoGruppe
                key={gewaehlt}
                wep={wep}
                positionId={gewaehlt}
                aendere={aendere}
                records={records}
                laedt={nachladen.laeuft}
                titel={`${String(positionen.find((p) => p.id === gewaehlt)?.nr ?? 0).padStart(2, '0')} ${positionen.find((p) => p.id === gewaehlt)?.name ?? ''}`}
              />
            )}
          </section>
        )
      )}
    </>
  )
}
