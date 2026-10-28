// POST /api/v2/weps/<id>/aktion { aktion, basisRev, … } – Schritt im Ablauf:
//   an_gruen { gruenKonto }  · an_bv  · rueckfrage { an: bau|gruen|beide, notiz }  · geprueft { notiz? }
//   wiederoeffnen { begruendung }
// Nur auf dem aktuellen Stand (basisRev); wer was darf, steht in src/server/rechte.ts.
import { jsonAntwort } from '../../../../_lib/serverModus'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { fuehreAktionAus } from '../../../../_lib/v2/weps'

export const onRequestPost = async ({ request, env, params }: V2Kontext<'id'>): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const e = await fuehreAktionAus(db, konto, params.id, body)
  return e.ok ? jsonAntwort(200, { kopf: e.wert }) : jsonAntwort(e.status, { fehler: e.fehler, ...(e.stand ? { stand: e.stand } : {}) })
}
