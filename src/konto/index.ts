// Öffentliche Schnittstelle des Konto-Moduls: anmelden, abmelden, aktuellesKonto,
// zugriffstoken, istAngemeldet. Welche Umsetzung dahinter steckt (Web/Android),
// entscheidet `setzeKontoDienst` – in der Web-App ist es MSAL.js.
import { erstelleWebKontoDienst } from './web'
import { ermittleStart, type Start } from './startwahl'
import type { Konto, KontoDienst } from './types'

export type { Konto, KontoDienst } from './types'
export { speichereStartWahl, type Start } from './startwahl'

let dienst: KontoDienst = erstelleWebKontoDienst(import.meta.env.VITE_MS_CLIENT_ID)

/** Tauscht die Umsetzung aus (Tests; später die Android-Umsetzung). */
export function setzeKontoDienst(neu: KontoDienst): void {
  dienst = neu
}

export const kontoVerfuegbar = (): boolean => dienst.verfuegbar()
export const anmelden = (): Promise<void> => dienst.anmelden()
export const abmelden = (): Promise<void> => dienst.abmelden()
export const aktuellesKonto = (): Promise<Konto | null> => dienst.aktuellesKonto()
export const zugriffstoken = (): Promise<string> => dienst.zugriffstoken()

export async function istAngemeldet(): Promise<boolean> {
  return (await dienst.aktuellesKonto()) !== null
}

/** Soll beim App-Start der Login-Bildschirm kommen oder direkt die Startseite? */
export const startZustand = (): Promise<Start> => ermittleStart(dienst)
