// GET /api/v2/status – Ist v2 eingerichtet? Ohne Anmeldung nur, ob Google und Microsoft eingerichtet sind (das braucht
// die Anmeldeseite). Angemeldete Admins sehen alles: ja/nein je Teil (Datenbank, Dateien, Google, Microsoft, Mail, Admins),
// den Stand der Datenbank und `warnungen` (z. B. V2_ADMINS ohne Anbieter). Nie Werte oder Geheimnisse (Fund N9,
// docs/SICHERHEITSPRUEFUNG-V2.md; Prüfen nach der Einrichtung: docs/V2-EINRICHTUNG.md).
import { einrichtung, jsonAntwort, schemaStand, SCHEMA_ERWARTET, type V2Umgebung } from '../../_lib/serverModus'
import { adminWarnungen } from '../../_lib/v2/konten'
import { datenbank } from '../../_lib/v2/kontext'
import { kontoDerSitzung } from '../../_lib/v2/sitzung'

export const onRequestGet = async ({ request, env }: { request?: Request; env: V2Umgebung }): Promise<Response> => {
  const db = datenbank(env)
  const konto = db && request ? await kontoDerSitzung(db, request).catch(() => undefined) : undefined
  const admin = konto?.status === 'freigegeben' && konto.rollen.includes('admin')
  const e = einrichtung(env)
  if (!admin) return jsonAntwort(200, { serverModus: true, einrichtung: { google: e.google, microsoft: e.microsoft } })
  return jsonAntwort(200, {
    serverModus: true,
    einrichtung: e,
    schema: { stand: (await schemaStand(env)) ?? null, erwartet: SCHEMA_ERWARTET },
    warnungen: adminWarnungen(env.V2_ADMINS),
  })
}
