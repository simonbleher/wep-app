// v2: Begrenzung von Anmeldeversuchen je IP (Fund M5, docs/SICHERHEITSPRUEFUNG-V2.md). Auf *.pages.dev gibt es keine
// eigene WAF-Regel, darum ein Zähler in D1: je Bereich und IP ein Eintrag (nur der SHA-256-Hash, nie die Adresse) mit
// festem Zeitfenster. Ohne `CF-Connecting-IP` (lokal, Tests) wird nicht begrenzt – auf Cloudflare setzt Cloudflare den
// Kopf immer selbst.
import { jetztIso, type Db } from './db'
import { sha256b64url } from './oidc'

export type Bereich = 'anmeldung' | 'token'

/** Höchstzahl je IP und Zeitfenster. Eine Anmeldung braucht zwei Anfragen (start + zurueck). */
export const GRENZEN: Record<Bereich, { anzahl: number; fensterMin: number }> = {
  anmeldung: { anzahl: 60, fensterMin: 10 },
  token: { anzahl: 30, fensterMin: 10 },
}

/** Zählt die Anfrage. Liefert die Sekunden bis zum nächsten Versuch, wenn die Grenze überschritten ist – sonst undefined. */
export async function zuViele(db: Db, request: Request, bereich: Bereich, jetzt = Date.now()): Promise<number | undefined> {
  const ip = request.headers.get('cf-connecting-ip')?.trim()
  if (!ip) return undefined
  const g = GRENZEN[bereich]
  const schluessel = await sha256b64url(`${bereich}:${ip}`)
  const zeit = jetztIso(jetzt)
  const bis = jetztIso(jetzt + g.fensterMin * 60_000)
  await db.prepare('DELETE FROM begrenzung WHERE bis < ?').bind(zeit).run()
  const z = await db
    .prepare('INSERT INTO begrenzung (schluessel, anzahl, bis) VALUES (?1, 1, ?2) ON CONFLICT (schluessel) DO UPDATE SET anzahl = anzahl + 1 RETURNING anzahl, bis')
    .bind(schluessel, bis)
    .first<{ anzahl: number; bis: string }>()
  if (!z || z.anzahl <= g.anzahl) return undefined
  return Math.max(1, Math.ceil((Date.parse(z.bis) - jetzt) / 1000))
}
