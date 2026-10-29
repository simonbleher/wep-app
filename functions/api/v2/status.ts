// GET /api/v2/status – Ist v2 eingerichtet? Zeigt nur ja/nein je Teil (Datenbank, Dateien, Google, Microsoft,
// Mail, Admins) und den Stand der Datenbank (eingespielte Migrationen), nie Werte oder Geheimnisse. Zum Prüfen nach der Einrichtung (docs/V2-EINRICHTUNG.md).
// Angemeldete Admins bekommen zusätzlich `warnungen` (z. B. V2_ADMINS ohne Anbieter, Fund M3).
import { einrichtung, jsonAntwort, schemaStand, SCHEMA_ERWARTET, type V2Umgebung } from '../../_lib/serverModus'
import { adminWarnungen } from '../../_lib/v2/konten'
import { datenbank } from '../../_lib/v2/kontext'
import { kontoDerSitzung } from '../../_lib/v2/sitzung'

export const onRequestGet = async ({ request, env }: { request?: Request; env: V2Umgebung }): Promise<Response> => {
  const db = datenbank(env)
  const konto = db && request ? await kontoDerSitzung(db, request).catch(() => undefined) : undefined
  const admin = konto?.status === 'freigegeben' && konto.rollen.includes('admin')
  return jsonAntwort(200, {
    serverModus: true,
    einrichtung: einrichtung(env),
    schema: { stand: (await schemaStand(env)) ?? null, erwartet: SCHEMA_ERWARTET },
    ...(admin ? { warnungen: adminWarnungen(env.V2_ADMINS) } : {}),
  })
}
