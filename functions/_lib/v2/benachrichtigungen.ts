// v2-Benachrichtigungen (Paket 5): Wer bei welchem Schritt im Ablauf Bescheid bekommt – in der App („Neu für dich“) und,
// wenn eingerichtet und nicht abgeschaltet, per E-Mail über Resend. Mails nennen nur Vorgangs-Nr., Anlage und Parzelle
// und enthalten einen Link – keine Namen von Pächtern, keine Beträge (docs/PLAN-V2.md).
import type { AblaufAktionName } from '../../../src/server/rechte'
import type { V2Umgebung } from '../serverModus'
import { jetztIso, type Db } from './db'

import { ART_TEXT, type BenachrichtigungsArt } from '../../../src/server/benachrichtigungsText'

export { ART_TEXT, type BenachrichtigungsArt }

/** Höchstens so viele Mails je Empfänger und Stunde; der Rest steht nur in „Neu für dich“ (Fund M6). */
export const MAILS_JE_STUNDE = 5

interface WepAngaben {
  id: string
  vorgangsNr: string
  anlage: string
  parzelle: string
  bauKonto: string | null
  gruenKonto: string | null
}

/** Empfänger je Schritt (nie die Person, die den Schritt macht). */
export async function empfaenger(db: Db, aktion: AblaufAktionName, wep: WepAngaben, rueckfrageAn: 'bau' | 'gruen' | 'beide' | null, ausloeser: string): Promise<{ kontoId: string; art: BenachrichtigungsArt }[]> {
  const liste: { kontoId: string | null; art: BenachrichtigungsArt }[] = []
  if (aktion === 'an_gruen') liste.push({ kontoId: wep.gruenKonto, art: 'an_dich' })
  if (aktion === 'an_bv') {
    const { results } = await db.prepare("SELECT id, rollen FROM konten WHERE status = 'freigegeben'").all<{ id: string; rollen: string }>()
    for (const k of results) if (k.rollen.split(',').includes('bv')) liste.push({ kontoId: k.id, art: 'beim_bv' })
  }
  if (aktion === 'rueckfrage') {
    if (rueckfrageAn === 'bau' || rueckfrageAn === 'beide') liste.push({ kontoId: wep.bauKonto, art: 'rueckfrage' })
    if (rueckfrageAn === 'gruen' || rueckfrageAn === 'beide') liste.push({ kontoId: wep.gruenKonto, art: 'rueckfrage' })
  }
  if (aktion === 'geprueft' || aktion === 'wiederoeffnen') {
    const art = aktion === 'geprueft' ? 'geprueft' : 'wiederoeffnet'
    liste.push({ kontoId: wep.bauKonto, art }, { kontoId: wep.gruenKonto, art })
  }
  const gesehen = new Set<string>()
  return liste.filter((e): e is { kontoId: string; art: BenachrichtigungsArt } => {
    if (!e.kontoId || e.kontoId === ausloeser || gesehen.has(e.kontoId)) return false
    gesehen.add(e.kontoId)
    return true
  })
}

/** Inhalt der E-Mail: nur Vorgangs-Nr., Anlage, Parzelle und Link. */
export function mailInhalt(art: BenachrichtigungsArt, w: Pick<WepAngaben, 'vorgangsNr' | 'anlage' | 'parzelle'>, link: string) {
  const nr = w.vorgangsNr || 'ohne Vorgangs-Nr.'
  const zeilen = [`Vorgangs-Nr.: ${nr}`, w.anlage && `Anlage: ${w.anlage}`, w.parzelle && `Parzelle: ${w.parzelle}`].filter(Boolean) as string[]
  const fuss = 'Diese Nachricht kommt von der WEP-App. Benachrichtigungen per E-Mail kannst du im Profil abschalten.'
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return {
    subject: `WEP ${nr} – ${ART_TEXT[art]}`,
    text: [`WEP ${ART_TEXT[art]}.`, '', ...zeilen, '', `Öffnen: ${link}`, '', fuss].join('\n'),
    html: `<p>WEP ${esc(ART_TEXT[art])}.</p><p>${zeilen.map(esc).join('<br>')}</p><p><a href="${esc(link)}">In der WEP-App öffnen</a></p><p style="color:#666">${esc(fuss)}</p>`,
  }
}

/** Schickt eine Mail über Resend. Wirft mit kurzer Begründung, wenn es nicht klappt. */
export async function sendeMail(env: V2Umgebung, an: string, inhalt: { subject: string; text: string; html: string }, laden: typeof fetch = fetch) {
  const r = await laden('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_ABSENDER, to: [an], subject: inhalt.subject, text: inhalt.text, html: inhalt.html }),
  })
  if (!r.ok) {
    // Nur Status und Fehlerart (z. B. validation_error), nie den Text: der kann die Empfängeradresse enthalten (Fund N13)
    const art = ((await r.json().catch(() => ({}))) as { name?: unknown }).name
    throw new Error(`Resend ${r.status}${typeof art === 'string' && /^[a-z_]{1,50}$/.test(art) ? ` (${art})` : ''}`)
  }
}

/**
 * Legt die Benachrichtigungen zu einem Schritt an und verschickt die Mails. `origin`: Adresse der App für den Link.
 * Fehler beim Mailversand ändern nichts am Schritt – sie stehen bei der Benachrichtigung (`mail = 'fehler'`).
 */
export async function benachrichtige(
  db: Db,
  env: V2Umgebung,
  opt: { aktion: AblaufAktionName; wep: WepAngaben; rueckfrageAn: 'bau' | 'gruen' | 'beide' | null; ausloeser: string; origin: string; laden?: typeof fetch },
  jetzt = Date.now(),
): Promise<void> {
  const ziele = await empfaenger(db, opt.aktion, opt.wep, opt.rueckfrageAn, opt.ausloeser)
  const mailBereit = Boolean(env.RESEND_API_KEY?.trim() && env.MAIL_ABSENDER?.trim())
  for (const z of ziele) {
    const k = await db.prepare('SELECT email, rollen, mail_benachrichtigung FROM konten WHERE id = ?').bind(z.kontoId).first<{ email: string; rollen: string; mail_benachrichtigung: number }>()
    if (!k) continue
    const r = await db
      .prepare('INSERT INTO benachrichtigungen (konto_id, wep_id, art, zeit, vorgangs_nr, anlage, parzelle, mail) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(z.kontoId, opt.wep.id, z.art, jetztIso(jetzt), opt.wep.vorgangsNr, opt.wep.anlage, opt.wep.parzelle, mailBereit && k.mail_benachrichtigung === 1 && k.email ? 'offen' : 'aus')
      .first<{ id: number }>()
    if (!r || !mailBereit || k.mail_benachrichtigung !== 1 || !k.email) continue
    // Höchstens MAILS_JE_STUNDE Mails je Empfänger und Stunde (Fund M6); der Rest steht nur in „Neu für dich“
    const kuerzlich = await db
      .prepare("SELECT count(*) AS n FROM benachrichtigungen WHERE konto_id = ? AND mail = 'gesendet' AND zeit > ?")
      .bind(z.kontoId, jetztIso(jetzt - 3600_000))
      .first<{ n: number }>()
    if ((kuerzlich?.n ?? 0) >= MAILS_JE_STUNDE) {
      await db.prepare("UPDATE benachrichtigungen SET mail = 'gebuendelt' WHERE id = ?").bind(r.id).run()
      continue
    }
    // BV landet auf der Kontrollseite, Wertermittler in der App
    const link = `${opt.origin}${z.art === 'beim_bv' ? '/bv' : '/'}?wep=${encodeURIComponent(opt.wep.id)}`
    try {
      await sendeMail(env, k.email, mailInhalt(z.art, opt.wep, link), opt.laden)
      await db.prepare("UPDATE benachrichtigungen SET mail = 'gesendet' WHERE id = ?").bind(r.id).run()
    } catch (e) {
      await db.prepare("UPDATE benachrichtigungen SET mail = 'fehler', mail_fehler = ? WHERE id = ?").bind(e instanceof Error ? e.message : String(e), r.id).run()
    }
  }
}

export interface Benachrichtigung {
  id: number
  wepId: string
  art: BenachrichtigungsArt
  zeit: string
  vorgangsNr: string
  anlage: string
  parzelle: string
  gelesen: boolean
}

export async function meineBenachrichtigungen(db: Db, kontoId: string): Promise<Benachrichtigung[]> {
  const { results } = await db
    .prepare('SELECT * FROM benachrichtigungen WHERE konto_id = ? ORDER BY id DESC LIMIT 50')
    .bind(kontoId)
    .all<{ id: number; wep_id: string; art: BenachrichtigungsArt; zeit: string; vorgangs_nr: string; anlage: string; parzelle: string; gelesen_am: string | null }>()
  return results.map((b) => ({ id: b.id, wepId: b.wep_id, art: b.art, zeit: b.zeit, vorgangsNr: b.vorgangs_nr, anlage: b.anlage, parzelle: b.parzelle, gelesen: Boolean(b.gelesen_am) }))
}

/** Als gelesen markieren: bestimmte (ids) oder alle eigenen. */
export async function markiereGelesen(db: Db, kontoId: string, ids: number[] | undefined, jetzt = Date.now()) {
  const zeit = jetztIso(jetzt)
  if (!ids) {
    await db.prepare('UPDATE benachrichtigungen SET gelesen_am = ? WHERE konto_id = ? AND gelesen_am IS NULL').bind(zeit, kontoId).run()
    return
  }
  for (const id of ids.filter((x) => Number.isInteger(x))) {
    await db.prepare('UPDATE benachrichtigungen SET gelesen_am = ? WHERE konto_id = ? AND id = ? AND gelesen_am IS NULL').bind(zeit, kontoId, id).run()
  }
}
