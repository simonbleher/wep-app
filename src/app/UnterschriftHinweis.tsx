// Hinweis beim Teilen und beim Paket für den BV (nur Info): Die eigene Unterschrift reist für den eigenen Teil mit.
import { lokalesProfil } from '@/profil'
import type { Rolle, Wep } from '@/model'
import { absenderTeile } from '@/teilen/unterschriften'
import { ladeUnterschriftUrl } from '@/unterschrift'

/** Absender für `erstelleTeilen`: Name, Rolle und Unterschrift aus dem Profil dieses Geräts. */
export function absenderAusProfil(): { name: string; rolle: Rolle; unterschrift?: string } {
  const p = lokalesProfil.lade().profil
  return { name: p.name, rolle: p.rolle, unterschrift: ladeUnterschriftUrl() }
}

export function UnterschriftHinweis({ wep }: { wep: Wep }) {
  const absender = absenderAusProfil()
  if (!absender.unterschrift) return <p className="neben">Keine Unterschrift eingerichtet – Profil → Meine Unterschrift.</p>
  const teile = absenderTeile(wep, absender)
  if (!teile.length) return null
  const teil = teile.length === 2 ? '' : teile[0] === 'bau' ? ' (Teil Bau)' : ' (Teil Grün)'
  return <p className="neben">Deine Unterschrift wird mitgeschickt{teil}.</p>
}
