// „An den BV senden“ (Stufe A): erstellt ein ZIP mit PDF, WEP-Datei und Fotos. Der Wertermittler teilt es direkt in die
// Synology-Drive-App oder speichert es und legt es in den Synology-Ordner des BV; die Geschäftsstelle kümmert sich darum.
// Kein Zugriff der App auf das NAS (Stufe B mit direktem Hochladen kommt, wenn der BV die Angaben geliefert hat).
import { useId, useState } from 'react'
import { Download, Send, Share2 } from 'lucide-react'
import { vorgangsNrVon, type Rolle, type Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import { dbAblage } from '@/fotos/ablage'
import { sammleExportFotos } from '@/fotos/exportOrdner'
import { lokalerStand } from '@/sicherung'
import { ladeFotoAusOneDrive } from '@/sync'
import { erstelleTeilen } from '@/teilen'
import { unterschriftAlsPng } from '@/unterschrift'
import { baueBvPaket, paketName } from '@/senden/paket'
import { kannTeilen, speichereDatei, speicherText, teileDatei } from './dateiSpeichern'
import { erstellePdf } from './PdfExport'
import { ICON, Meldung, zeitDe } from './ui'

type Zustand =
  | { typ: 'idle' }
  | { typ: 'laedt'; schritt: string }
  | { typ: 'fertig'; blob: Blob; name: string; inhalt: string; hinweise: string[] }
  | { typ: 'fehler'; meldung: string }

export function AnBvSenden({
  wep,
  rolle,
  profilIndex,
  aendere,
}: {
  wep: Wep
  rolle: Rolle
  profilIndex?: Record<string, number>
  aendere: WepAendern
}) {
  const id = useId()
  const [zustand, setZustand] = useState<Zustand>({ typ: 'idle' })
  const [mitUnterschrift, setMitUnterschrift] = useState(false)
  const [meldung, setMeldung] = useState<string>()
  const hatUnterschrift = unterschriftAlsPng() !== null
  const nr = vorgangsNrVon(wep)

  async function erstellen() {
    setMeldung(undefined)
    try {
      const unterschrift = mitUnterschrift ? unterschriftAlsPng() : null
      const schritt = (s: string) => setZustand({ typ: 'laedt', schritt: s })
      // Beide PDF-Arten, bis der BV sich für eine entschieden hat (Fotos liegen als JPG daneben, nicht im PDF)
      const pdfUebersicht = await erstellePdf(wep, rolle, 'uebersichtlich', { profilIndex, unterschrift, schritt: (s) => schritt(`PDF übersichtlich: ${s}`) })
      const pdfVorlage = await erstellePdf(wep, rolle, 'vorlage', { profilIndex, unterschrift, schritt: (s) => schritt(`PDF wie Vorlage: ${s}`) })
      schritt('WEP-Datei und Fotos …')
      const wepDatei = await erstelleTeilen(lokalerStand, wep.id, { mitFotos: false, mitBauExcel: false, appVersion: __APP_VERSION__ })
      const fotos = await sammleExportFotos(wep, dbAblage, ladeFotoAusOneDrive)
      schritt('Packe die Datei …')
      const blob = await baueBvPaket({
        pdfs: [
          { name: pdfUebersicht.name, daten: pdfUebersicht.blob },
          { name: pdfVorlage.name, daten: pdfVorlage.blob },
        ],
        wepDatei: { name: wepDatei.dateiname, daten: wepDatei.blob },
        fotos: fotos.dateien.map((f) => ({ name: f.name, daten: f.blob })),
      })
      const hinweise = [...new Set([...pdfUebersicht.hinweise, ...pdfVorlage.hinweise])]
      if (fotos.fehlen.length) hinweise.push(`${fotos.fehlen.length} Foto${fotos.fehlen.length === 1 ? ' fehlt' : 's fehlen'} (noch nicht auf diesem Gerät, kein Netz).`)
      const n = fotos.dateien.length
      setZustand({
        typ: 'fertig',
        blob,
        name: paketName(wep),
        inhalt: `2 PDFs, WEP-Datei${n ? `, ${n} Foto${n === 1 ? '' : 's'}` : ''} · ${(blob.size / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`,
        hinweise,
      })
    } catch (e) {
      setZustand({ typ: 'fehler', meldung: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Nach dem Teilen oder Speichern: Datum merken und Status „exportiert“. */
  async function merken() {
    const jetzt = new Date().toISOString()
    await aendere((w) => ({ ...w, anBvGesendetAm: jetzt, status: 'exportiert' }))
  }

  async function teilen(blob: Blob, name: string) {
    const e = await teileDatei(blob, name)
    if (e === 'geteilt') {
      await merken()
      setMeldung('Geteilt. Bitte prüfen, ob die Datei im Synology-Ordner des BV angekommen ist.')
    }
  }

  async function speichern(blob: Blob, name: string) {
    const e = await speichereDatei(blob, name)
    setMeldung(`${speicherText(e, name)}. Lege die Datei jetzt in den Synology-Ordner des BV.`)
    if (e !== 'abgebrochen') await merken()
  }

  const laedt = zustand.typ === 'laedt'
  return (
    <section className="abschnitt" aria-labelledby={`${id}-bv`} style={{ marginTop: 40 }}>
      <h2 className="gruppenkopf" id={`${id}-bv`}>
        An den BV senden
      </h2>
      <p className="neben block">
        Erstellt eine Datei mit dem Protokoll als PDF, der WEP-Datei (zum Öffnen in der App) und allen Fotos. Teile sie direkt in die
        Synology-Drive-App oder speichere sie und lege sie in den Synology-Ordner des BV.
        {wep.anBvGesendetAm && ` Zuletzt gesendet am ${zeitDe(wep.anBvGesendetAm)}.`}
      </p>
      {!nr && (
        <Meldung>
          <p>Die Vorgangs-Nr. fehlt noch. Bitte vor dem Senden unter „Formalien“ die Nummer vom BV eintragen.</p>
        </Meldung>
      )}
      {hatUnterschrift && (
        <label className="schalter-zeile">
          <span>PDF mit meiner Unterschrift</span>
          <input type="checkbox" role="switch" className="schalter" checked={mitUnterschrift} onChange={(e) => setMitUnterschrift(e.target.checked)} />
        </label>
      )}
      <button type="button" className="knopf knopf-primaer knopf-breit" disabled={laedt} onClick={() => void erstellen()}>
        <Send {...ICON} />
        {laedt ? zustand.schritt : 'Paket für den BV erstellen'}
      </button>

      {zustand.typ === 'fehler' && (
        <Meldung alarm>
          <p>Das Paket konnte nicht erstellt werden: {zustand.meldung}</p>
        </Meldung>
      )}
      {zustand.typ === 'fertig' && (
        <div className="ergebnis" aria-live="polite">
          <p className="zeile-titel">{zustand.name}</p>
          <p className="neben">{zustand.inhalt}</p>
          {zustand.hinweise.length > 0 && (
            <Meldung>
              {zustand.hinweise.map((h) => (
                <p key={h}>{h}</p>
              ))}
            </Meldung>
          )}
          <div className="knopf-reihe">
            {kannTeilen() && (
              <button type="button" className="knopf" onClick={() => void teilen(zustand.blob, zustand.name)}>
                <Share2 {...ICON} />
                Teilen …
              </button>
            )}
            <button type="button" className="knopf" onClick={() => void speichern(zustand.blob, zustand.name)}>
              <Download {...ICON} />
              Speichern
            </button>
          </div>
        </div>
      )}
      {meldung && (
        <p className="neben" role="status">
          {meldung}
        </p>
      )}
    </section>
  )
}
