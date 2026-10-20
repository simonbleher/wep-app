// Öffentliche Schnittstelle des Konto-Moduls: anmelden, abmelden, aktuellesKonto,
// zugriffstoken, istAngemeldet. Welche Umsetzung dahinter steckt (Web/Android),
// entscheidet `setzeKontoDienst` – in der Web-App ist es MSAL.js,
// in der Android-App die Anmeldung über den System-Browser (android.ts).
import { Capacitor } from '@capacitor/core'
import { erstelleAndroidKontoDienst } from './android'
import { androidAbhaengigkeiten } from './android-plattform'
import { erstelleWebKontoDienst } from './web'
import { ermittleStart, type Start } from './startwahl'
import type { Konto, KontoDienst } from './types'

export type { Konto, KontoDienst } from './types'
export { speichereStartWahl, type Start } from './startwahl'

/** Plattform automatisch: in der Android-App System-Browser + PKCE, sonst MSAL.js. */
function standardDienst(): KontoDienst {
  const clientId = import.meta.env.VITE_MS_CLIENT_ID
  return Capacitor.isNativePlatform()
    ? erstelleAndroidKontoDienst(clientId, androidAbhaengigkeiten())
    : erstelleWebKontoDienst(clientId)
}

let dienst: KontoDienst = standardDienst()

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
