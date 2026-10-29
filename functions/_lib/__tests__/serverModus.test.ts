// v2-Schalter auf dem Server: ohne SERVER_MODUS gibt es /api/v2/ nicht; der Status zeigt nur ja/nein.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { einrichtung, istServerModus, schemaStand, SCHEMA_ERWARTET } from '../serverModus'
import { neueSitzung } from '../v2/sitzung'
import { testDb } from './sqliteDb'
import { onRequest as middleware } from '../../api/v2/_middleware'
import { onRequestGet as status } from '../../api/v2/status'

const weiter = async () => new Response('weiter')

describe('Server-Modus (Functions)', () => {
  it('nur SERVER_MODUS="true" schaltet ein', () => {
    expect(istServerModus({})).toBe(false)
    expect(istServerModus({ SERVER_MODUS: 'false' })).toBe(false)
    expect(istServerModus({ SERVER_MODUS: 'true' })).toBe(true)
  })

  it('ohne Schalter: 404 für alles unter /api/v2/, mit Schalter geht es weiter', async () => {
    const anfrage = (origin?: string, method = 'GET') => new Request('https://wep-pankow.pages.dev/api/v2/ich', { method, headers: origin ? { origin } : {} })
    const aus = await middleware({ request: anfrage(), env: {}, next: weiter })
    expect(aus.status).toBe(404)
    const an = await middleware({ request: anfrage(), env: { SERVER_MODUS: 'true' }, next: weiter })
    expect(await an.text()).toBe('weiter')
    expect(an.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('CORS nur für die Herkünfte der Apps (Capacitor, Tauri), ohne Cookies', async () => {
    const env = { SERVER_MODUS: 'true' }
    const anfrage = (origin: string, method = 'GET') => new Request('https://wep-pankow.pages.dev/api/v2/weps', { method, headers: { origin } })
    for (const origin of ['https://localhost', 'https://tauri.localhost', 'http://tauri.localhost']) {
      const vor = await middleware({ request: anfrage(origin, 'OPTIONS'), env, next: weiter })
      expect(vor.status).toBe(204)
      expect(vor.headers.get('access-control-allow-origin')).toBe(origin)
      expect(vor.headers.get('access-control-allow-headers')).toContain('authorization')
      expect(vor.headers.get('access-control-allow-credentials')).toBeNull()
      const r = await middleware({ request: anfrage(origin), env, next: weiter })
      expect(r.headers.get('access-control-allow-origin')).toBe(origin)
      expect(await r.text()).toBe('weiter')
    }
    for (const origin of ['https://evil.example', 'http://localhost', 'capacitor://evil']) {
      expect((await middleware({ request: anfrage(origin, 'OPTIONS'), env, next: weiter })).status).toBe(403)
      expect((await middleware({ request: anfrage(origin), env, next: weiter })).headers.get('access-control-allow-origin')).toBeNull()
    }
  })

  it('Status zeigt je Teil nur ja/nein, keine Werte; ohne Admin-Anmeldung nur Google/Microsoft', async () => {
    const db = testDb()
    const env = { SERVER_MODUS: 'true', WEP_DB: db, GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'geheim-123', VITE_MS_CLIENT_ID: 'x', MS_CLIENT_SECRET: ' ' }
    const ohne = await (await status({ env })).text()
    expect(JSON.parse(ohne)).toEqual({ serverModus: true, einrichtung: { google: true, microsoft: false } })
    const text = await (await status({ request: await alsAdmin(db), env })).text()
    expect(JSON.parse(text)).toEqual({
      serverModus: true,
      einrichtung: { datenbank: true, dateien: false, google: true, microsoft: false, mail: false, admins: false },
      schema: { stand: SCHEMA_ERWARTET, erwartet: SCHEMA_ERWARTET },
      warnungen: [],
    })
    for (const t of [ohne, text]) {
      expect(t).not.toContain('geheim')
      expect(t).not.toContain('googleusercontent')
    }
    expect(einrichtung({}).datenbank).toBe(false)
  })

  it('Schema-Stand: mit allen Migrationen genau der erwartete Stand, ohne Datenbank kein Stand', async () => {
    const db = testDb()
    const mit = await (await status({ request: await alsAdmin(db), env: { SERVER_MODUS: 'true', WEP_DB: db } })).json()
    expect(mit.schema).toEqual({ stand: SCHEMA_ERWARTET, erwartet: SCHEMA_ERWARTET })
    expect(await schemaStand({})).toBeUndefined()
    // eine neue Migration muss SCHEMA_ERWARTET mitziehen
    expect(readdirSync(join(__dirname, '../../../migrations')).filter((d) => d.endsWith('.sql'))).toHaveLength(SCHEMA_ERWARTET)
  })
})

/** Anfrage mit der Sitzung eines freigegebenen Admin-Kontos (Status zeigt sonst nur Google/Microsoft). */
async function alsAdmin(db: ReturnType<typeof testDb>): Promise<Request> {
  db.roh.prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES ('a1', 'google', 'a1', 'a@example.org', 'Ada', 'freigegeben', 'admin', 'x', 'x')").run()
  const { cookie } = await neueSitzung(db, 'a1')
  return new Request('https://wep.example/api/v2/status', { headers: { cookie: cookie.split(';')[0] } })
}
