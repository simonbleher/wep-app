// Gemeinsames der v2-Endpunkte: Datenbank aus der Bindung, angemeldetes Konto, Rollenprüfung, Herkunftsprüfung.
import { jsonAntwort, type V2Umgebung } from '../serverModus'
import type { Db } from './db'
import type { Konto, Rolle } from './konten'
import { kontoDerSitzung } from './sitzung'

export interface V2Kontext<P extends string = never> {
  request: Request
  env: V2Umgebung
  params: Record<P, string>
}

export const datenbank = (env: V2Umgebung): Db | undefined => (env.WEP_DB as Db | undefined) ?? undefined

export const NICHT_EINGERICHTET = () => jsonAntwort(503, { fehler: 'Die Datenbank ist noch nicht eingerichtet (WEP_DB).' })

/**
 * Schreibende Anfragen nur von dieser Seite: `Origin` muss zur Adresse passen. Zusammen mit SameSite=Lax schützt das
 * vor fremden Seiten, die mit dem Cookie des Nutzers etwas auslösen wollen. Die Apps (Bearer-Token) sind ausgenommen.
 */
export function fremdeHerkunft(request: Request): Response | undefined {
  if (request.headers.get('authorization')?.startsWith('Bearer ')) return undefined
  const origin = request.headers.get('origin')
  return origin === new URL(request.url).origin ? undefined : jsonAntwort(403, { fehler: 'Anfrage von fremder Seite abgelehnt.' })
}

/** Angemeldetes, freigegebenes Konto (optional mit Rolle) – sonst die passende Fehler-Antwort. */
export async function freigegebenesKonto(db: Db, request: Request, rolle?: Rolle): Promise<Konto | Response> {
  const konto = await kontoDerSitzung(db, request)
  if (!konto) return jsonAntwort(401, { fehler: 'Nicht angemeldet.' })
  if (konto.status !== 'freigegeben') return jsonAntwort(403, { fehler: konto.status === 'gesperrt' ? 'Das Konto ist gesperrt.' : 'Das Konto wartet auf Freigabe.' })
  if (rolle && !konto.rollen.includes(rolle)) return jsonAntwort(403, { fehler: 'Dafür fehlt die Berechtigung.' })
  return konto
}
