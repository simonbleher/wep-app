// POST /api/v2/abmelden – beendet die Sitzung dieses Geräts.
import { jsonAntwort } from '../../_lib/serverModus'
import { protokolliere } from '../../_lib/v2/konten'
import { datenbank, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../_lib/v2/kontext'
import { beendeSitzung, cookie, kontoDerSitzung, SITZUNG_COOKIE } from '../../_lib/v2/sitzung'

export const onRequestPost = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await kontoDerSitzung(db, request)
  await beendeSitzung(db, request)
  if (konto) await protokolliere(db, { kontoId: konto.id, aktion: 'abmeldung' })
  const r = jsonAntwort(200, { ok: true })
  r.headers.append('set-cookie', cookie(SITZUNG_COOKIE, '', 0))
  return r
}
