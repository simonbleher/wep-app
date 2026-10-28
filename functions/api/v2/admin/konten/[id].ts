// POST /api/v2/admin/konten/<id> { aktion: freigeben | sperren | loeschen | rollen, rollen? } – nur Admins.
// Antwort: die neue Kontenliste. Jede Aktion steht im Zugriffsprotokoll.
import { jsonAntwort } from '../../../../_lib/serverModus'
import { adminAktionFehler, alleKonten, fuehreAdminAktionAus, ladeKonto, type AdminAktion, type Rolle } from '../../../../_lib/v2/konten'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'

function leseAktion(body: { aktion?: unknown; rollen?: unknown }): AdminAktion | undefined {
  if (body.aktion === 'freigeben' || body.aktion === 'sperren' || body.aktion === 'loeschen') return { aktion: body.aktion }
  if (body.aktion === 'rollen' && Array.isArray(body.rollen)) return { aktion: 'rollen', rollen: body.rollen as Rolle[] }
  return undefined
}

export const onRequestPost = async ({ request, env, params }: V2Kontext<'id'>): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const admin = await freigegebenesKonto(db, request, 'admin')
  if (admin instanceof Response) return admin
  const aktion = leseAktion((await request.json().catch(() => ({}))) as object)
  if (!aktion) return jsonAntwort(400, { fehler: 'Unbekannte Aktion.' })
  const ziel = await ladeKonto(db, params.id)
  if (!ziel) return jsonAntwort(404, { fehler: 'Konto nicht gefunden.' })
  const fehler = adminAktionFehler(admin, ziel, aktion)
  if (fehler) return jsonAntwort(400, { fehler })
  await fuehreAdminAktionAus(db, admin, ziel, aktion)
  return jsonAntwort(200, { konten: await alleKonten(db) })
}
