// „An den BV senden“ (Stufe A): erstellt ein ZIP mit der WEP-Datei (samt Fotos und ggf. Bau-Excel). Der Wertermittler teilt
// es direkt in die Synology-Drive-App oder speichert es und legt es in den Synology-Ordner des BV; die Geschäftsstelle
// öffnet es auf der BV-Kontrollseite (/bv) – dort entstehen Übersicht, PDF und Ausdruck. Mit der Entwickleroption
// „PDF-Export anzeigen“ (Notfall) liegen zusätzlich beide PDFs im Paket. Kein Zugriff der App auf das NAS (Stufe B).
import { useId, useState } from 'react'
import { Download, Send, Share2 } from 'lucide-react'
import { vorgangsNrVon, type Rolle, type Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import { lokalerStand } from '@/sicherung'
import { erstelleTeilen } from '@/teilen'
import { unterschriftAlsPng } from '@/unterschrift'
import { baueBvPaket, paketName } from '@/senden/paket'
import { kannTeilen, speichereDatei, speicherText, teileDatei } from './dateiSpeichern'
import { usePdfExport } from './ohneExcel'
import { erstellePdf } from './PdfExport'
import { ICON, Meldung, zeitDe } from './ui'
import { UnterschriftHinweis, absenderAusProfil } from './UnterschriftHinweis'
import { MassFehltHinweis } from './MassFehltHinweis'

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
  const pdfExport = usePdfExport()
  const hatUnterschrift = pdfExport && unterschriftAlsPng() !== null
  const nr = vorgangsNrVon(wep)

  async function erstellen() {
    setMeldung(undefined)
    try {
      const unterschrift = mitUnterschrift ? unterschriftAlsPng() : null
      const schritt = (s: string) => setZustand({ typ: 'laedt', schritt: s })
      // Die WEP-Datei mit Fotos und Bau-Excel: Daraus rechnet die BV-Kontrollseite dieselben Zahlen wie dieses Gerät
      schritt('WEP-Datei und Fotos …')
      // Die Unterschrift des Absenders kommt immer für seinen Teil mit (falls eingerichtet)
      const wepDatei = await erstelleTeilen(lokalerStand, wep.id, { mitFotos: true, mitBauExcel: true, appVersion: __APP_VERSION__, absender: absenderAusProfil() })
      const hinweise: string[] = []
      const pdfs: { name: string; daten: Blob }[] = []
      if (pdfExport) {
        // Notfall (Entwickleroption): beide PDF-Arten zusätzlich ins Paket
        for (const stil of ['uebersichtlich', 'vorlage'] as const) {
          const pdf = await erstellePdf(wep, rolle, stil, { profilIndex, unterschrift, schritt: (s) => schritt(`PDF ${stil === 'vorlage' ? 'wie Vorlage' : 'übersichtlich'}: ${s}`) })
          pdfs.push({ name: pdf.name, daten: pdf.blob })
          hinweise.push(...pdf.hinweise.filter((h) => !hinweise.includes(h)))
        }
      }
      schritt('Packe die Datei …')
      const blob = await baueBvPaket({ pdfs, wepDatei: { name: wepDatei.dateiname, daten: wepDatei.blob }, fotos: [] })
      if (wepDatei.fotosOhneDatei) hinweise.push(`${wepDatei.fotosOhneDatei} Foto${wepDatei.fotosOhneDatei === 1 ? ' fehlt' : 's fehlen'} (noch nicht auf diesem Gerät, kein Netz).`)
      if (wepDatei.bauExcelOhneDatei) hinweise.push('Die Bau-Excel liegt nicht auf diesem Gerät und fehlt im Paket.')
      const n = wepDatei.inhalt.fotos
      setZustand({
        typ: 'fertig',
        blob,
        name: paketName(wep),
        inhalt: `WEP-Datei${n ? ` mit ${n} Foto${n === 1 ? '' : 's'}` : ''}${wepDatei.inhalt.bauExcel ? ' und Bau-Excel' : ''}${pdfs.length ? `, ${pdfs.length} PDFs` : ''} · ${(blob.size / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`,
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
    <section aria-labelledby={`${id}-bv`}>
      <header className="seitenkopf">
        <h1 className="h1" id={`${id}-bv`}>
          An den BV senden
        </h1>
      </header>
      <p className="neben block">
        Erstellt eine Datei mit dem WEP und allen Fotos. Teile sie direkt in die Synology-Drive-App oder speichere sie und lege sie in
        den Synology-Ordner des BV. Die Geschäftsstelle prüft und druckt das Protokoll auf ihrer Kontrollseite.
        {wep.anBvGesendetAm && ` Zuletzt gesendet am ${zeitDe(wep.anBvGesendetAm)}.`}
      </p>
      <UnterschriftHinweis wep={wep} />
      <MassFehltHinweis wep={wep} />
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
