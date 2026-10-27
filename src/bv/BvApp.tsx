// BV-Kontrollseite (/bv): Die Geschäftsstelle öffnet die eingegangenen WEP-Dateien und Pakete (mehrere Dateien, ganze
// Ordner oder per Hineinziehen), sieht sie in einer Tabelle, prüft sie in der Detailansicht und erzeugt dort PDF und
// Ausdruck. Nicht in der Navigation der Wertermittler; Speicherung nur lokal in diesem Browser (src/bv/speicher.ts).
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { FileUp, FolderOpen, Inbox } from 'lucide-react'
import { erstelleProtokoll } from '@/app/uebersichtDaten'
import { ICON, Meldung, datumDe, euroFormat, zeitDe } from '@/app/ui'
import { BV_STATUS_TEXT, bvZeilen, leseEingangsDateien, type BvEingang, type BvStatus, type EingangsDatei } from './eingang'
import { aendereEingang, alleEingaenge, legeAb } from './speicher'
import { bvQuelle, bvRolle } from './quelle'
import { BvDetail } from './BvDetail'
import type { Zugang } from './BvZugang'

type Filter = 'alle' | BvStatus

/** Alle Dateien aus einem Hineinziehen, auch aus Ordnern (rekursiv). */
async function dateienAusZiehen(dt: DataTransfer): Promise<File[]> {
  const eintraege = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => Boolean(e))
  if (!eintraege.length) return [...dt.files]
  const dateien: File[] = []
  const lies = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      dateien.push(await new Promise<File>((ok, fehler) => (e as FileSystemFileEntry).file(ok, fehler)))
    } else if (e.isDirectory) {
      const leser = (e as FileSystemDirectoryEntry).createReader()
      // readEntries liefert in Teilen, bis eine leere Liste kommt
      for (;;) {
        const teil = await new Promise<FileSystemEntry[]>((ok, fehler) => leser.readEntries(ok, fehler))
        if (!teil.length) break
        for (const k of teil) await lies(k)
      }
    }
  }
  for (const e of eintraege) await lies(e)
  return dateien
}

export default function BvApp({ zugang }: { zugang?: Zugang } = {}) {
  const [eingaenge, setEingaenge] = useState<BvEingang[]>()
  const [offen, setOffen] = useState<string>()
  const [meldung, setMeldung] = useState<{ text: string[]; alarm?: boolean }>()
  const [liest, setLiest] = useState(false)
  const [ziehen, setZiehen] = useState(false)
  const [filter, setFilter] = useState<Filter>('alle')
  const ordnerRef = useRef<HTMLInputElement>(null)

  const neuLaden = useCallback(async () => setEingaenge(await alleEingaenge()), [])
  useEffect(() => {
    document.title = 'WEP – Kontrollseite BV'
    void neuLaden()
  }, [neuLaden])
  // „Ordner öffnen“: das Attribut kennt React nicht
  useEffect(() => {
    ordnerRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  /** Gesamtbetrag nachrechnen (dauert je WEP einen Moment) und in der Liste merken. */
  const rechneGesamt = useCallback(
    async (liste: BvEingang[]) => {
      for (const e of liste) {
        try {
          const p = await erstelleProtokoll(e.wep, bvRolle(e), { quelle: bvQuelle(e) })
          await aendereEingang(e.id, { gesamt: p.bewertung[p.bewertung.length - 1]?.betrag ?? 0 })
        } catch {
          /* bleibt ohne Betrag; die Detailansicht zeigt den Fehler */
        }
      }
      await neuLaden()
    },
    [neuLaden],
  )

  async function einlesen(dateien: EingangsDatei[]) {
    if (!dateien.length) return
    setLiest(true)
    setMeldung(undefined)
    try {
      const erg = await leseEingangsDateien(dateien)
      const { neu, schonDa } = await legeAb(erg.weps)
      const text = [
        neu.length ? `${neu.length} WEP${neu.length === 1 ? '' : 's'} eingelesen.` : 'Keine neuen WEPs.',
        schonDa ? `${schonDa} schon vorhanden (dieselbe Fassung).` : '',
        erg.uebersprungen.length ? `${erg.uebersprungen.length} Datei${erg.uebersprungen.length === 1 ? '' : 'en'} übersprungen (keine WEP-Datei, z. B. PDF oder Foto).` : '',
        ...erg.fehler.map((f) => `${f.datei}: ${f.meldung}`),
      ].filter(Boolean)
      setMeldung({ text, alarm: erg.fehler.length > 0 })
      await neuLaden()
      void rechneGesamt(neu)
    } catch (e) {
      setMeldung({ text: [`Einlesen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`], alarm: true })
    } finally {
      setLiest(false)
    }
  }

  const ausAuswahl = (liste: FileList | null) => void einlesen([...(liste ?? [])].map((f) => ({ name: f.name, daten: f })))

  async function beiAblegen(e: DragEvent) {
    e.preventDefault()
    setZiehen(false)
    const dateien = await dateienAusZiehen(e.dataTransfer)
    await einlesen(dateien.map((f) => ({ name: f.name, daten: f })))
  }

  const offenerEingang = eingaenge?.find((e) => e.id === offen)
  if (offenerEingang) {
    return (
      <div className="bv">
        <BvDetail
          eingang={offenerEingang}
          andere={eingaenge ?? []}
          onZurueck={() => setOffen(undefined)}
          onGeaendert={() => void neuLaden()}
          onEntfernt={() => {
            setOffen(undefined)
            void neuLaden()
          }}
        />
      </div>
    )
  }

  const zeilen = bvZeilen(eingaenge ?? []).filter((z) => filter === 'alle' || z.eingang.status === filter)
  const anzahl = (s: BvStatus) => (eingaenge ?? []).filter((e) => e.status === s).length

  return (
    <div
      className={ziehen ? 'bv bv-ziehen' : 'bv'}
      onDragOver={(e) => {
        e.preventDefault()
        setZiehen(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setZiehen(false)}
      onDrop={(e) => void beiAblegen(e)}
    >
      <main className="bv-inhalt">
        <header className="bv-kopf">
          <div>
            <h1 className="h1">Kontrollseite BV</h1>
            <p className="neben">Wertermittlungsprotokolle prüfen, als PDF speichern und drucken. Die Daten bleiben in diesem Browser.</p>
            {zugang && (
              <p className="neben bv-konto">
                Angemeldet als {zugang.email || 'Microsoft-Konto'}
                {zugang.offline ? ' (ohne Netz, letzte Freigabe gilt)' : ''} ·{' '}
                {zugang.admin && (
                  <>
                    <a href="/bv/admin">Freigaben verwalten</a> ·{' '}
                  </>
                )}
                <button type="button" className="textknopf bv-oeffnen" onClick={zugang.abmelden}>
                  Abmelden
                </button>
              </p>
            )}
          </div>
        </header>

        <section className="bv-eingang" aria-label="Dateien öffnen">
          <p>
            WEP-Dateien (<b>.wep</b>) oder Pakete (<b>…_an-BV.zip</b>) aus dem Synology-Ordner oder aus E-Mails hierher ziehen – auch mehrere oder einen ganzen
            Ordner.
          </p>
          <div className="knopf-reihe">
            <label className="knopf knopf-primaer">
              <FileUp {...ICON} />
              Dateien öffnen
              <input type="file" multiple accept=".wep,.zip" hidden onChange={(e) => ausAuswahl(e.target.files)} />
            </label>
            <label className="knopf">
              <FolderOpen {...ICON} />
              Ordner öffnen
              <input ref={ordnerRef} type="file" multiple hidden onChange={(e) => ausAuswahl(e.target.files)} />
            </label>
          </div>
          {liest && <p className="neben">Lese die Dateien …</p>}
          {meldung &&
            (meldung.alarm ? (
              <Meldung alarm>
                {meldung.text.map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </Meldung>
            ) : (
              <p className="neben" role="status">
                {meldung.text.join(' ')}
              </p>
            ))}
        </section>

        {eingaenge && eingaenge.length > 0 && (
          <div className="segmente bv-filter" role="group" aria-label="Nach Status filtern">
            {(['alle', 'neu', 'rueckfrage', 'geprueft'] as const).map((f) => (
              <button key={f} type="button" className="segment" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'alle' ? `Alle (${eingaenge.length})` : `${BV_STATUS_TEXT[f]} (${anzahl(f)})`}
              </button>
            ))}
          </div>
        )}

        {eingaenge && eingaenge.length === 0 && (
          <div className="bv-leer">
            <Inbox {...ICON} />
            <p>Noch keine WEPs eingelesen.</p>
          </div>
        )}

        {zeilen.length > 0 && (
          <div className="ueb-scroll">
            <table className="ueb-tabelle bv-tabelle">
              <thead>
                <tr>
                  <th scope="col">Vorgangs-Nr.</th>
                  <th scope="col">Anlage</th>
                  <th scope="col">Parzelle / Weg</th>
                  <th scope="col">Unterpächter</th>
                  <th scope="col">Wertermittler Bau / Grün</th>
                  <th scope="col">Datum</th>
                  <th scope="col" className="zahl">
                    Gesamtbetrag
                  </th>
                  <th scope="col">Eingang</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map(({ eingang: e, nr, hinweise }) => {
                  const f = e.wep.formalien
                  return (
                    <tr key={e.id} className="bv-zeile" onClick={() => setOffen(e.id)}>
                      <td>
                        <button type="button" className="textknopf bv-oeffnen" onClick={() => setOffen(e.id)}>
                          {nr || 'ohne Nr.'}
                        </button>
                        {hinweise.map((h) => (
                          <span key={h.art} className={h.art === 'doppelt' && h.neueste ? 'bv-hinweis' : 'bv-hinweis bv-warnung'}>
                            {h.art === 'fehlt' ? 'Vorgangs-Nr. fehlt' : h.neueste ? `doppelt (${h.anzahl}×) – neueste Fassung` : `doppelt (${h.anzahl}×) – ältere Fassung`}
                          </span>
                        ))}
                      </td>
                      <td>{f.kleingartenanlage}</td>
                      <td>{[f.parzelle, f.weg].filter((x) => x?.trim()).join(' / ')}</td>
                      <td>{f.unterpaechter}</td>
                      <td>{[f.wertermittlerBaulichkeiten, f.wertermittlerAussenAufwuchs].filter((x) => x?.trim()).join(' / ')}</td>
                      <td>{f.wertermittlungAm ? datumDe(f.wertermittlungAm) : ''}</td>
                      <td className="zahl">{e.gesamt === undefined ? '…' : euroFormat(e.gesamt)}</td>
                      <td>{zeitDe(e.eingangAm)}</td>
                      <td>
                        <span className={`bv-status bv-status-${e.status}`}>{BV_STATUS_TEXT[e.status]}</span>
                        {e.status === 'rueckfrage' && e.notiz && <span className="c-neben ueb-block">{e.notiz}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
