// Gemeinsame Bausteine des App-Rahmens (Beta 2, Schritt 4): Kopfzeile (Handy),
// Seitenleiste (Tablet ≥ 900 px), Einträge darin und Zahlenformate.
// Strich-Icons aus lucide-react, Farben nur über die Tokens (styles.css).
import { useEffect, useId, type ReactNode } from 'react'
import { CircleUser, FileText, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Rolle, WepStatus } from '@/model'

/** Einheitliche Icon-Größe und Strichstärke. */
export const ICON = { size: 22, strokeWidth: 1.75, 'aria-hidden': true } as const

/** Kleine Statusmarke eines WEP: in Arbeit · fertig · exportiert. */
export function StatusMarke({ status }: { status: WepStatus }) {
  return <span className={`status status-${status === 'in Arbeit' ? 'arbeit' : status}`}>{status === 'in Arbeit' ? 'In Arbeit' : status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

/** Kurztext für den bearbeiteten Teil eines WEP. */
export const TEIL_TEXT: Record<Rolle, string> = { gruen: 'Grün', bau: 'Bau', beides: 'Grün + Bau' }

/** Kleine Marke: welcher Teil des WEP bearbeitet wird (Grün · Bau · Grün + Bau). */
export function TeilMarke({ rolle }: { rolle: Rolle }) {
  return (
    <span className={`status status-teil status-teil-${rolle}`} title="Bearbeiteter Teil">
      {TEIL_TEXT[rolle]}
    </span>
  )
}

export function euroFormat(wert: number): string {
  return wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

/** ISO-Zeitpunkt → „20.10.2026, 14:05“ (Ortszeit); Unlesbares bleibt unverändert. */
export function zeitDe(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** „2026-10-14“ → „14.10.2026“; anderes bleibt unverändert. */
export function datumDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

/** Kopfzeile auf dem Handy: links Zurück, Mitte Titel, rechts Aktionen. */
export function Kopf({
  links,
  titel,
  unter,
  rechts,
}: {
  links?: ReactNode
  titel: string
  unter?: string
  rechts?: ReactNode
}) {
  return (
    <header className="kopf nur-handy">
      <div className="kopf-links">{links}</div>
      <div className="kopf-mitte">
        <span className="kopf-titel">{titel}</span>
        {unter && <span className="kopf-unter">{unter}</span>}
      </div>
      <div className="kopf-rechts">{rechts}</div>
    </header>
  )
}

/** Eintrag der Seitenleiste (Tablet). */
export function SlEintrag({
  icon: Icon,
  text,
  wert,
  aktiv,
  onClick,
}: {
  icon: LucideIcon
  text: string
  wert?: string
  aktiv?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="sl-eintrag" aria-current={aktiv ? 'page' : undefined} onClick={onClick}>
      <Icon {...ICON} />
      <span>{text}</span>
      {wert !== undefined && <span className="zahl sl-summe">{wert}</span>}
    </button>
  )
}

/** Seitenleiste der Startseite und des Profils (Tablet). */
export function HauptSeitenleiste({
  aktiv,
  onProtokolle,
  onPapierkorb,
  onProfil,
  fuss,
}: {
  aktiv: 'protokolle' | 'papierkorb' | 'profil'
  onProtokolle: () => void
  onPapierkorb?: () => void
  onProfil: () => void
  fuss?: ReactNode
}) {
  return (
    <aside className="seitenleiste" aria-label="Navigation">
      <div className="sl-app">WEP</div>
      <nav className="sl-nav">
        <SlEintrag icon={FileText} text="Protokolle" aktiv={aktiv === 'protokolle'} onClick={onProtokolle} />
        {onPapierkorb && <SlEintrag icon={Trash2} text="Papierkorb" aktiv={aktiv === 'papierkorb'} onClick={onPapierkorb} />}
        <SlEintrag icon={CircleUser} text="Profil und Einstellungen" aktiv={aktiv === 'profil'} onClick={onProfil} />
      </nav>
      {fuss && <div className="sl-fuss">{fuss}</div>}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Dialoge, Rückfragen, Leer- und Fehlerzustände (einheitlich in der ganzen App)
// ---------------------------------------------------------------------------

/**
 * Dialog auf voller Fläche (keine Transparenz). Escape schließt ihn; ein Tipp daneben
 * nicht, damit auf der Parzelle nichts versehentlich verloren geht.
 */
export function Dialog({
  titel,
  children,
  onSchliessen,
  rueckfrage = false,
}: {
  titel: string
  children: ReactNode
  onSchliessen: () => void
  /** true: Rückfrage vor einer Aktion (role „alertdialog“) */
  rueckfrage?: boolean
}) {
  const id = useId()
  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === 'Escape' && onSchliessen()
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [onSchliessen])

  return (
    <div className="dialog-hintergrund">
      <div className="dialog" role={rueckfrage ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={`${id}-t`}>
        <h2 className="h2" id={`${id}-t`}>
          {titel}
        </h2>
        {children}
      </div>
    </div>
  )
}

/** Rückfrage vor dem Löschen: „Abbrechen“ (vorfokussiert) und der rote Knopf (`gefahr={false}`: grüner Knopf, z. B. Abgabe). */
export function Rueckfrage({
  titel,
  text,
  bestaetigen = 'Löschen',
  gefahr = true,
  onAbbrechen,
  onBestaetigen,
}: {
  titel: string
  text: string
  bestaetigen?: string
  gefahr?: boolean
  onAbbrechen: () => void
  onBestaetigen: () => void
}) {
  return (
    <Dialog titel={titel} rueckfrage onSchliessen={onAbbrechen}>
      <p>{text}</p>
      <div className="dialog-knoepfe">
        <button type="button" className="knopf" autoFocus onClick={onAbbrechen}>
          Abbrechen
        </button>
        <button type="button" className={gefahr ? 'knopf knopf-gefahr' : 'knopf knopf-primaer'} onClick={onBestaetigen}>
          {bestaetigen}
        </button>
      </div>
    </Dialog>
  )
}

/** Leerer Zustand einer Liste oder eines Abschnitts: Icon, Titel, Erklärung, ggf. Aktion. */
export function LeerZustand({
  icon: Icon,
  titel,
  text,
  aktion,
}: {
  icon: LucideIcon
  titel: string
  text?: string
  aktion?: ReactNode
}) {
  return (
    <div className="leerzustand">
      <Icon {...ICON} size={32} strokeWidth={1.5} />
      <p className="leer-titel">{titel}</p>
      {text && <p className="neben">{text}</p>}
      {aktion}
    </div>
  )
}

/** Fehler- und Warnmeldung: roter Streifen mit Icon. `alarm`: sofort vorlesen (Fehler). */
export function Meldung({ children, alarm = false }: { children: ReactNode; alarm?: boolean }) {
  return (
    <div className="warnung" role={alarm ? 'alert' : 'note'}>
      <TriangleAlert {...ICON} size={20} />
      <div className="warnung-text">{children}</div>
    </div>
  )
}

/** Ladezustand (kurz, nur beim Öffnen aus IndexedDB). */
export function Laedt() {
  return (
    <p className="leertext" role="status">
      Lade …
    </p>
  )
}
