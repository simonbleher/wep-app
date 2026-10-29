// Startseite: Liste aller WEPs, Statuszeile Abgleich und „Neues WEP“.
// Gelöscht wird nicht hier, sondern in der WEP-Ansicht (Menü „⋯“, mit Rückfrage).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, CircleUser, FileInput, FileSpreadsheet, FileText, Plus, Search, Trash2, X } from 'lucide-react'
import { WEP_STATUS, neueWepId, vorgangsNrVon, wepRolle, wepStatus, type Wep, type WepStatus } from '@/model'
import type { Konto } from '@/konto'
import { lokalesProfil, neuerWepMitProfil } from '@/profil'
import { ladePapierkorb, offeneKonflikte, raeumePapierkorbAuf } from '@/sync/aktionen'
import { alleSyncMeta, alleWeps, speichereWep } from './db'
import { SORTIERUNGEN, waehleWeps, type Sortierung } from './wepListe'
import { UpdateHinweis } from './UpdateHinweis'
import { BAU_EXCEL_ACCEPT } from './BauExcel'
import { useOhneExcel } from './ohneExcel'
import { NeuesWepDialog } from './VorgangsNr'
import { legeWepAusBauExcelAn } from '@/bauexcel/neu'
import { StatusZeile, useAbgleich } from './SyncLeiste'
import { HauptSeitenleiste, ICON, Laedt, LeerZustand, Meldung, StatusMarke, TeilMarke, datumDe } from './ui'
import { appMitServer, serverModus } from '@/server/modus'
import { gemerktesKonto } from '@/server/api'
import { ZustandMarke } from '@/server/AbgabeBereich'
import { NeuFuerDich } from '@/server/NeuFuerDich'
import { Altbestand } from '@/server/Altbestand'
import { zustandVon } from '@/server/ablaufDienst'
import { RechtLinks } from './RechtLinks'

/** Server-Modus (v2): Neue WEPs legen Bau (Bau-WEP) und Grün (eigenes Grün-WEP, wie in v1) an. */
const darfNeuesWep = () => !serverModus || Boolean(gemerktesKonto()?.rollen.some((r) => r === 'bau' || r === 'gruen'))

interface Props {
  /** Angemeldetes Konto oder null („ohne Konto“). */
  konto: Konto | null
  /** Ist die Anmeldung auf dieser Plattform eingerichtet? */
  verfuegbar: boolean
  onProfil: () => void
  /** Öffnet die Detailansicht des WEP mit der angegebenen id. */
  onOeffnen: (wepId: string) => void
  onPapierkorb: () => void
  /** Eine .wep-Datei wurde gewählt: Vorschau zeigen. */
  onWepDatei: (datei: File) => void
}

/** Titel eines WEP für die Liste: „Anlage · Parzelle“ (leer, wenn nichts eingetragen). */
export function wepTitel(wep: Wep): string {
  const { parzelle, kleingartenanlage } = wep.formalien
  return [kleingartenanlage, parzelle].filter((t) => t.trim().length > 0).join(' · ')
}

/** Nebenzeile: „Vorgangs-Nr. · Unterpächter · Datum“. */
function wepNeben(wep: Wep): string {
  const { unterpaechter, wertermittlungAm } = wep.formalien
  return [vorgangsNrVon(wep) || 'Vorgangs-Nr. fehlt', unterpaechter, datumDe(wertermittlungAm ?? ''), wep.anBvGesendetAm ? `an BV gesendet ${datumDe(wep.anBvGesendetAm.slice(0, 10))}` : ''].filter((t) => t && t.trim()).join(' · ')
}

export function Startseite({ konto, verfuegbar, onProfil, onOeffnen, onPapierkorb, onWepDatei }: Props) {
  const ohneExcel = useOhneExcel()
  const [neuDialog, setNeuDialog] = useState(false)
  const [weps, setWeps] = useState<Wep[]>([])
  const [geladen, setGeladen] = useState(false)
  const [filter, setFilter] = useState<WepStatus | 'alle'>('alle')
  const [suchbegriff, setSuchbegriff] = useState('')
  const [sortierung, setSortierung] = useState<Sortierung>('geaendert')
  const [geaendertAm, setGeaendertAm] = useState<ReadonlyMap<string, string>>(new Map())
  const [konflikte, setKonflikte] = useState<ReadonlySet<string>>(new Set())
  const [imPapierkorb, setImPapierkorb] = useState(0)
  const [fehler, setFehler] = useState<string>()
  const bauEingabe = useRef<HTMLInputElement>(null)
  const wepEingabe = useRef<HTMLInputElement>(null)
  // Rolle aus dem Profil; ein WEP kann davon abweichen (`Wep.rolle`)
  const profilRolle = lokalesProfil.lade().profil.rolle

  const neuLaden = useCallback(() => {
    // Was länger als 30 Tage im Papierkorb liegt, wird beim Öffnen der Liste endgültig gelöscht
    void (async () => {
      await raeumePapierkorbAuf()
      const [liste, offene, korb, meta] = await Promise.all([alleWeps(), offeneKonflikte(), ladePapierkorb(), alleSyncMeta()])
      // Server-Modus: ein eigenes WEP, das (lokal) in ein Bau-WEP zusammengeführt ist, steht nicht mehr in der Liste
      const ausgeblendet = new Set(meta.filter((m) => m.zusammengefuehrtIn).map((m) => m.id))
      setWeps(liste.filter((w) => !ausgeblendet.has(w.id)))
      setGeaendertAm(new Map(meta.map((m) => [m.id, m.lokalGeaendertAm])))
      setKonflikte(new Set(offene.keys()))
      setImPapierkorb(korb.length)
      setGeladen(true)
    })()
  }, [])

  useEffect(neuLaden, [neuLaden])
  const abgleich = useAbgleich(konto, neuLaden)

  /** Legt das WEP an, nachdem der Dialog die Vorgangs-Nr. erfragt hat (leer = „noch nicht bekannt“). */
  async function neuesWep(vorgangsNr: string) {
    setNeuDialog(false)
    // Interne Kennung: UUID; die Vorgangs-Nr. vergibt der BV
    const id = neueWepId()
    const wep = neuerWepMitProfil(id, lokalesProfil.lade().profil)
    wep.formalien.vorgangsNr = vorgangsNr
    await speichereWep(wep)
    setWeps((alt) => [wep, ...alt])
    onOeffnen(id)
  }

  /** „Neues WEP aus Bau-Excel“: Datei prüfen, WEP anlegen, Formalien vorbefüllen, öffnen. */
  async function neuesWepAusBauExcel(datei: File) {
    setFehler(undefined)
    try {
      const id = neueWepId() // Vorgangs-Nr. kommt aus der Bau-Excel (E17), sonst später eintragen
      const wep = await legeWepAusBauExcelAn({ id, datei, profil: lokalesProfil.lade().profil })
      setWeps((alt) => [wep, ...alt])
      onOeffnen(id)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  const sichtbar = waehleWeps(weps, { suchbegriff, status: filter, sortierung, geaendertAm })
  const gefiltert = suchbegriff.trim() !== '' || filter !== 'alle'

  const status = <StatusZeile konto={konto} verfuegbar={verfuegbar} abgleich={abgleich} />
  const neuErlaubt = darfNeuesWep()

  /** „Neu für dich“: ist das WEP noch nicht auf dem Gerät, erst abgleichen. */
  async function oeffneNachricht(wepId: string) {
    if (!weps.some((w) => w.id === wepId)) await abgleich.abgleichen()
    onOeffnen(wepId)
  }

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
            <button type="button" className="knopf" onClick={() => wepEingabe.current?.click()}>
              <FileInput {...ICON} />
              WEP-Datei öffnen
            </button>
            {!ohneExcel && (
              <button type="button" className="knopf" onClick={() => bauEingabe.current?.click()}>
                <FileSpreadsheet {...ICON} />
                Neues WEP aus Bau-Excel
              </button>
            )}
            {neuErlaubt && (
              <button type="button" className="knopf knopf-primaer" onClick={() => setNeuDialog(true)}>
                <Plus {...ICON} />
                Neues WEP
              </button>
            )}
          </div>
        </header>
        {!neuErlaubt && <p className="neben block">Neue WEPs legt der Bau-Wertermittler an; abgegebene WEPs erscheinen hier nach dem Abgleich.</p>}
        {serverModus && <NeuFuerDich onOeffnen={(id) => void oeffneNachricht(id)} />}
        {appMitServer && <Altbestand startseite />}

        <div className="nur-handy block">
          {status}
          {neuErlaubt && (
            <button type="button" className="knopf knopf-primaer knopf-breit" onClick={() => setNeuDialog(true)}>
              <Plus {...ICON} />
              Neues WEP
            </button>
          )}
          {!ohneExcel && (
            <button type="button" className="knopf knopf-breit" onClick={() => bauEingabe.current?.click()}>
              <FileSpreadsheet {...ICON} />
              Neues WEP aus Bau-Excel
            </button>
          )}
          <button type="button" className="knopf knopf-breit" onClick={() => wepEingabe.current?.click()}>
            <FileInput {...ICON} />
            WEP-Datei öffnen
          </button>
        </div>
        <input
          ref={wepEingabe}
          type="file"
          hidden
          aria-label="WEP-Datei wählen"
          data-testid="wep-datei-eingabe"
          onChange={(e) => {
            const datei = e.target.files?.[0]
            e.target.value = ''
            if (datei) onWepDatei(datei)
          }}
        />
        {!ohneExcel && (
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
        )}
        {neuDialog && <NeuesWepDialog onAnlegen={(nr) => void neuesWep(nr)} onAbbrechen={() => setNeuDialog(false)} />}
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
          <>
            <div className="suchfeld suchfeld-liste">
              <Search {...ICON} className="suchfeld-icon" />
              <input
                type="search"
                className="eingabe"
                aria-label="Protokolle durchsuchen"
                placeholder="Nummer, Anlage, Parzelle, Pächter"
                value={suchbegriff}
                onChange={(e) => setSuchbegriff(e.target.value)}
                enterKeyHint="search"
                autoComplete="off"
              />
              {suchbegriff && (
                <button type="button" className="symbolknopf suchfeld-leeren" aria-label="Suche leeren" onClick={() => setSuchbegriff('')}>
                  <X {...ICON} />
                </button>
              )}
            </div>
            {/* Im Server-Modus zeigt der Zustand im Ablauf, wo ein WEP steht; der Status von v1 entfällt */}
            {!serverModus && (
              <div className="segmente status-filter" role="group" aria-label="Nach Status filtern">
                {(['alle', ...WEP_STATUS] as const).map((f) => (
                  <button key={f} type="button" className="segment" aria-pressed={f === filter} onClick={() => setFilter(f)}>
                    {f === 'alle' ? 'Alle' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            )}
            <div className="listen-kopf">
              <p className="neben" role="status" data-testid="listen-anzahl">
                {gefiltert ? `${sichtbar.length} von ${weps.length} Protokollen` : weps.length === 1 ? '1 Protokoll' : `${weps.length} Protokolle`}
              </p>
              <div className="segmente segmente-2" role="group" aria-label="Sortierung">
                {SORTIERUNGEN.map((s) => (
                  <button key={s.wert} type="button" className="segment" aria-pressed={s.wert === sortierung} onClick={() => setSortierung(s.wert)}>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          </>
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
            titel={suchbegriff.trim() ? `Kein Protokoll zu „${suchbegriff.trim()}“` : `Kein Protokoll „${filter}“`}
            text={suchbegriff.trim() ? 'Anderen Suchbegriff eingeben oder die Suche leeren.' : 'Mit „Alle“ sind wieder alle Protokolle zu sehen.'}
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
                    <TeilMarke rolle={wepRolle(wep, profilRolle)} />
                    {serverModus ? <ZustandMarke zustand={zustandVon(wep)} /> : <StatusMarke status={wepStatus(wep)} />}
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
        <RechtLinks />
      </main>
    </div>
  )
}
