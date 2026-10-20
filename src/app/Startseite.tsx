// Startseite: Liste aller WEPs, Statuszeile Abgleich und „Neues WEP“.
// Gelöscht wird nicht hier, sondern in der WEP-Ansicht (Menü „⋯“, mit Rückfrage).
import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, CircleUser, FileText, Plus } from 'lucide-react'
import { WEP_STATUS, naechsteVorgangsNr, wepStatus, type Wep, type WepStatus } from '@/model'
import type { Konto } from '@/konto'
import { lokalesProfil, neuerWepMitProfil } from '@/profil'
import { alleWeps, speichereWep } from './db'
import { UpdateHinweis } from './UpdateHinweis'
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

export function Startseite({ konto, verfuegbar, onProfil, onOeffnen }: Props) {
  const [weps, setWeps] = useState<Wep[]>([])
  const [geladen, setGeladen] = useState(false)
  const [filter, setFilter] = useState<WepStatus | 'alle'>('alle')

  const neuLaden = useCallback(() => {
    void alleWeps().then((liste) => {
      // Neueste Vorgangs-Nr. zuerst
      setWeps([...liste].sort((a, b) => b.id.localeCompare(a.id, 'de', { numeric: true })))
      setGeladen(true)
    })
  }, [])

  useEffect(neuLaden, [neuLaden])
  const abgleich = useAbgleich(konto, neuLaden)

  async function neuesWep() {
    const id = naechsteVorgangsNr(weps)
    const wep = neuerWepMitProfil(id, lokalesProfil.lade().profil)
    await speichereWep(wep)
    setWeps((alt) => [wep, ...alt])
    onOeffnen(id)
  }

  const sichtbar = filter === 'alle' ? weps : weps.filter((w) => wepStatus(w) === filter)

  const status = <StatusZeile konto={konto} verfuegbar={verfuegbar} abgleich={abgleich} />

  return (
    <div className="rahmen">
      <HauptSeitenleiste aktiv="protokolle" onProtokolle={() => undefined} onProfil={onProfil} fuss={verfuegbar ? status : undefined} />

      <main className="inhalt">
        <UpdateHinweis />
        <header className="seitenkopf">
          <h1 className="h1">Protokolle</h1>
          <button type="button" className="symbolknopf nur-handy" aria-label="Profil und Einstellungen" onClick={onProfil}>
            <CircleUser {...ICON} size={26} />
          </button>
          <button type="button" className="knopf knopf-primaer nur-tablet" onClick={() => void neuesWep()}>
            <Plus {...ICON} />
            Neues WEP
          </button>
        </header>

        <div className="nur-handy block">
          {status}
          <button type="button" className="knopf knopf-primaer knopf-breit" onClick={() => void neuesWep()}>
            <Plus {...ICON} />
            Neues WEP
          </button>
        </div>

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
                    <StatusMarke status={wepStatus(wep)} />
                    <ChevronRight {...ICON} className="chevron" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
