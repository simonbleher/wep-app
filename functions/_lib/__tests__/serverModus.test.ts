// v2-Schalter auf dem Server: ohne SERVER_MODUS gibt es /api/v2/ nicht; der Status zeigt nur ja/nein.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { einrichtung, istServerModus, SCHEMA_ERWARTET } from '../serverModus'
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

  it('Status zeigt je Teil nur ja/nein, keine Werte', async () => {
    const env = { SERVER_MODUS: 'true', WEP_DB: {}, GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'geheim-123', VITE_MS_CLIENT_ID: 'x', MS_CLIENT_SECRET: ' ' }
    const r = await status({ env })
    const text = await r.text()
    expect(JSON.parse(text)).toEqual({
      serverModus: true,
      einrichtung: { datenbank: true, dateien: false, google: true, microsoft: false, mail: false, admins: false },
      schema: { stand: 0, erwartet: SCHEMA_ERWARTET },
    })
    expect(text).not.toContain('geheim')
    expect(text).not.toContain('googleusercontent')
    expect(einrichtung({}).datenbank).toBe(false)
  })

  it('Schema-Stand: mit allen Migrationen genau der erwartete Stand, ohne Datenbank null', async () => {
    const mit = await (await status({ env: { SERVER_MODUS: 'true', WEP_DB: testDb() } })).json()
    expect(mit.schema).toEqual({ stand: SCHEMA_ERWARTET, erwartet: SCHEMA_ERWARTET })
    expect((await (await status({ env: {} })).json()).schema.stand).toBeNull()
    // eine neue Migration muss SCHEMA_ERWARTET mitziehen
    expect(readdirSync(join(__dirname, '../../../migrations')).filter((d) => d.endsWith('.sql'))).toHaveLength(SCHEMA_ERWARTET)
  })
})
