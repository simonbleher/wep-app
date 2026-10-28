// v2-Schalter auf dem Server: ohne SERVER_MODUS gibt es /api/v2/ nicht; der Status zeigt nur ja/nein.
import { describe, expect, it } from 'vitest'
import { einrichtung, istServerModus } from '../serverModus'
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
    const aus = await middleware({ env: {}, next: weiter })
    expect(aus.status).toBe(404)
    const an = await middleware({ env: { SERVER_MODUS: 'true' }, next: weiter })
    expect(await an.text()).toBe('weiter')
  })

  it('Status zeigt je Teil nur ja/nein, keine Werte', async () => {
    const env = { SERVER_MODUS: 'true', WEP_DB: {}, GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'geheim-123', VITE_MS_CLIENT_ID: 'x', MS_CLIENT_SECRET: ' ' }
    const r = await status({ env })
    const text = await r.text()
    expect(JSON.parse(text)).toEqual({
      serverModus: true,
      einrichtung: { datenbank: true, dateien: false, google: true, microsoft: false, mail: false, admins: false },
    })
    expect(text).not.toContain('geheim')
    expect(text).not.toContain('googleusercontent')
    expect(einrichtung({}).datenbank).toBe(false)
  })
})
