// Startseite: Liste aller WEPs, Statuszeile Abgleich und „Neues WEP“.
// Gelöscht wird nicht hier, sondern in der WEP-Ansicht (Menü „⋯“, mit Rückfrage).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, CircleUser, FileSpreadsheet, FileText, Plus, Trash2 } from 'lucide-react'
import { WEP_STATUS, naechsteVorgangsNr, wepStatus, type Wep, type WepStatus } from '@/model'
import type { Konto } from '@/konto'
import { lokalesProfil, neuerWepMitProfil } from '@/profil'
import { belegteNummern, ladePapierkorb, offeneKonflikte, raeumePapierkorbAuf } from '@/sync/aktionen'
import { alleWeps, speichereWep } from './db'
import { UpdateHinweis } from './UpdateHinweis'
import { BAU_EXCEL_ACCEPT } from './BauExcel'
import { legeWepAusBauExcelAn } from '@/bauexcel/neu'
import { StatusZeile, useAbgleich } from './SyncLeiste'
import { HauptSeitenleiste, ICON, Laedt, LeerZustand, Meldung, StatusMarke, datumDe } from './ui'

interface Props {
  /** Angemeldetes Konto oder null („ohne Konto“). */
  konto: Konto | null
  /** Ist die Anmeldung auf dieser Plattform eingerichtet? */
  verfuegbar: boolean
  onProfil: () => void
  /** Öffnet die Detailansicht des WEP mit der angegebenen id. */
  onOeffnen: (wepId: string) => void
  onPapierkorb: () => void
}

/** Titel eines WEP für die Liste: „Anlage · Parzelle“ (leer, wenn nichts eingetragen). */
export function wepTitel(wep: Wep): string {
  const { parzelle, kleingartenanlage } = wep.formalien
  return [kleingartenanlage, parzelle].filter((t) => t.trim().length > 0).join(' · ')
}

/** Nebenzeile: „Vorgangs-Nr. · Unterpächter · Datum“. */
function wepNeben(wep: Wep): string {
  const { unterpaechter, wertermittlungAm } = wep.formalien
  return [wep.id, unterpaechter, datumDe(wertermittlungAm ?? '')].filter((t) => t && t.trim()).join(' · ')
}

export function Startseite({ konto, verfuegbar, onProfil, onOeffnen, onPapierkorb }: Props) {
  const [weps, setWeps] = useState<Wep[]>([])
  const [geladen, setGeladen] = useState(false)
  const [filter, setFilter] = useState<WepStatus | 'alle'>('alle')
  const [konflikte, setKonflikte] = useState<ReadonlySet<string>>(new Set())
  const [imPapierkorb, setImPapierkorb] = useState(0)
  const [fehler, setFehler] = useState<string>()
  const bauEingabe = useRef<HTMLInputElement>(null)

  const neuLaden = useCallback(() => {
    // Was länger als 30 Tage im Papierkorb liegt, wird beim Öffnen der Liste endgültig gelöscht
    void (async () => {
      await raeumePapierkorbAuf()
      const [liste, offene, korb] = await Promise.all([alleWeps(), offeneKonflikte(), ladePapierkorb()])
      // Neueste Vorgangs-Nr. zuerst
      setWeps([...liste].sort((a, b) => b.id.localeCompare(a.id, 'de', { numeric: true })))
      setKonflikte(new Set(offene.keys()))
      setImPapierkorb(korb.length)
      setGeladen(true)
    })()
  }, [])

  useEffect(neuLaden, [neuLaden])
  const abgleich = useAbgleich(konto, neuLaden)

  async function neuesWep() {
    const id = naechsteVorgangsNr(await belegteNummern()) // auch Gelöschtes zählt: keine Nummer doppelt
    const wep = neuerWepMitProfil(id, lokalesProfil.lade().profil)
    await speichereWep(wep)
    setWeps((alt) => [wep, ...alt])
    onOeffnen(id)
  }

  /** „Neues WEP aus Bau-Excel“: Datei prüfen, WEP anlegen, Formalien vorbefüllen, öffnen. */
  async function neuesWepAusBauExcel(datei: File) {
    setFehler(undefined)
    try {
      const id = naechsteVorgangsNr(await belegteNummern())
      const wep = await legeWepAusBauExcelAn({ id, datei, profil: lokalesProfil.lade().profil })
      setWeps((alt) => [wep, ...alt])
      onOeffnen(id)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  const sichtbar = filter === 'alle' ? weps : weps.filter((w) => wepStatus(w) === filter)

  const status = <StatusZeile konto={konto} verfuegbar={verfuegbar} abgleich={abgleich} />

  return (
    <div className="rahmen">
      <HauptSeitenleiste aktiv="protokolle" onProtokolle={() => undefined} onPapierkorb={onPapierkorb} onProfil={onProfil} fuss={verfuegbar ? status : undefined} />

      <main className="inhalt">
        <UpdateHinweis />
        <header className="seitenkopf">
          <h1 className="h1">Protokolle</h1>
          <button type="button" className="symbolknopf nur-handy" aria-label="Profil und Einstellungen" onClick={onProfil}>
            <CircleUser {...ICON} size={26} />
          </button>
          <div className="knopf-reihe nur-tablet">
            <button type="button" className="knopf" onClick={() => bauEingabe.current?.click()}>
              <FileSpreadsheet {...ICON} />
              Neues WEP aus Bau-Excel
            </button>
            <button type="button" className="knopf knopf-primaer" onClick={() => void neuesWep()}>
              <Plus {...ICON} />
              Neues WEP
            </button>
          </div>
        </header>

        <div className="nur-handy block">
          {status}
          <button type="button" className="knopf knopf-primaer knopf-breit" onClick={() => void neuesWep()}>
            <Plus {...ICON} />
            Neues WEP
          </button>
          <button type="button" className="knopf knopf-breit" onClick={() => bauEingabe.current?.click()}>
            <FileSpreadsheet {...ICON} />
            Neues WEP aus Bau-Excel
          </button>
        </div>
        <input
          ref={bauEingabe}
          type="file"
          hidden
          accept={BAU_EXCEL_ACCEPT}
          aria-label="Bau-Excel für ein neues WEP wählen"
          data-testid="neu-bau-excel-eingabe"
          onChange={(e) => {
            const datei = e.target.files?.[0]
            e.target.value = ''
            if (datei) void neuesWepAusBauExcel(datei)
          }}
        />
        {fehler && (
          <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
        )}

        {abgleich.hinweise.map((h) => (
          <Meldung key={h.wepId + h.text}>
            <p>{h.text}</p>
          </Meldung>
        ))}

        {geladen && weps.length > 0 && (
          <div className="segmente status-filter" role="group" aria-label="Nach Status filtern">
            {(['alle', ...WEP_STATUS] as const).map((f) => (
              <button key={f} type="button" className="segment" aria-pressed={f === filter} onClick={() => setFilter(f)}>
                {f === 'alle' ? 'Alle' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}

        {!geladen ? (
          <Laedt />
        ) : weps.length === 0 ? (
          <LeerZustand
            icon={FileText}
            titel="Noch kein Protokoll"
            text="Mit „Neues WEP“ ein erstes Protokoll anlegen."
          />
        ) : sichtbar.length === 0 ? (
          <LeerZustand
            icon={FileText}
            titel={`Kein Protokoll „${filter}“`}
            text="Mit „Alle“ sind wieder alle Protokolle zu sehen."
          />
        ) : (
          <ul className="liste" aria-label="Protokolle">
            {sichtbar.map((wep) => {
              const titel = wepTitel(wep)
              return (
                <li key={wep.id}>
                  <button type="button" className="zeile" onClick={() => onOeffnen(wep.id)}>
                    <span className="zeile-text">
                      <span className={titel ? 'zeile-titel' : 'zeile-titel leer'}>{titel || 'ohne Bezeichnung'}</span>
                      <span className="neben">{wepNeben(wep)}</span>
                    </span>
                    {konflikte.has(wep.id) && <span className="status status-konflikt">Konflikt</span>}
                    <StatusMarke status={wepStatus(wep)} />
                    <ChevronRight {...ICON} className="chevron" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <ul className="liste papierkorb-zugang nur-handy" aria-label="Papierkorb">
          <li>
            <button type="button" className="zeile" onClick={onPapierkorb}>
              <Trash2 {...ICON} />
              <span className="zeile-text">
                <span className="zeile-titel">Papierkorb</span>
                <span className="neben">
                  {imPapierkorb === 0 ? 'leer' : imPapierkorb === 1 ? '1 gelöschtes Protokoll' : `${imPapierkorb} gelöschte Protokolle`}
                </span>
              </span>
              <ChevronRight {...ICON} className="chevron" />
            </button>
          </li>
        </ul>
      </main>
    </div>
  )
}
