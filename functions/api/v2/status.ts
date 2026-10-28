// GET /api/v2/status – Ist v2 eingerichtet? Zeigt nur ja/nein je Teil (Datenbank, Dateien, Google, Microsoft,
// Mail, Admins), nie Werte oder Geheimnisse. Zum Prüfen nach der Einrichtung (docs/V2-EINRICHTUNG.md).
import { einrichtung, jsonAntwort, type V2Umgebung } from '../../_lib/serverModus'

export const onRequestGet = async ({ env }: { env: V2Umgebung }): Promise<Response> =>
  jsonAntwort(200, { serverModus: true, einrichtung: einrichtung(env) })
