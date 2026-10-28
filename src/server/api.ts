// Aufrufe der v2-Schnittstelle (/api/v2/…). Die Sitzung steckt im Cookie (HttpOnly), daher nur gleiche Herkunft.
import type { ServerKonto, ServerRolle } from './typen'

export class ServerFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Fehler ohne Antwort des Servers (kein Netz, Server nicht erreichbar). */
export const istNetzFehler = (e: unknown) => !(e instanceof ServerFehler) || e.status >= 500

async function rufe<T>(pfad: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(pfad, {
    ...init,
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  })
  const daten = (await r.json().catch(() => ({}))) as T & { fehler?: string }
  if (!r.ok) throw new ServerFehler(daten.fehler ?? `Server antwortet mit ${r.status}`, r.status)
  return daten
}

export interface Einrichtung {
  google: boolean
  microsoft: boolean
}

export async function ladeEinrichtung(): Promise<Einrichtung> {
  const d = await rufe<{ einrichtung: Einrichtung }>('/api/v2/status')
  return { google: d.einrichtung.google, microsoft: d.einrichtung.microsoft }
}

export const anmeldeUrl = (anbieter: 'google' | 'microsoft', ziel = '/') => `/api/v2/anmeldung/${anbieter}/start?ziel=${encodeURIComponent(ziel)}`

/** Eigenes Konto; null = nicht angemeldet. Wirft bei Netz- oder Serverfehler. */
export async function ladeIch(): Promise<ServerKonto | null> {
  try {
    return (await rufe<{ konto: ServerKonto }>('/api/v2/ich')).konto
  } catch (e) {
    if (e instanceof ServerFehler && e.status === 401) return null
    throw e
  }
}

export const setzeMailBenachrichtigung = async (an: boolean) =>
  (await rufe<{ konto: ServerKonto }>('/api/v2/ich', { method: 'PATCH', body: JSON.stringify({ mailBenachrichtigung: an }) })).konto

export const serverAbmelden = () => rufe<{ ok: true }>('/api/v2/abmelden', { method: 'POST' })

export const ladeKonten = async () => (await rufe<{ konten: ServerKonto[] }>('/api/v2/admin/konten')).konten

export type KontoAktion = { aktion: 'freigeben' } | { aktion: 'sperren' } | { aktion: 'loeschen' } | { aktion: 'rollen'; rollen: ServerRolle[] }

export const aendereKonto = async (id: string, a: KontoAktion) =>
  (await rufe<{ konten: ServerKonto[] }>(`/api/v2/admin/konten/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(a) })).konten

const CACHE = 'wep-v2-konto'

/** Zuletzt bestätigtes Konto (für den Start ohne Netz). */
export function gemerktesKonto(): ServerKonto | null {
  try {
    const roh = localStorage.getItem(CACHE)
    return roh ? (JSON.parse(roh) as ServerKonto) : null
  } catch {
    return null
  }
}

export function merkeKonto(k: ServerKonto | null): void {
  try {
    if (k) localStorage.setItem(CACHE, JSON.stringify(k))
    else localStorage.removeItem(CACHE)
  } catch {
    /* ohne Speicher: beim nächsten Start ohne Netz kein Konto */
  }
}
