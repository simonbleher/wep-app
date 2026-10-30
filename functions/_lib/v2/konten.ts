// v2-Konten: Anlegen bei der ersten Anmeldung („wartet auf Freigabe“), Rollen, Freigabe durch Admins, Protokoll.
import { jetztIso, type Db } from './db'
import { MS_PERSOENLICH, type Anbieter, type Identitaet } from './oidc'

export type Rolle = 'bau' | 'gruen' | 'bv' | 'admin'
export const ROLLEN: Rolle[] = ['bau', 'gruen', 'bv', 'admin']
export type KontoStatus = 'wartet' | 'freigegeben' | 'gesperrt'

export interface Konto {
  id: string
  anbieter: 'google' | 'microsoft'
  email: string
  name: string
  status: KontoStatus
  rollen: Rolle[]
  mailBenachrichtigung: boolean
  /** Hat der Anbieter die Adresse bestätigt? Unbestätigte zeigt die Admin-Seite als „unbestätigt“ (Fund M3). */
  emailBestaetigt: boolean
  /** Nur Microsoft: Tenant des Kontos ('persoenlich' für persönliche Microsoft-Konten). */
  tenant?: string
  erstelltAm: string
  geaendertAm: string
  letzteAnmeldung?: string
}

interface KontoZeile {
  id: string
  anbieter: 'google' | 'microsoft'
  subjekt: string
  email: string
  name: string
  status: KontoStatus
  rollen: string
  mail_benachrichtigung: number
  email_bestaetigt?: number
  erstellt_am: string
  geaendert_am: string
  letzte_anmeldung: string | null
}

/** Tenant aus dem Subjekt eines Microsoft-Kontos (`tid:oid`). */
const tenantVon = (subjekt: string) => {
  const tid = subjekt.split(':')[0]
  return tid === MS_PERSOENLICH ? 'persoenlich' : tid
}

const alsRollen = (s: string): Rolle[] => ROLLEN.filter((r) => s.split(',').includes(r))

export const alsKonto = (z: KontoZeile): Konto => ({
  id: z.id,
  anbieter: z.anbieter,
  email: z.email,
  name: z.name,
  status: z.status,
  rollen: alsRollen(z.rollen),
  mailBenachrichtigung: z.mail_benachrichtigung === 1,
  emailBestaetigt: z.email_bestaetigt === 1,
  ...(z.anbieter === 'microsoft' && z.subjekt ? { tenant: tenantVon(z.subjekt) } : {}),
  erstelltAm: z.erstellt_am,
  geaendertAm: z.geaendert_am,
  ...(z.letzte_anmeldung ? { letzteAnmeldung: z.letzte_anmeldung } : {}),
})

/** Warum diese Rollen nicht gehen – oder undefined. Ein Wertermittler ist Bau ODER Grün; BV und Admin zusätzlich. */
export function rollenFehler(rollen: unknown): string | undefined {
  if (!Array.isArray(rollen)) return 'Rollen fehlen.'
  if (rollen.some((r) => !ROLLEN.includes(r as Rolle))) return 'Unbekannte Rolle.'
  if (rollen.includes('bau') && rollen.includes('gruen')) return 'Ein Konto ist entweder Bau oder Grün, nicht beides.'
  return undefined
}

/** Ein Eintrag in V2_ADMINS: `google:adresse`, `microsoft:adresse` oder (alte Form) nur `adresse` = jeder Anbieter. */
export interface AdminEintrag {
  anbieter?: Anbieter
  email: string
}

export function adminEintraege(liste: string | undefined): AdminEintrag[] {
  return (liste ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .map((e) => {
      const m = /^(google|microsoft):(.+)$/.exec(e)
      return m ? { anbieter: m[1] as Anbieter, email: m[2].trim() } : { email: e }
    })
}

/** Warnungen zu V2_ADMINS für Admins (/api/v2/status, Admin-Seite): Einträge in der alten Form ohne Anbieter. */
export function adminWarnungen(liste: string | undefined): string[] {
  const alt = adminEintraege(liste).filter((e) => !e.anbieter)
  if (!alt.length) return []
  return [
    `V2_ADMINS enthält ${alt.length === 1 ? 'eine Adresse' : `${alt.length} Adressen`} ohne Anbieter. Diese gelten noch für Google und Microsoft. ` +
      'Bitte als google:adresse bzw. microsoft:adresse eintragen (docs/V2-EINRICHTUNG.md, „V2_ADMINS mit Anbieter“).',
  ]
}

/**
 * Steht die E-Mail in V2_ADMINS? Nur bestätigte Adressen zählen, und bei Einträgen mit Anbieter nur Anmeldungen bei
 * diesem Anbieter (Fund M3: sonst genügt eine passende Adresse bei einem anderen Anbieter oder in einem fremden Tenant).
 */
export function istErsterAdmin(identitaet: Pick<Identitaet, 'email' | 'emailBestaetigt'> & { anbieter?: Anbieter }, liste: string | undefined): boolean {
  const email = identitaet.email.trim().toLowerCase()
  if (!identitaet.emailBestaetigt || !email) return false
  return adminEintraege(liste).some((e) => e.email === email && (!e.anbieter || e.anbieter === identitaet.anbieter))
}

export async function protokolliere(db: Db, eintrag: { kontoId?: string; aktion: string; ziel?: string; details?: string }, jetzt = Date.now()) {
  await db
    .prepare('INSERT INTO protokoll (zeit, konto_id, aktion, ziel, details) VALUES (?, ?, ?, ?, ?)')
    .bind(jetztIso(jetzt), eintrag.kontoId ?? null, eintrag.aktion, eintrag.ziel ?? null, eintrag.details ?? null)
    .run()
}

/**
 * Konto zur Anmeldung finden oder anlegen. Name und E-Mail werden bei jeder Anmeldung aufgefrischt. Steht die
 * bestätigte E-Mail in V2_ADMINS, ist das Konto freigegeben und Admin (erste Admins, ohne Admin-Seite).
 */
export async function kontoZurAnmeldung(db: Db, identitaet: Identitaet, admins: string | undefined, jetzt = Date.now()): Promise<Konto> {
  const zeit = jetztIso(jetzt)
  const vorhanden = await db.prepare('SELECT * FROM konten WHERE anbieter = ? AND subjekt = ?').bind(identitaet.anbieter, identitaet.subjekt).first<KontoZeile>()
  const ersterAdmin = istErsterAdmin(identitaet, admins)
  if (!vorhanden) {
    const id = crypto.randomUUID()
    await db
      .prepare(
        'INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am, letzte_anmeldung, email_bestaetigt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(id, identitaet.anbieter, identitaet.subjekt, identitaet.email, identitaet.name, ersterAdmin ? 'freigegeben' : 'wartet', ersterAdmin ? 'admin' : '', zeit, zeit, zeit, identitaet.emailBestaetigt ? 1 : 0)
      .run()
    await protokolliere(db, { kontoId: id, aktion: 'konto_angelegt', details: ersterAdmin ? 'erster Admin (V2_ADMINS)' : undefined }, jetzt)
  } else {
    // Erste Admins: freigegeben und Admin, auch wenn das Konto schon vorher (z. B. wartend) angelegt war – aber
    // ein gesperrtes Konto bleibt gesperrt.
    const rollen = alsRollen(vorhanden.rollen)
    const admin = ersterAdmin && vorhanden.status !== 'gesperrt'
    await db
      .prepare('UPDATE konten SET email = ?, email_bestaetigt = ?, name = ?, letzte_anmeldung = ?, status = ?, rollen = ? WHERE id = ?')
      .bind(
        identitaet.email,
        identitaet.emailBestaetigt ? 1 : 0,
        identitaet.name,
        zeit,
        admin ? 'freigegeben' : vorhanden.status,
        (admin && !rollen.includes('admin') ? [...rollen, 'admin'] : rollen).join(','),
        vorhanden.id,
      )
      .run()
  }
  const konto = await db.prepare('SELECT * FROM konten WHERE anbieter = ? AND subjekt = ?').bind(identitaet.anbieter, identitaet.subjekt).first<KontoZeile>()
  if (!konto) throw new Error('Konto konnte nicht angelegt werden.')
  await protokolliere(db, { kontoId: konto.id, aktion: 'anmeldung', details: identitaet.anbieter }, jetzt)
  return alsKonto(konto)
}

export async function ladeKonto(db: Db, id: string): Promise<Konto | undefined> {
  const z = await db.prepare('SELECT * FROM konten WHERE id = ?').bind(id).first<KontoZeile>()
  return z ? alsKonto(z) : undefined
}

export async function alleKonten(db: Db): Promise<Konto[]> {
  const { results } = await db.prepare("SELECT * FROM konten ORDER BY CASE status WHEN 'wartet' THEN 0 ELSE 1 END, name COLLATE NOCASE").all<KontoZeile>()
  return results.map(alsKonto)
}

export type AdminAktion = { aktion: 'freigeben' } | { aktion: 'sperren' } | { aktion: 'loeschen' } | { aktion: 'rollen'; rollen: Rolle[] } | { aktion: 'abmelden' }

/** Prüft eine Admin-Aktion; liefert die Fehlermeldung oder undefined. */
export function adminAktionFehler(admin: Konto, ziel: Konto, a: AdminAktion): string | undefined {
  if (admin.id === ziel.id) {
    if (a.aktion === 'sperren' || a.aktion === 'loeschen') return 'Das eigene Konto kann nicht gesperrt oder gelöscht werden.'
    if (a.aktion === 'rollen' && !a.rollen.includes('admin')) return 'Die eigene Admin-Rolle kann nicht entfernt werden.'
  }
  if (a.aktion === 'rollen') return rollenFehler(a.rollen)
  return undefined
}

/** Führt eine geprüfte Admin-Aktion aus (Sperren und Löschen beenden alle Sitzungen des Kontos). */
export async function fuehreAdminAktionAus(db: Db, admin: Konto, ziel: Konto, a: AdminAktion, jetzt = Date.now()): Promise<void> {
  const zeit = jetztIso(jetzt)
  if (a.aktion === 'loeschen') {
    await db.batch([db.prepare('DELETE FROM sitzungen WHERE konto_id = ?').bind(ziel.id), db.prepare('DELETE FROM konten WHERE id = ?').bind(ziel.id)])
  } else if (a.aktion === 'abmelden') {
    // Alle Sitzungen beenden (Browser und Apps), das Konto bleibt freigegeben
    await db.prepare('DELETE FROM sitzungen WHERE konto_id = ?').bind(ziel.id).run()
  } else if (a.aktion === 'rollen') {
    await db.prepare('UPDATE konten SET rollen = ?, geaendert_am = ?, geaendert_von = ? WHERE id = ?').bind(a.rollen.join(','), zeit, admin.id, ziel.id).run()
  } else {
    const status: KontoStatus = a.aktion === 'freigeben' ? 'freigegeben' : 'gesperrt'
    const anweisungen = [db.prepare('UPDATE konten SET status = ?, geaendert_am = ?, geaendert_von = ? WHERE id = ?').bind(status, zeit, admin.id, ziel.id)]
    if (status === 'gesperrt') anweisungen.push(db.prepare('DELETE FROM sitzungen WHERE konto_id = ?').bind(ziel.id))
    await db.batch(anweisungen)
  }
  await protokolliere(db, { kontoId: admin.id, aktion: `admin_${a.aktion}`, ziel: ziel.id, details: a.aktion === 'rollen' ? a.rollen.join(',') : undefined }, jetzt)
}

/** Eigene Einstellungen (vorerst nur die Mail-Benachrichtigung). */
export async function setzeMailBenachrichtigung(db: Db, kontoId: string, an: boolean, jetzt = Date.now()): Promise<void> {
  await db.prepare('UPDATE konten SET mail_benachrichtigung = ?, geaendert_am = ? WHERE id = ?').bind(an ? 1 : 0, jetztIso(jetzt), kontoId).run()
}
