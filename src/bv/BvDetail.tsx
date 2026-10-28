// Detailansicht der BV-Kontrollseite: dieselbe „Übersicht“ wie bei den Wertermittlern (gleiche Zahlen), dazu Skizzen und
// Fotos, Status (neu / geprüft / Rückfrage mit Notiz), „PDF erzeugen“ in beiden Formen (bis der BV entschieden hat) und
// „Drucken“. Nur lesend – am WEP selbst ändert der BV nichts.
import { useEffect, useId, useMemo, useState } from 'react'
import { ChevronLeft, FileText, FileType, Printer, Trash2 } from 'lucide-react'
import { hatBauTeil, hatGruenTeil, vorgangsNrVon, wepName, type Rolle, type Wep } from '@/model'
import { fotoDateiNamen, positionsListe } from '@/fotos/benennung'
import { lageVon, skizzeMitParzelle } from '@/parzelle'
import { skizzeAlsPng } from '@/skizze/skizzePng'
import { grundrissAlsPng } from '@/skizze/grundrissZeichnen'
import { SKIZZEN_VERHAELTNIS } from '@/pdf/uebersicht/inhalt'
import { Uebersicht } from '@/app/Uebersicht'
import { erstellePdf, type PdfStil } from '@/app/PdfExport'
import { speichereDatei, speicherText } from '@/app/dateiSpeichern'
import { ICON, Meldung, Rueckfrage, zeitDe } from '@/app/ui'
import { BV_STATUS_TEXT, type BvEingang, type BvStatus } from './eingang'
import { aendereEingang, entferneEingang, ladeFoto } from './speicher'
import { bvQuelle, bvRolle } from './quelle'
import { pngAusUrl } from '@/unterschrift'

/** Bild-URL für die Lebensdauer der Ansicht. */
function useBildUrl(erzeuge: () => Promise<Blob | undefined>, deps: unknown[]): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let aktiv = true
    let u: string | undefined
    void erzeuge()
      .then((b) => {
        if (!aktiv || !b) return
        u = URL.createObjectURL(b)
        setUrl(u)
      })
      .catch(() => undefined)
    return () => {
      aktiv = false
      if (u) URL.revokeObjectURL(u)
    }
  }, deps)
  return url
}

/** Skizzen Bau und Grün als Bilder (auch für die Kontrollseite im Server-Modus). `schluessel` ändert sich mit dem Stand. */
export function Skizzen({ wep, rolle, schluessel }: { wep: Wep; rolle: Rolle; schluessel: string }) {
  const gruen = hatGruenTeil(rolle) ? skizzeMitParzelle(wep) : undefined
  const bau = hatBauTeil(rolle) && (wep.grundriss?.teile.length || lageVon(wep)) ? wep.grundriss : undefined
  const bauUrl = useBildUrl(
    async () => (hatBauTeil(rolle) ? grundrissAlsPng(bau ?? { teile: [] }, wep.bau?.bauteile ?? [], lageVon(wep), 1200, SKIZZEN_VERHAELTNIS) : undefined),
    [schluessel],
  )
  const gruenUrl = useBildUrl(async () => (gruen?.elemente.length ? skizzeAlsPng(gruen) : undefined), [schluessel])
  if (!bauUrl && !gruenUrl) return null
  return (
    <section className="ueb-abschnitt bv-skizzen">
      <h2 className="ueb-h2">Skizzen</h2>
      {bauUrl && (
        <figure>
          <img src={bauUrl} alt="Skizze Baulichkeiten" />
          <figcaption className="neben">Skizze Baulichkeiten</figcaption>
        </figure>
      )}
      {gruenUrl && (
        <figure>
          <img src={gruenUrl} alt="Skizze Außenanlagen und Aufwuchs" />
          <figcaption className="neben">Skizze Außenanlagen und Aufwuchs</figcaption>
        </figure>
      )}
    </section>
  )
}

function Foto({ lade, schluessel, fotoId, titel }: { lade: FotoLaden; schluessel: string; fotoId: string; titel: string }) {
  const url = useBildUrl(() => lade(fotoId), [schluessel, fotoId])
  return (
    <figure className="bv-foto">
      {url ? <img src={url} alt={titel} loading="lazy" /> : <div className="bv-foto-leer" />}
      <figcaption className="neben">{titel}</figcaption>
    </figure>
  )
}

type FotoLaden = (fotoId: string) => Promise<Blob | undefined>

/** Fotos mit Position und Text. `fotoIds`: nur diese (fehlt = alle im WEP); `lade` holt die Bilddatei. */
export function Fotos({ wep, fotoIds, lade, schluessel }: { wep: Wep; fotoIds?: string[]; lade: FotoLaden; schluessel: string }) {
  const liste = useMemo(() => {
    const namen = positionsListe(wep)
    return fotoDateiNamen(wep)
      .filter(({ foto }) => !fotoIds || fotoIds.includes(foto.id))
      .map(({ foto, nr }) => ({
        id: foto.id,
        titel: [nr ? `${nr}. ${namen.find((p) => p.nr === nr)?.name ?? ''}` : 'Parzelle allgemein', foto.text?.trim()].filter(Boolean).join(' – '),
      }))
  }, [wep, fotoIds])
  if (!liste.length) return null
  return (
    <section className="ueb-abschnitt">
      <h2 className="ueb-h2">Fotos ({liste.length})</h2>
      <div className="bv-fotos">
        {liste.map((f) => (
          <Foto key={f.id} lade={lade} schluessel={schluessel} fotoId={f.id} titel={f.titel} />
        ))}
      </div>
    </section>
  )
}

export function BvDetail({
  eingang: e,
  andere,
  onZurueck,
  onGeaendert,
  onEntfernt,
}: {
  eingang: BvEingang
  andere: readonly BvEingang[]
  onZurueck: () => void
  onGeaendert: () => void
  onEntfernt: () => void
}) {
  const id = useId()
  const rolle = bvRolle(e)
  const quelle = useMemo(() => bvQuelle(e), [e])
  const nr = vorgangsNrVon(e.wep)
  const [notiz, setNotiz] = useState(e.notiz)
  const [pdf, setPdf] = useState<{ stil?: PdfStil; schritt?: string; meldung?: string; fehler?: boolean }>({})
  const [entfernen, setEntfernen] = useState(false)
  const weitere = nr ? andere.filter((x) => x.id !== e.id && vorgangsNrVon(x.wep) === nr) : []
  const neuere = weitere.filter((x) => x.stand > e.stand)

  async function setzeStatus(status: BvStatus) {
    await aendereEingang(e.id, { status, notiz })
    onGeaendert()
  }

  async function erzeugePdf(stil: PdfStil) {
    setPdf({ stil, schritt: 'Bereite die Daten vor …' })
    try {
      const erg = await erstellePdf(e.wep, rolle, stil, {
        quelle,
        mitFotos: e.fotoIds.length > 0,
        ladeFoto: (fotoId) => ladeFoto(e.id, fotoId),
        // Die mitgeschickten Unterschriften an der Stelle des jeweiligen Wertermittlers; fehlt eine, bleibt das Feld leer
        unterschriften: { bau: pngAusUrl(e.wep.unterschriften?.bau), gruen: pngAusUrl(e.wep.unterschriften?.gruen) },
        schritt: (schritt) => setPdf({ stil, schritt }),
      })
      const s = await speichereDatei(erg.blob, erg.name)
      setPdf({ meldung: [speicherText(s, erg.name), ...erg.hinweise].join(' ') })
    } catch (err) {
      setPdf({ meldung: `PDF konnte nicht erstellt werden: ${err instanceof Error ? err.message : String(err)}`, fehler: true })
    }
  }

  const laedt = pdf.stil !== undefined
  return (
    <main className="bv-inhalt">
      <header className="bv-detail-kopf">
        <button type="button" className="textknopf zurueck" onClick={onZurueck}>
          <ChevronLeft {...ICON} />
          Alle Eingänge
        </button>
        <h1 className="h1">{wepName(e.wep)}</h1>
        <p className="neben">
          {[e.wep.formalien.kleingartenanlage, e.wep.formalien.parzelle && `Parzelle ${e.wep.formalien.parzelle}`, `Eingang ${zeitDe(e.eingangAm)}`].filter(Boolean).join(' · ')}
        </p>
      </header>

      <section className="bv-werkzeuge" aria-label="Prüfen und drucken">
        {!nr && (
          <Meldung>
            <p>Die Vorgangs-Nr. fehlt. Bitte beim Wertermittler nachfragen.</p>
          </Meldung>
        )}
        {weitere.length > 0 && (
          <Meldung>
            <p>
              Die Vorgangs-Nr. {nr} gibt es {weitere.length + 1}-mal.{' '}
              {neuere.length ? `Es gibt eine neuere Fassung (Stand ${zeitDe(neuere[0].stand)}).` : 'Das ist die neueste Fassung.'}
            </p>
          </Meldung>
        )}
        <p className="neben">
          {e.wep.unterschriften?.bau || e.wep.unterschriften?.gruen
            ? `Unterschrift mitgeschickt: ${[e.wep.unterschriften?.bau && 'Bau', e.wep.unterschriften?.gruen && 'Grün'].filter(Boolean).join(' und ')} – sie steht in beiden PDF-Formen.`
            : 'Keine Unterschrift im Paket – die Unterschriftsfelder im PDF bleiben leer.'}
        </p>
        <div className="segmente" role="group" aria-label="Status">
          {(['neu', 'geprueft', 'rueckfrage'] as const).map((s) => (
            <button key={s} type="button" className="segment" aria-pressed={e.status === s} onClick={() => void setzeStatus(s)}>
              {BV_STATUS_TEXT[s]}
            </button>
          ))}
        </div>
        <label className="label" htmlFor={`${id}-notiz`}>
          Notiz (z. B. Rückfrage an den Wertermittler)
        </label>
        <textarea
          id={`${id}-notiz`}
          className="eingabe"
          rows={2}
          value={notiz}
          onChange={(x) => setNotiz(x.target.value)}
          onBlur={() => notiz !== e.notiz && void aendereEingang(e.id, { notiz }).then(onGeaendert)}
        />
        <div className="knopf-reihe">
          <button type="button" className="knopf knopf-primaer" disabled={laedt} onClick={() => void erzeugePdf('uebersichtlich')}>
            <FileText {...ICON} />
            {pdf.stil === 'uebersichtlich' ? pdf.schritt : 'PDF übersichtlich'}
          </button>
          <button type="button" className="knopf" disabled={laedt} onClick={() => void erzeugePdf('vorlage')}>
            <FileType {...ICON} />
            {pdf.stil === 'vorlage' ? pdf.schritt : 'PDF wie Vorlage'}
          </button>
          <button type="button" className="knopf" onClick={() => window.print()}>
            <Printer {...ICON} />
            Drucken
          </button>
          <button type="button" className="knopf knopf-loeschen" onClick={() => setEntfernen(true)}>
            <Trash2 {...ICON} />
            Aus der Liste entfernen
          </button>
        </div>
        {pdf.meldung &&
          (pdf.fehler ? (
            <Meldung alarm>
              <p>{pdf.meldung}</p>
            </Meldung>
          ) : (
            <p className="neben" role="status">
              {pdf.meldung}
            </p>
          ))}
      </section>

      <Uebersicht
        wep={e.wep}
        rolle={rolle}
        optionen={{ quelle }}
        titel="Wertermittlungsprotokoll"
        hinweis={`Stand beim Wertermittler: ${zeitDe(e.stand)}${e.appVersion ? ` · App ${e.appVersion}` : ''}`}
        unten={
          <>
            <Skizzen wep={e.wep} rolle={rolle} schluessel={e.id} />
            <Fotos wep={e.wep} fotoIds={e.fotoIds} lade={(fotoId) => ladeFoto(e.id, fotoId)} schluessel={e.id} />
          </>
        }
      />

      {entfernen && (
        <Rueckfrage
          titel={`${wepName(e.wep)} aus der Liste entfernen?`}
          text="Das WEP verschwindet nur von dieser Kontrollseite (in diesem Browser). Die Datei im Synology-Ordner bleibt."
          bestaetigen="Entfernen"
          onAbbrechen={() => setEntfernen(false)}
          onBestaetigen={() => void entferneEingang(e).then(onEntfernt)}
        />
      )}
    </main>
  )
}
