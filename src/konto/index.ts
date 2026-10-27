// Öffentliche Schnittstelle des Konto-Moduls: anmelden, abmelden, aktuellesKonto,
// zugriffstoken, istAngemeldet. Welche Umsetzung dahinter steckt (Web/Android/Windows),
// entscheidet `setzeKontoDienst` – in der Web-App ist es MSAL.js, in der Android-App
// (android.ts) und im Windows-Programm (windows.ts) die Anmeldung über den System-Browser.
import { Capacitor } from '@capacitor/core'
import { erstelleAndroidKontoDienst } from './android'
import { androidAbhaengigkeiten } from './android-plattform'
import { windowsAbhaengigkeiten } from './windows-plattform'
import { erstelleWindowsKontoDienst } from './windows'
import { istWindowsApp } from '@/windows/plattform'
import { erstelleWebKontoDienst } from './web'
import { ermittleStart, type Start } from './startwahl'
import type { Konto, KontoDienst } from './types'

export type { Konto, KontoDienst } from './types'
export { speichereStartWahl, type Start } from './startwahl'
export { anmeldeFehlerText } from './fehler'

/**
 * Plattform automatisch: in der Android-App System-Browser + PKCE (Rücksprung per App-Link),
 * im Windows-Programm System-Browser + PKCE (Rücksprung über localhost), sonst MSAL.js.
 */
function standardDienst(): KontoDienst {
  const clientId = import.meta.env.VITE_MS_CLIENT_ID
  if (Capacitor.isNativePlatform()) return erstelleAndroidKontoDienst(clientId, androidAbhaengigkeiten())
  if (istWindowsApp()) return erstelleWindowsKontoDienst(clientId, windowsAbhaengigkeiten())
  return erstelleWebKontoDienst(clientId)
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
