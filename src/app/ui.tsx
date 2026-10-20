// Gemeinsame Bausteine des App-Rahmens (Beta 2, Schritt 4): Kopfzeile (Handy),
// Seitenleiste (Tablet ≥ 900 px), Einträge darin und Zahlenformate.
// Strich-Icons aus lucide-react, Farben nur über die Tokens (styles.css).
import type { ReactNode } from 'react'
import { CircleUser, FileText, type LucideIcon } from 'lucide-react'

/** Einheitliche Icon-Größe und Strichstärke. */
export const ICON = { size: 22, strokeWidth: 1.75, 'aria-hidden': true } as const

export function euroFormat(wert: number): string {
  return wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
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
  onProfil,
  fuss,
}: {
  aktiv: 'protokolle' | 'profil'
  onProtokolle: () => void
  onProfil: () => void
  fuss?: ReactNode
}) {
  return (
    <aside className="seitenleiste" aria-label="Navigation">
      <div className="sl-app">WEP</div>
      <nav className="sl-nav">
        <SlEintrag icon={FileText} text="Protokolle" aktiv={aktiv === 'protokolle'} onClick={onProtokolle} />
        <SlEintrag icon={CircleUser} text="Profil und Einstellungen" aktiv={aktiv === 'profil'} onClick={onProfil} />
      </nav>
      {fuss && <div className="sl-fuss">{fuss}</div>}
    </aside>
  )
}
