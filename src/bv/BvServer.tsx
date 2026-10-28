// BV-Kontrollseite im Server-Modus (v2, Paket 4): Die abgegebenen WEPs kommen vom Server statt aus Dateien. Liste mit
// Zustand, Detail mit Übersicht, Skizzen, Fotos, PDF in beiden Formen, Drucken, Verlauf und den Schritten des BV:
// Rückfrage an Bau, Grün oder beide (mit Notiz), geprüft, ein geprüftes WEP mit Begründung wieder öffnen.
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { ChevronLeft, FileText, FileType, LogOut, MessageSquareWarning, Printer, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react'
import { exportRolle } from '@/export/ohneBau'
import { vorgangsNrVon, wepName, wepRolle, type Wep } from '@/model'
import type { ExportQuelle } from '@/app/exportQuelle'
import { erstelleProtokoll } from '@/app/uebersichtDaten'
import { erstellePdf, type PdfStil } from '@/app/PdfExport'
import { speichereDatei, speicherText } from '@/app/dateiSpeichern'
import { Uebersicht } from '@/app/Uebersicht'
import { ICON, Meldung, Rueckfrage, datumDe, euroFormat, zeitDe } from '@/app/ui'
import { pngAusUrl } from '@/unterschrift'
import { httpZugriff } from '@/server/abgleichDienst'
import type { ServerKopf } from '@/server/abgleich'
import { ladeBauExcelVomServer, ladeFotoVomServer } from '@/server/dateiDienst'
import { ladeVerlauf, type VerlaufEintrag } from '@/server/ablaufDienst'
import { AKTION_TEXT, ZUSTAND_TEXT, moeglicheAktionen, type AblaufAktion, type Zustand } from '@/server/rechte'
import type { V2Sitzung } from '@/server/V2Tor'
import { Fotos, Skizzen } from './BvDetail'

interface BvWep {
  kopf: ServerKopf
  wep: Wep
  gesamt?: number
}

type Filter = 'alle' | 'beim_bv' | 'rueckfrage' | 'geprueft'
const FILTER_TEXT: Record<Filter, string> = { alle: 'Alle', beim_bv: 'Zu prüfen', rueckfrage: 'Rückfrage', geprueft: 'Geprüft' }
const BV_KLASSE: Record<Zustand, string> = { bau_in_arbeit: 'neu', gruen_in_arbeit: 'neu', beim_bv: 'neu', rueckfrage: 'rueckfrage', geprueft: 'geprueft' }
const VERLAUF_TEXT: Record<string, string> = { ...AKTION_TEXT, angelegt: 'angelegt', bearbeitet: 'bearbeitet', geloescht: 'in den Papierkorb gelegt', wiederhergestellt: 'wiederhergestellt' }

const rolleVon = (w: Wep) => exportRolle(w, wepRolle(w))

/** Export-Quelle wie beim Wertermittler: die Bau-Excel vom Server (außer bei reinen Bau-WEPs), sonst die leere Vorlage. */
function quelleVon(w: Wep): () => Promise<ExportQuelle> {
  return async () => {
    if (w.bauExcel && rolleVon(w) !== 'bau') {
      const bau = await ladeBauExcelVomServer(w.id).catch(() => undefined)
      if (bau) return { buffer: await bau.arrayBuffer(), hatBauExcel: true }
    }
    const resp = await fetch('/WEP_Vorlage.xlsx')
    if (!resp.ok) throw new Error(`Vorlage nicht gefunden: ${resp.statusText}`)
    return { buffer: await resp.arrayBuffer(), hatBauExcel: false }
  }
}

async function schritt(wepId: string, aktion: AblaufAktion, basisRev: number) {
  const r = await fetch(`/api/v2/weps/${encodeURIComponent(wepId)}/aktion`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...aktion, basisRev }),
  })
  const d = (await r.json().catch(() => ({}))) as { fehler?: string }
  if (!r.ok) throw new Error(r.status === 409 ? 'Das WEP wurde inzwischen geändert – die Liste ist neu geladen, bitte noch einmal ansehen.' : (d.fehler ?? `Server antwortet mit ${r.status}`))
}

export function BvServerApp({ sitzung }: { sitzung: V2Sitzung }) {
  const [liste, setListe] = useState<BvWep[]>()
  const [fehler, setFehler] = useState('')
  const [offen, setOffen] = useState<string>()
  const [filter, setFilter] = useState<Filter>('alle')

  const laden = useCallback(async () => {
    setFehler('')
    try {
      const koepfe = (await httpZugriff.liste()).filter((k) => !k.geloeschtAm && ['beim_bv', 'rueckfrage', 'geprueft'].includes(k.zustand))
      const geladen: BvWep[] = []
      for (const k of koepfe) {
        const s = await httpZugriff.lade(k.id)
        geladen.push({ kopf: s.kopf, wep: s.wep })
      }
      setListe(geladen)
      // Gesamtbetrag nachrechnen (dauert je WEP einen Moment)
      for (const e of geladen) {
        try {
          const p = await erstelleProtokoll(e.wep, rolleVon(e.wep), { quelle: quelleVon(e.wep) })
          e.gesamt = p.bewertung[p.bewertung.length - 1]?.betrag ?? 0
          setListe((l) => l?.map((x) => (x.kopf.id === e.kopf.id ? { ...x, gesamt: e.gesamt } : x)))
        } catch {
          /* bleibt ohne Betrag; die Detailansicht zeigt den Fehler */
        }
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    document.title = 'WEP – Kontrollseite BV'
    void laden()
  }, [laden])

  const offenesWep = liste?.find((e) => e.kopf.id === offen)
  if (offenesWep)
    return (
      <div className="bv">
        <BvServerDetail
          e={offenesWep}
          sitzung={sitzung}
          onZurueck={() => setOffen(undefined)}
          onGeaendert={async () => {
            await laden()
          }}
        />
      </div>
    )

  const anzahl = (z: Filter) => (liste ?? []).filter((e) => z === 'alle' || e.kopf.zustand === z).length
  const zeilen = (liste ?? []).filter((e) => filter === 'alle' || e.kopf.zustand === filter).sort((a, b) => (a.kopf.geaendertAm < b.kopf.geaendertAm ? 1 : -1))

  return (
    <div className="bv">
      <main className="bv-inhalt">
        <header className="bv-kopf">
          <div>
            <h1 className="h1">Kontrollseite BV</h1>
            <p className="neben">Abgegebene Wertermittlungsprotokolle prüfen, Rückfragen stellen, als PDF speichern und drucken.</p>
            <p className="neben bv-konto">
              Angemeldet als {sitzung.konto.name || sitzung.konto.email} ·{' '}
              <button type="button" className="textknopf bv-oeffnen" onClick={() => void sitzung.abmelden()}>
                <LogOut {...ICON} size={16} /> Abmelden
              </button>
            </p>
          </div>
          <button type="button" className="knopf" onClick={() => void laden()}>
            <RefreshCw {...ICON} />
            Neu laden
          </button>
        </header>

        {fehler && (
          <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
        )}
        {!liste && !fehler && <p className="neben">Lade die abgegebenen WEPs …</p>}

        {liste && liste.length > 0 && (
          <div className="segmente bv-filter" role="group" aria-label="Nach Zustand filtern">
            {(['alle', 'beim_bv', 'rueckfrage', 'geprueft'] as const).map((f) => (
              <button key={f} type="button" className="segment" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {FILTER_TEXT[f]} ({anzahl(f)})
              </button>
            ))}
          </div>
        )}
        {liste && liste.length === 0 && <p className="neben">Noch kein WEP an den BV abgegeben.</p>}

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
                  <th scope="col">Zuletzt</th>
                  <th scope="col">Zustand</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map(({ kopf, wep, gesamt }) => {
                  const f = wep.formalien
                  return (
                    <tr key={kopf.id} className="bv-zeile" onClick={() => setOffen(kopf.id)}>
                      <td>
                        <button type="button" className="textknopf bv-oeffnen" onClick={() => setOffen(kopf.id)}>
                          {vorgangsNrVon(wep) || 'ohne Nr.'}
                        </button>
                      </td>
                      <td>{f.kleingartenanlage}</td>
                      <td>{[f.parzelle, f.weg].filter((x) => x?.trim()).join(' / ')}</td>
                      <td>{f.unterpaechter}</td>
                      <td>{[wep.ablauf?.bau?.name, wep.ablauf?.gruen?.name].filter(Boolean).join(' / ')}</td>
                      <td>{f.wertermittlungAm ? datumDe(f.wertermittlungAm) : ''}</td>
                      <td className="zahl">{gesamt === undefined ? '…' : euroFormat(gesamt)}</td>
                      <td>{zeitDe(kopf.geaendertAm)}</td>
                      <td>
                        <span className={`bv-status bv-status-${BV_KLASSE[kopf.zustand]}`}>{ZUSTAND_TEXT[kopf.zustand]}</span>
                        {wep.ablauf?.rueckfrage && <span className="c-neben ueb-block">{wep.ablauf.rueckfrage.notiz}</span>}
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

function BvServerDetail({ e, sitzung, onZurueck, onGeaendert }: { e: BvWep; sitzung: V2Sitzung; onZurueck: () => void; onGeaendert: () => Promise<void> }) {
  const id = useId()
  const { wep, kopf } = e
  const rolle = rolleVon(wep)
  const quelle = useMemo(() => quelleVon(wep), [wep])
  const schluessel = `${kopf.id}|${kopf.rev}`
  const aktionen = moeglicheAktionen(
    { zustand: kopf.zustand, bauKonto: wep.ablauf?.bau?.id, gruenKonto: wep.ablauf?.gruen?.id, rueckfrageAn: wep.ablauf?.rueckfrage?.an, rueckfrageBei: wep.ablauf?.rueckfrage?.bei },
    sitzung.konto,
  )
  const [pdf, setPdf] = useState<{ stil?: PdfStil; schritt?: string; meldung?: string; fehler?: boolean }>({})
  const [an, setAn] = useState<'bau' | 'gruen' | 'beide'>('beide')
  const [notiz, setNotiz] = useState('')
  const [frage, setFrage] = useState<AblaufAktion>()
  const [meldung, setMeldung] = useState<{ text: string; alarm?: boolean }>()
  const [verlauf, setVerlauf] = useState<VerlaufEintrag[]>()

  useEffect(() => {
    ladeVerlauf(kopf.id)
      .then(setVerlauf)
      .catch(() => setVerlauf(undefined))
  }, [kopf.id, kopf.rev])

  async function ausfuehren(a: AblaufAktion) {
    setFrage(undefined)
    setMeldung(undefined)
    try {
      await schritt(kopf.id, a, kopf.rev)
      setMeldung({ text: a.aktion === 'rueckfrage' ? 'Rückfrage gesendet.' : a.aktion === 'geprueft' ? 'Als geprüft markiert.' : 'Wieder geöffnet.' })
      setNotiz('')
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), alarm: true })
    }
    await onGeaendert()
  }

  async function erzeugePdf(stil: PdfStil) {
    setPdf({ stil, schritt: 'Bereite die Daten vor …' })
    try {
      const erg = await erstellePdf(wep, rolle, stil, {
        quelle,
        mitFotos: (wep.fotos ?? []).length > 0,
        ladeFoto: (fotoId) => ladeFotoVomServer(wep.id, fotoId),
        unterschriften: { bau: pngAusUrl(wep.unterschriften?.bau), gruen: pngAusUrl(wep.unterschriften?.gruen) },
        schritt: (s) => setPdf({ stil, schritt: s }),
      })
      const s = await speichereDatei(erg.blob, erg.name)
      setPdf({ meldung: [speicherText(s, erg.name), ...erg.hinweise].join(' ') })
    } catch (err) {
      setPdf({ meldung: `PDF konnte nicht erstellt werden: ${err instanceof Error ? err.message : String(err)}`, fehler: true })
    }
  }

  const laedt = pdf.stil !== undefined
  const a = wep.ablauf
  return (
    <main className="bv-inhalt">
      <header className="bv-detail-kopf">
        <button type="button" className="textknopf zurueck" onClick={onZurueck}>
          <ChevronLeft {...ICON} />
          Alle WEPs
        </button>
        <h1 className="h1">{wepName(wep)}</h1>
        <p className="neben">
          {[wep.formalien.kleingartenanlage, wep.formalien.parzelle && `Parzelle ${wep.formalien.parzelle}`, `Bau: ${a?.bau?.name ?? '–'}`, `Grün: ${a?.gruen?.name ?? '–'}`].filter(Boolean).join(' · ')}
        </p>
      </header>

      <section className="bv-werkzeuge" aria-label="Prüfen und drucken">
        <p>
          <span className={`bv-status bv-status-${BV_KLASSE[kopf.zustand]}`}>{ZUSTAND_TEXT[kopf.zustand]}</span>
        </p>
        {a?.rueckfrage && (
          <Meldung>
            <p>
              Rückfrage an {a.rueckfrage.an === 'beide' ? 'Bau und Grün' : a.rueckfrage.an === 'bau' ? 'Bau' : 'Grün'} ({a.rueckfrage.von}, {zeitDe(a.rueckfrage.am)}): {a.rueckfrage.notiz}
            </p>
          </Meldung>
        )}
        <p className="neben">
          {wep.unterschriften?.bau || wep.unterschriften?.gruen
            ? `Unterschrift vorhanden: ${[wep.unterschriften?.bau && 'Bau', wep.unterschriften?.gruen && 'Grün'].filter(Boolean).join(' und ')} – sie steht in beiden PDF-Formen.`
            : 'Keine Unterschrift am WEP – die Unterschriftsfelder im PDF bleiben leer.'}
        </p>

        {aktionen.includes('rueckfrage') && (
          <fieldset className="bv-rueckfrage">
            <legend className="label">Rückfrage an</legend>
            <div className="segmente" role="group" aria-label="Rückfrage an">
              {(['bau', 'gruen', 'beide'] as const).map((x) => (
                <button key={x} type="button" className="segment" aria-pressed={an === x} onClick={() => setAn(x)}>
                  {x === 'bau' ? 'Bau' : x === 'gruen' ? 'Grün' : 'Bau und Grün'}
                </button>
              ))}
            </div>
            <label className="label" htmlFor={`${id}-notiz`}>
              Notiz (was soll geklärt werden?)
            </label>
            <textarea id={`${id}-notiz`} className="eingabe" rows={2} value={notiz} onChange={(x) => setNotiz(x.target.value)} />
          </fieldset>
        )}
        {aktionen.includes('wiederoeffnen') && (
          <>
            <label className="label" htmlFor={`${id}-begruendung`}>
              Begründung zum Wieder öffnen
            </label>
            <textarea id={`${id}-begruendung`} className="eingabe" rows={2} value={notiz} onChange={(x) => setNotiz(x.target.value)} />
          </>
        )}
        <div className="knopf-reihe">
          {aktionen.includes('rueckfrage') && (
            <button type="button" className="knopf" disabled={!notiz.trim()} onClick={() => setFrage({ aktion: 'rueckfrage', an, notiz })}>
              <MessageSquareWarning {...ICON} />
              Rückfrage senden
            </button>
          )}
          {aktionen.includes('geprueft') && (
            <button type="button" className="knopf knopf-primaer" onClick={() => setFrage({ aktion: 'geprueft' })}>
              <ShieldCheck {...ICON} />
              Geprüft
            </button>
          )}
          {aktionen.includes('wiederoeffnen') && (
            <button type="button" className="knopf" disabled={!notiz.trim()} onClick={() => setFrage({ aktion: 'wiederoeffnen', begruendung: notiz })}>
              <RotateCcw {...ICON} />
              Wieder öffnen
            </button>
          )}
        </div>
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
        {verlauf && verlauf.length > 0 && (
          <details className="details">
            <summary>Verlauf ({verlauf.length})</summary>
            <ul className="verlauf">
              {verlauf.map((v, i) => (
                <li key={i}>
                  <span className="neben">{zeitDe(v.zeit)}</span> · {v.wer}: {VERLAUF_TEXT[v.aktion] ?? v.aktion}
                  {v.notiz ? ` – „${v.notiz}“` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <Uebersicht
        wep={wep}
        rolle={rolle}
        optionen={{ quelle }}
        titel="Wertermittlungsprotokoll"
        hinweis={`Stand auf dem Server: ${zeitDe(kopf.geaendertAm)}`}
        unten={
          <>
            <Skizzen wep={wep} rolle={rolle} schluessel={schluessel} />
            <Fotos wep={wep} lade={(fotoId) => ladeFotoVomServer(wep.id, fotoId)} schluessel={schluessel} />
          </>
        }
      />

      {frage && (
        <Rueckfrage
          titel={frage.aktion === 'rueckfrage' ? 'Rückfrage senden?' : frage.aktion === 'geprueft' ? 'Als geprüft markieren?' : 'Wieder öffnen?'}
          text={
            frage.aktion === 'rueckfrage'
              ? `Das WEP geht zurück an ${frage.an === 'beide' ? 'Bau und Grün (erst Bau, dann Grün)' : frage.an === 'bau' ? 'Bau' : 'Grün'}. Nach der Bearbeitung kommt es wieder hierher.`
              : frage.aktion === 'geprueft'
                ? 'Danach ist das WEP für alle gesperrt. Wieder öffnen geht nur mit Begründung.'
                : 'Das WEP steht danach wieder „beim BV“; die Begründung kommt in den Verlauf.'
          }
          bestaetigen={frage.aktion === 'rueckfrage' ? 'Senden' : frage.aktion === 'geprueft' ? 'Geprüft' : 'Wieder öffnen'}
          gefahr={false}
          onAbbrechen={() => setFrage(undefined)}
          onBestaetigen={() => void ausfuehren(frage)}
        />
      )}
    </main>
  )
}
