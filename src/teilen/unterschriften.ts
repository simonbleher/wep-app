// Unterschriften im WEP (`Wep.unterschriften`): Beim Teilen (Bau → Grün) und beim Paket „An den BV senden“ kommt die
// Unterschrift des Absenders aus seinem Profil für seinen Teil dazu – ohne Rückfrage, falls eine eingerichtet ist.
// Eine schon mitgereiste Unterschrift des anderen Teils bleibt; so kommen bei Bau → Grün → BV beide an.
import { hatBauTeil, hatGruenTeil, wepRolle, type Rolle, type Wep } from '@/model'
import { exportRolle } from '@/export/ohneBau'
import { istUnterschriftUrl } from '@/unterschrift'

export type UnterschriftTeil = 'bau' | 'gruen'

const gleich = (a: string | undefined, b: string | undefined) => Boolean(a?.trim()) && a!.trim().toLocaleLowerCase('de') === b?.trim().toLocaleLowerCase('de')

/**
 * Für welche Teile unterschreibt der Absender? Seine Rolle (Profil) und die Teile des WEP. Bei „Beides“ mit zwei
 * verschiedenen Wertermittlern in den Formalien nur der Teil, bei dem sein Name steht.
 */
export function absenderTeile(wep: Wep, profil: { name: string; rolle: Rolle }): UnterschriftTeil[] {
  const wepTeile = exportRolle(wep, wepRolle(wep))
  const teile: UnterschriftTeil[] = []
  if (hatBauTeil(profil.rolle) && hatBauTeil(wepTeile)) teile.push('bau')
  if (hatGruenTeil(profil.rolle) && hatGruenTeil(wepTeile)) teile.push('gruen')
  if (teile.length === 2) {
    const f = wep.formalien
    const bau = f.wertermittlerBaulichkeiten
    const gruen = f.wertermittlerAussenAufwuchs
    if (bau?.trim() && gruen?.trim() && !gleich(bau, gruen)) {
      if (gleich(profil.name, bau)) return ['bau']
      if (gleich(profil.name, gruen)) return ['gruen']
    }
  }
  return teile
}

/** Nur gültige PNG-Data-URLs; leer → `undefined`. */
export function saubereUnterschriften(u: unknown): Wep['unterschriften'] {
  if (!u || typeof u !== 'object') return undefined
  const roh = u as Record<string, unknown>
  const aus: NonNullable<Wep['unterschriften']> = {}
  if (istUnterschriftUrl(roh.bau)) aus.bau = roh.bau
  if (istUnterschriftUrl(roh.gruen)) aus.gruen = roh.gruen
  return aus.bau || aus.gruen ? aus : undefined
}

/** Unterschriften für die Datei: die mitgereisten, dazu die des Absenders für seine Teile. */
export function unterschriftenFuerDatei(wep: Wep, profil: { name: string; rolle: Rolle; unterschrift?: string }): Wep['unterschriften'] {
  const aus = { ...saubereUnterschriften(wep.unterschriften) }
  if (istUnterschriftUrl(profil.unterschrift)) for (const t of absenderTeile(wep, profil)) aus[t] = profil.unterschrift
  return saubereUnterschriften(aus)
}
