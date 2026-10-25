// Export als PDF (Beta 5, Paket 4): „PDF wie Vorlage“ sieht aus wie die Blätter der BV-Vorlage; „PDF übersichtlich“ ist ein
// schlichtes, gut lesbares Protokoll mit denselben Zahlen. Beide werden offline im Browser erzeugt.
// Die PDF-Bibliothek lädt erst beim Erzeugen nach (src/pdf). Speichern über „Speichern unter…“ bzw. Download
// (dateiSpeichern.ts), mit Konto zusätzlich nach OneDrive (Exporte/).
import { useEffect, useId, useState } from 'react'
import { Check, FileText, FileType, Share2 } from 'lucide-react'
import { hatBauTeil, vorgangsNrVon, type Rolle, type Wep } from '@/model'
import { useOhneExcel } from './ohneExcel'
import { dbAblage } from '@/fotos/ablage'
import { lageVon, skizzeMitParzelle } from '@/parzelle'
import { leererGrundriss } from '@/skizze/grundriss'
import { sammlePdfFotos } from '@/pdf/fotosSammeln'
import { PDF_TYP, erzeugeWepPdf, erzeugeWepUebersichtPdf } from '@/pdf'
import { exportNachOneDrive, ladeFotoAusOneDrive } from '@/sync'
import { unterschriftAlsPng } from '@/unterschrift'
import { Capacitor } from '@capacitor/core'
import { bauFuerExport } from './bauHelfer'
import { kannTeilen, speichereDatei, speicherText, teileDatei } from './dateiSpeichern'
import { ladeExportQuelle } from './exportQuelle'
import { ICON, Meldung } from './ui'

type Zustand =
  | { typ: 'idle' }
  | { typ: 'laedt'; schritt: string; stil: PdfStil }
  | { typ: 'fertig'; name: string; seiten: number; blob: Blob; datei?: string; oneDrive?: string; hinweise: string[] }
  | { typ: 'fehler'; meldung: string }

/** `uebersichtlich`: schlichtes Protokoll; `vorlage`: Blätter der BV-Vorlage. */
type PdfStil = 'uebersichtlich' | 'vorlage'

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`

/** Welche Teile ins PDF kommen, in einem Satz. */
function inhaltsText(rolle: Rolle, wep: Wep): string {
  if (rolle === 'bau') return 'Deckblatt, Baulichkeiten, Mängelliste, Beseitigungskosten und Skizze Bau (soweit ausgefüllt).'
  if (rolle === 'beides')
    return wep.bau
      ? 'Deckblatt, Baulichkeiten, Mängelliste, Außenanlagen, Aufwuchs, Beseitigungskosten und beide Skizzen (soweit ausgefüllt).'
      : 'Deckblatt, Baulichkeiten, Mängelliste, Außenanlagen, Aufwuchs, Beseitigungskosten und Skizze (soweit ausgefüllt).'
  return 'Deckblatt, Außenanlagen, Aufwuchs, Beseitigungskosten und Skizze (soweit ausgefüllt).'
}

export function PdfBereich({ wep, rolle, profilIndex }: { wep: Wep; rolle: Rolle; profilIndex?: Record<string, number> }) {
  const ohneExcel = useOhneExcel()
  const id = useId()
  const [zustand, setZustand] = useState<Zustand>({ typ: 'idle' })
  const [mitFotos, setMitFotos] = useState(false)
  const [mitUnterschrift, setMitUnterschrift] = useState(false)
  const [teilenMeldung, setTeilenMeldung] = useState<string>()
  const anzahlFotos = wep.fotos?.length ?? 0
  const fotoGroesse = (wep.fotos ?? []).reduce((s, f) => s + f.groesse, 0)
  const hatUnterschrift = unterschriftAlsPng() !== null
  const nurBau = rolle === 'bau'

  // Nach einem Wechsel des WEP oder der Rolle gilt das alte Ergebnis nicht mehr
  useEffect(() => {
    setZustand({ typ: 'idle' })
    setTeilenMeldung(undefined)
  }, [wep.id, rolle])

  async function erzeugen(stil: PdfStil) {
    setTeilenMeldung(undefined)
    setZustand({ typ: 'laedt', schritt: 'Bereite die Daten vor …', stil })
    try {
      const quelle = await ladeExportQuelle(wep, nurBau)
      const wepFuerExport = hatBauTeil(rolle) ? bauFuerExport(wep, profilIndex) : wep

      let fotos
      let fehlendeFotos = 0
      if (mitFotos && anzahlFotos) {
        setZustand({ typ: 'laedt', schritt: 'Hole die Fotos …', stil })
        const g = await sammlePdfFotos(wep, async (fotoId) => (await dbAblage.ladeDatei(wep.id, fotoId)) ?? (await ladeFotoAusOneDrive(wep.id, fotoId).catch(() => undefined)))
        fotos = g.fotos
        fehlendeFotos = g.fehlen
      }

      setZustand({ typ: 'laedt', schritt: 'Erzeuge das PDF …', stil })
      const f = wep.formalien
      // Parzelle (Beta 6, Paket 1): beide Skizzen zeigen sie gleich; die Grün-Skizze entsteht bei Bedarf aus der Parzelle
      const parzellenLage = lageVon(wepFuerExport)
      const skizzeFuerExport = skizzeMitParzelle(wepFuerExport)
      const erzeuge = stil === 'uebersichtlich' ? erzeugeWepUebersichtPdf : erzeugeWepPdf
      const ausgabe = await erzeuge(
        {
          wep: wepFuerExport,
          quelle: quelle.buffer,
          hatBauExcel: quelle.hatBauExcel,
          rolle,
          exportOptionen: { profilIndex, formalienAbgeglichen: wep.bauExcel?.abgeglichen === true },
        },
        {
          skizzen: {
            gruen: skizzeFuerExport?.elemente.length ? skizzeFuerExport : undefined,
            grundriss:
              wepFuerExport.grundriss?.teile.length || parzellenLage
                ? { daten: wepFuerExport.grundriss ?? leererGrundriss(), bauteile: wepFuerExport.bau?.bauteile ?? [], parzelle: parzellenLage }
                : undefined,
          },
          fotos,
          unterschrift: mitUnterschrift ? unterschriftAlsPng() : null,
          titel: `Wertermittlungsprotokoll ${vorgangsNrVon(wep)}`.trim(),
          fotoKopf: [vorgangsNrVon(wep) && `Vorgangs-Nr. ${vorgangsNrVon(wep)}`, f.kleingartenanlage, f.parzelle && `Parzelle ${f.parzelle}`].filter(Boolean).join(' – '),
        },
      )
      const blob = new Blob([ausgabe.pdf.bytes as BlobPart], { type: PDF_TYP })
      const hinweise = [...ausgabe.pdf.hinweise]
      if (fehlendeFotos) hinweise.push(`${fehlendeFotos} Foto${fehlendeFotos === 1 ? ' fehlt' : 's fehlen'} (noch nicht auf diesem Gerät, kein Netz).`)

      // Wie beim Excel: im Browser und im Windows-Programm gleich speichern, auf dem Handy mit Konto nur nach OneDrive
      const nativ = Capacitor.isNativePlatform()
      let datei: string | undefined
      if (!nativ) {
        const e = await speichereDatei(blob, ausgabe.name)
        if (e === 'abgebrochen') datei = speicherText(e, ausgabe.name) + '.'
      }
      let oneDrive: string | undefined
      try {
        const status = await exportNachOneDrive(ausgabe.name, blob, PDF_TYP)
        if (status === 'ohne-konto' && nativ) oneDrive = `Ohne Konto: ${speicherText(await speichereDatei(blob, ausgabe.name), ausgabe.name)}.`
        else if (status === 'hochgeladen') oneDrive = nativ ? 'In OneDrive abgelegt (Ordner Exporte).' : 'Auch in OneDrive abgelegt (Ordner Exporte).'
        else if (status === 'wartet') oneDrive = 'OneDrive: wartet auf Netz und wird beim nächsten Abgleich hochgeladen.'
      } catch (e) {
        oneDrive = `OneDrive: ${e instanceof Error ? e.message : String(e)}`
      }
      setZustand({ typ: 'fertig', name: ausgabe.name, seiten: ausgabe.pdf.seitenZahl, blob, datei, oneDrive, hinweise })
    } catch (e) {
      setZustand({ typ: 'fehler', meldung: e instanceof Error ? e.message : String(e) })
    }
  }

  async function nochmalSpeichern(blob: Blob, name: string) {
    const e = await speichereDatei(blob, name)
    setTeilenMeldung(speicherText(e, name) + '.')
  }

  async function teilen(blob: Blob, name: string) {
    try {
      const e = await teileDatei(blob, name)
      setTeilenMeldung(e === 'geteilt' ? 'Geteilt.' : 'Teilen abgebrochen.')
    } catch (err) {
      setTeilenMeldung(`Teilen hat nicht geklappt: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const laedt = zustand.typ === 'laedt'
  const fertig = zustand.typ === 'fertig' ? zustand : null

  return (
    <section className="abschnitt" aria-labelledby={`${id}-pdf`} style={{ marginTop: 40 }}>
      <h2 className="gruppenkopf" id={`${id}-pdf`}>
        Export als PDF
      </h2>
      {!vorgangsNrVon(wep) && (
        <Meldung>
          <p>Die Vorgangs-Nr. fehlt noch – im PDF steht dann keine Nummer. Bitte unter „Formalien“ die Nummer vom BV eintragen.</p>
        </Meldung>
      )}
      <p className="neben block">
        Das PDF entsteht hier auf dem Gerät, auch ohne Netz. Es enthält: {inhaltsText(rolle, wep)}{ohneExcel ? '' : ' Die Zahlen sind dieselben wie in der Excel-Datei.'}
      </p>
      <ul className="neben block">
        <li>
          <strong>PDF übersichtlich:</strong> schlichtes, gut lesbares Protokoll mit Rechenweg je Bauteil{ohneExcel ? '.' : ', ohne Excel-Gitter.'}
        </li>
        <li>
          <strong>PDF wie Vorlage:</strong> sieht aus wie die Blätter der BV-Vorlage (gleiche Seiten, Überschriften, Tabellen und Summen).
        </li>
      </ul>

      {anzahlFotos > 0 && (
        <label className="schalter-zeile">
          <span>
            Fotos als Anhang ({anzahlFotos}, ca. {mb(fotoGroesse)})
          </span>
          <input type="checkbox" className="schalter" checked={mitFotos} onChange={(e) => setMitFotos(e.target.checked)} />
        </label>
      )}

      <label className="schalter-zeile">
        <span>
          Mit meiner Unterschrift versehen
          {!hatUnterschrift && <span className="neben"> – noch keine hinterlegt (Profil → „Meine Unterschrift“)</span>}
        </span>
        <input type="checkbox" className="schalter" checked={mitUnterschrift && hatUnterschrift} disabled={!hatUnterschrift} onChange={(e) => setMitUnterschrift(e.target.checked)} />
      </label>
      {mitUnterschrift && hatUnterschrift && (
        <p className="neben">Die Unterschrift steht über dem Namen des Wertermittlers (Bau: Blätter des Bau-Teils, Grün: Blätter des Grün-Teils).</p>
      )}

      <button type="button" className="knopf knopf-primaer knopf-breit" disabled={laedt} onClick={() => void erzeugen('uebersichtlich')}>
        <FileText {...ICON} />
        {laedt && zustand.stil === 'uebersichtlich' ? zustand.schritt : 'PDF übersichtlich'}
      </button>
      <button type="button" className="knopf knopf-breit" style={{ marginTop: 8 }} disabled={laedt} onClick={() => void erzeugen('vorlage')}>
        <FileType {...ICON} />
        {laedt && zustand.stil === 'vorlage' ? zustand.schritt : 'PDF wie Vorlage'}
      </button>

      {zustand.typ === 'fehler' && (
        <div className="ergebnis">
          <Meldung alarm>
            <p>Das PDF konnte nicht erzeugt werden: {zustand.meldung}</p>
            <p>Die Daten im WEP sind unverändert. Bitte noch einmal versuchen.</p>
          </Meldung>
        </div>
      )}

      {fertig && (
        <div className="ergebnis" aria-live="polite">
          <p className="ok zeile">
            <Check {...ICON} />
            <span>
              PDF erstellt: {fertig.name} ({fertig.seiten} Seiten, {mb(fertig.blob.size)})
            </span>
          </p>
          {fertig.datei && <p className="neben">{fertig.datei}</p>}
          {fertig.oneDrive && <p className="neben">{fertig.oneDrive}</p>}
          {fertig.hinweise.map((h) => (
            <Meldung key={h}>
              <p>{h}</p>
            </Meldung>
          ))}
          <div className="knopf-reihe">
            <button type="button" className="knopf" onClick={() => void nochmalSpeichern(fertig.blob, fertig.name)}>
              Speichern unter …
            </button>
            {kannTeilen(new File([fertig.blob], fertig.name, { type: PDF_TYP })) && (
              <button type="button" className="knopf" onClick={() => void teilen(fertig.blob, fertig.name)}>
                <Share2 {...ICON} />
                Teilen
              </button>
            )}
          </div>
          {teilenMeldung && <p className="neben">{teilenMeldung}</p>}
        </div>
      )}
    </section>
  )
}
