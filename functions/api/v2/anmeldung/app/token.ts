// POST /api/v2/anmeldung/app/token { code, verifier } – die Android-/Windows-App tauscht den Einmal-Code aus dem
// Rücksprung gegen ein Sitzungs-Token (Bearer). Ohne Cookie und ohne Origin-Prüfung: geschützt durch den Verifier, den
// nur die App kennt, die die Anmeldung begonnen hat (functions/_lib/v2/appAnmeldung.ts).
import { jsonAntwort } from '../../../../_lib/serverModus'
import { loeseAppCodeEin } from '../../../../_lib/v2/appAnmeldung'
import { ladeKonto, protokolliere } from '../../../../_lib/v2/konten'
import { datenbank, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'

export const onRequestPost = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const body = (await request.json().catch(() => ({}))) as { code?: unknown; verifier?: unknown }
  const e = await loeseAppCodeEin(db, body.code, body.verifier)
  if (!e.ok) return jsonAntwort(400, { fehler: e.fehler })
  await protokolliere(db, { kontoId: e.kontoId, aktion: 'anmeldung_app', details: e.geraet })
  return jsonAntwort(200, { token: e.token, konto: await ladeKonto(db, e.kontoId) })
}
