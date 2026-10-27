// Anträge und Freigaben für die BV-Kontrollseite (Ziel 4). Gespeichert wird NUR, wer Zugang beantragt hat und ob er
// freigegeben ist – keine WEP-Daten. Ablage: KV-Bindung `BV_ZUGANG` (Schlüssel `nutzer:<tid>:<oid>`). Admins stehen in der
// Umgebungsvariable `BV_ADMINS` (Komma-Liste aus E-Mail-Adressen oder Objekt-IDs) und brauchen keinen Eintrag.
import type { GeprueftesToken } from './idToken'

export type ZugangsStatus = 'beantragt' | 'freigegeben' | 'gesperrt'

export interface Nutzer {
  oid: string
  tid: string
  name: string
  email: string
  status: ZugangsStatus
  beantragtAm: string
  geaendertAm: string
  /** E-Mail des Admins, der zuletzt geändert hat. */
  geaendertVon?: string
}

/** Die Teile einer KV-Bindung, die wir brauchen (in Tests eine Map). */
export interface KvAblage {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(opt: { prefix: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>
}

const schluessel = (tid: string, oid: string) => `nutzer:${tid}:${oid}`

export function istAdmin(t: Pick<GeprueftesToken, 'oid' | 'email'>, admins: string | undefined): boolean {
  const liste = (admins ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
  return liste.includes(t.oid.toLowerCase()) || (Boolean(t.email) && liste.includes(t.email.toLowerCase()))
}

async function lies(kv: KvAblage, tid: string, oid: string): Promise<Nutzer | undefined> {
  const roh = await kv.get(schluessel(tid, oid))
  if (!roh) return undefined
  try {
    return JSON.parse(roh) as Nutzer
  } catch {
    return undefined
  }
}

export interface ZugangsAntwort {
  status: ZugangsStatus
  admin: boolean
  name: string
  email: string
}

/** Wer sich anmeldet: Admin → freigegeben; bekannt → sein Status; neu → Antrag anlegen („beantragt“). */
export async function zugang(kv: KvAblage, t: GeprueftesToken, admins: string | undefined, jetzt = new Date().toISOString()): Promise<ZugangsAntwort> {
  if (istAdmin(t, admins)) return { status: 'freigegeben', admin: true, name: t.name, email: t.email }
  const alt = await lies(kv, t.tid, t.oid)
  if (alt) {
    // Name und E-Mail aktuell halten (z. B. nach Namensänderung), Status bleibt
    if (alt.name !== t.name || alt.email !== t.email) await kv.put(schluessel(t.tid, t.oid), JSON.stringify({ ...alt, name: t.name, email: t.email }))
    return { status: alt.status, admin: false, name: t.name, email: t.email }
  }
  const neu: Nutzer = { oid: t.oid, tid: t.tid, name: t.name, email: t.email, status: 'beantragt', beantragtAm: jetzt, geaendertAm: jetzt }
  await kv.put(schluessel(t.tid, t.oid), JSON.stringify(neu))
  return { status: 'beantragt', admin: false, name: t.name, email: t.email }
}

export async function alleNutzer(kv: KvAblage): Promise<Nutzer[]> {
  const aus: Nutzer[] = []
  let cursor: string | undefined
  for (;;) {
    const seite = await kv.list({ prefix: 'nutzer:', cursor })
    for (const k of seite.keys) {
      const [, tid, oid] = k.name.split(':')
      const n = await lies(kv, tid, oid)
      if (n) aus.push(n)
    }
    if (seite.list_complete || !seite.cursor) break
    cursor = seite.cursor
  }
  return aus.sort((a, b) => (a.status === 'beantragt' ? 0 : 1) - (b.status === 'beantragt' ? 0 : 1) || b.beantragtAm.localeCompare(a.beantragtAm))
}

export type AdminAktion = 'freigeben' | 'sperren' | 'loeschen'

/** Admin ändert einen Eintrag. `false`, wenn es ihn nicht gibt. */
export async function aendereNutzer(kv: KvAblage, ziel: { tid: string; oid: string }, aktion: AdminAktion, admin: GeprueftesToken, jetzt = new Date().toISOString()): Promise<boolean> {
  const alt = await lies(kv, ziel.tid, ziel.oid)
  if (!alt) return false
  if (aktion === 'loeschen') {
    await kv.delete(schluessel(ziel.tid, ziel.oid))
    return true
  }
  const status: ZugangsStatus = aktion === 'freigeben' ? 'freigegeben' : 'gesperrt'
  await kv.put(schluessel(ziel.tid, ziel.oid), JSON.stringify({ ...alt, status, geaendertAm: jetzt, geaendertVon: admin.email || admin.oid }))
  return true
}
