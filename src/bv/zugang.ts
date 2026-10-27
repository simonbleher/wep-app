// Zugang zur BV-Kontrollseite (Ziel 4): Ist die Zugangskontrolle eingeschaltet (/api/bv/konfig), braucht /bv eine
// Microsoft-Anmeldung und eine Freigabe durch einen Admin (/api/bv/zugang). Ohne eingeschaltete Kontrolle (Vorschau,
// lokal, Funktion fehlt) läuft die Seite wie bisher. Offline gilt eine bestätigte Freigabe 7 Tage.

export const OFFLINE_TAGE = 7
const SPEICHER = 'wep-bv-zugang'

export type Status = 'beantragt' | 'freigegeben' | 'gesperrt'

export interface ZugangsAntwort {
  status: Status
  admin: boolean
  name: string
  email: string
}

/** Zuletzt bestätigter Stand in diesem Browser. */
export interface GemerkterZugang {
  /** Die Kontrolle war beim letzten Kontakt eingeschaltet. */
  aktiv: boolean
  email?: string
  admin?: boolean
  /** Zeit der letzten bestätigten Freigabe (ISO). */
  freigegebenAm?: string
}

export type Entscheidung =
  | { art: 'offen'; hinweis?: string }
  | { art: 'anmelden' }
  | { art: 'freigegeben'; admin: boolean; name: string; email: string; offline?: boolean }
  | { art: 'beantragt'; name: string; email: string }
  | { art: 'gesperrt'; name: string; email: string }
  | { art: 'fehler'; meldung: string }

export function leseGemerkt(): GemerkterZugang | undefined {
  try {
    const roh = localStorage.getItem(SPEICHER)
    return roh ? (JSON.parse(roh) as GemerkterZugang) : undefined
  } catch {
    return undefined
  }
}

export function merke(z: GemerkterZugang | undefined): void {
  try {
    if (z) localStorage.setItem(SPEICHER, JSON.stringify(z))
    else localStorage.removeItem(SPEICHER)
  } catch {
    /* nur Komfort (offline-Freigabe) */
  }
}

/** Offline: Gilt die zuletzt bestätigte Freigabe noch? */
export function offlineGueltig(g: GemerkterZugang | undefined, jetzt: number): boolean {
  if (!g?.freigegebenAm) return false
  const alter = jetzt - Date.parse(g.freigegebenAm)
  return alter >= 0 && alter <= OFFLINE_TAGE * 24 * 3600_000
}

/**
 * Entscheidet, was die Seite zeigt.
 * - `konfig`: Antwort von /api/bv/konfig; `'offline'` = keine Verbindung; `undefined` = Funktion fehlt (z. B. lokal)
 * - `antwort`: Antwort von /api/bv/zugang (nur wenn angemeldet und online), `'offline'` bei Netzfehler
 */
export function entscheide(o: {
  konfig: { aktiv: boolean } | 'offline' | undefined
  angemeldet: boolean
  antwort?: ZugangsAntwort | 'offline' | { fehler: string }
  gemerkt?: GemerkterZugang
  jetzt: number
}): Entscheidung {
  if (o.konfig === 'offline' || o.antwort === 'offline') {
    if (!o.gemerkt?.aktiv) return { art: 'offen' }
    if (offlineGueltig(o.gemerkt, o.jetzt)) return { art: 'freigegeben', admin: Boolean(o.gemerkt.admin), name: '', email: o.gemerkt.email ?? '', offline: true }
    return { art: 'fehler', meldung: `Keine Verbindung. Ohne Netz bleibt die Kontrollseite nur ${OFFLINE_TAGE} Tage nach der letzten Bestätigung offen – bitte mit Netz erneut öffnen.` }
  }
  if (!o.konfig || !o.konfig.aktiv) return { art: 'offen' }
  if (!o.angemeldet) return { art: 'anmelden' }
  const a = o.antwort
  if (!a) return { art: 'anmelden' }
  if ('fehler' in a) return { art: 'fehler', meldung: a.fehler }
  if (a.status === 'freigegeben') return { art: 'freigegeben', admin: a.admin, name: a.name, email: a.email }
  if (a.status === 'gesperrt') return { art: 'gesperrt', name: a.name, email: a.email }
  return { art: 'beantragt', name: a.name, email: a.email }
}

/** Was nach einer Entscheidung im Browser gemerkt wird (für die 7 Tage offline). */
export function naechsterGemerkt(e: Entscheidung, vorher: GemerkterZugang | undefined, jetzt: number): GemerkterZugang | undefined {
  if (e.art === 'offen') return e.hinweis ? vorher : undefined
  if (e.art === 'freigegeben') return e.offline ? vorher : { aktiv: true, email: e.email, admin: e.admin, freigegebenAm: new Date(jetzt).toISOString() }
  if (e.art === 'beantragt' || e.art === 'gesperrt') return { aktiv: true, email: e.email }
  if (e.art === 'anmelden') return vorher ? { aktiv: true, email: vorher.email } : { aktiv: true }
  return vorher
}

// --- Server ------------------------------------------------------------------------------------------------------

async function holeJson(url: string, init?: RequestInit): Promise<{ status: number; daten: unknown } | 'offline'> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init })
    let daten: unknown
    try {
      daten = await r.json()
    } catch {
      daten = undefined
    }
    return { status: r.status, daten }
  } catch {
    return 'offline'
  }
}

/** /api/bv/konfig: `undefined`, wenn es die Funktion nicht gibt (lokal, Vorschau ohne Functions). */
export async function ladeKonfig(): Promise<{ aktiv: boolean } | 'offline' | undefined> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  const r = await holeJson('/api/bv/konfig')
  if (r === 'offline') return 'offline'
  const d = r.daten as { aktiv?: unknown } | undefined
  return r.status === 200 && typeof d?.aktiv === 'boolean' ? { aktiv: d.aktiv } : undefined
}

export async function frageZugang(idToken: string): Promise<ZugangsAntwort | 'offline' | { fehler: string }> {
  const r = await holeJson('/api/bv/zugang', { method: 'POST', headers: { authorization: `Bearer ${idToken}` } })
  if (r === 'offline') return 'offline'
  const d = r.daten as Partial<ZugangsAntwort> & { fehler?: string }
  if (r.status === 200 && d?.status) return d as ZugangsAntwort
  return { fehler: d?.fehler ?? `Zugang konnte nicht geprüft werden (${r.status}).` }
}

export interface Nutzer {
  oid: string
  tid: string
  name: string
  email: string
  status: Status
  beantragtAm: string
  geaendertAm: string
  geaendertVon?: string
}

export async function ladeNutzer(idToken: string): Promise<Nutzer[]> {
  const r = await holeJson('/api/bv/admin/nutzer', { headers: { authorization: `Bearer ${idToken}` } })
  if (r === 'offline') throw new Error('Keine Verbindung.')
  const d = r.daten as { nutzer?: Nutzer[]; fehler?: string }
  if (r.status !== 200 || !d?.nutzer) throw new Error(d?.fehler ?? `Fehler ${r.status}`)
  return d.nutzer
}

export async function aendereNutzer(idToken: string, n: Pick<Nutzer, 'tid' | 'oid'>, aktion: 'freigeben' | 'sperren' | 'loeschen'): Promise<Nutzer[]> {
  const r = await holeJson('/api/bv/admin/nutzer', {
    method: 'POST',
    headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tid: n.tid, oid: n.oid, aktion }),
  })
  if (r === 'offline') throw new Error('Keine Verbindung.')
  const d = r.daten as { nutzer?: Nutzer[]; fehler?: string }
  if (r.status !== 200 || !d?.nutzer) throw new Error(d?.fehler ?? `Fehler ${r.status}`)
  return d.nutzer
}
