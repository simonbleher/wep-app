// GET /api/v2/ich/sitzungen – eigene offene Sitzungen (Browser, Android-App, Windows-App).
// DELETE /api/v2/ich/sitzungen?id=<Kennung> – eine eigene Sitzung beenden (z. B. verlorenes Gerät).
// DELETE /api/v2/ich/sitzungen?alle=1 – überall abmelden (alle eigenen Sitzungen, auch diese).
import { jsonAntwort } from '../../../_lib/serverModus'
import { protokolliere } from '../../../_lib/v2/konten'
import { datenbank, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../_lib/v2/kontext'
import { beendeAlleSitzungen, beendeSitzungMitId, cookie, kontoDerSitzung, SITZUNG_COOKIE, sitzungenVon } from '../../../_lib/v2/sitzung'

export const onRequestGet = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const konto = await kontoDerSitzung(db, request)
  if (!konto) return jsonAntwort(401, { fehler: 'Nicht angemeldet.' })
  return jsonAntwort(200, { sitzungen: await sitzungenVon(db, konto.id, request) })
}

export const onRequestDelete = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await kontoDerSitzung(db, request)
  if (!konto) return jsonAntwort(401, { fehler: 'Nicht angemeldet.' })
  const q = new URL(request.url).searchParams
  if (q.get('alle') === '1') {
    // „Überall abmelden“ – auch diese Sitzung (Fund N6)
    const anzahl = await beendeAlleSitzungen(db, konto.id)
    await protokolliere(db, { kontoId: konto.id, aktion: 'ueberall_abgemeldet', details: String(anzahl) })
    const r = jsonAntwort(200, { sitzungen: [] })
    r.headers.append('set-cookie', cookie(SITZUNG_COOKIE, '', 0))
    return r
  }
  const id = q.get('id') ?? ''
  if (!(await beendeSitzungMitId(db, konto.id, id))) return jsonAntwort(404, { fehler: 'Sitzung nicht gefunden.' })
  await protokolliere(db, { kontoId: konto.id, aktion: 'sitzung_beendet', details: id })
  return jsonAntwort(200, { sitzungen: await sitzungenVon(db, konto.id, request) })
}
