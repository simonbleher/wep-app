// Schalter für v2 auf dem Server (docs/PLAN-V2.md). SERVER_MODUS=true ist in Produktion gesetzt (docs/V2-EINRICHTUNG.md).
// Ohne Schalter antworten alle Endpunkte unter /api/v2/ mit 404 – v1 bemerkt nichts davon.

/** Bindungen und Variablen von v2. Was fehlt, meldet /api/v2/status. */
export interface V2Umgebung {
  /** "true" schaltet v2 ein. */
  SERVER_MODUS?: string
  /** D1-Datenbank (Konten, Rollen, WEPs, Verlauf, Benachrichtigungen). */
  WEP_DB?: unknown
  /** R2-Bucket (Fotos, Unterschriften, Bau-Excel), Jurisdiktion EU. */
  WEP_DATEIEN?: unknown
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Client-ID der Microsoft-Registrierung „WEP-App“ (dieselbe Variable wie beim Build). */
  VITE_MS_CLIENT_ID?: string
  MS_CLIENT_SECRET?: string
  RESEND_API_KEY?: string
  /** Absender der Mails, z. B. "WEP-App <wep@example.org>". */
  MAIL_ABSENDER?: string
  /** Erste Admins (E-Mail-Adressen, kommagetrennt); weitere vergibt die Admin-Seite. */
  V2_ADMINS?: string
}

export const istServerModus = (env: V2Umgebung): boolean => env.SERVER_MODUS === 'true'

const gesetzt = (w: unknown) => (typeof w === 'string' ? w.trim() !== '' : w !== undefined && w !== null)

/** Welche Teile eingerichtet sind – nur ja/nein, nie die Werte selbst. */
export function einrichtung(env: V2Umgebung) {
  return {
    datenbank: gesetzt(env.WEP_DB),
    dateien: gesetzt(env.WEP_DATEIEN),
    google: gesetzt(env.GOOGLE_CLIENT_ID) && gesetzt(env.GOOGLE_CLIENT_SECRET),
    microsoft: gesetzt(env.VITE_MS_CLIENT_ID) && gesetzt(env.MS_CLIENT_SECRET),
    mail: gesetzt(env.RESEND_API_KEY) && gesetzt(env.MAIL_ABSENDER),
    admins: gesetzt(env.V2_ADMINS),
  }
}

/** Höchste Migration in migrations/ – so weit muss die Datenbank eingespielt sein. */
export const SCHEMA_ERWARTET = 4

interface SchemaDb {
  prepare(sql: string): { first<T>(): Promise<T | null> }
}

/** Eingespielter Stand der Datenbank (0 = noch keine Tabellen, undefined = keine Datenbank). */
export async function schemaStand(env: V2Umgebung): Promise<number | undefined> {
  const db = env.WEP_DB as SchemaDb | undefined
  if (!db) return undefined
  try {
    return (await db.prepare('SELECT max(nummer) AS n FROM schema_stand').first<{ n: number | null }>())?.n ?? 0
  } catch {
    return 0
  }
}

export const jsonAntwort = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
