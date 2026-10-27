// POST /api/bv/zugang – Mit Microsoft-ID-Token (Authorization: Bearer …): Status des eigenen Zugangs; beim ersten Mal
// wird ein Antrag angelegt („beantragt“). Admins (BV_ADMINS) sind immer freigegeben.
import { aktiv, angemeldet, antwort, type BvKontext } from '../../_lib/bvZugang'
import { zugang } from '../../_lib/freigaben'

export const onRequestPost = async (ctx: BvKontext): Promise<Response> => {
  if (!aktiv(ctx.env)) return antwort(503, { fehler: 'Zugangskontrolle nicht eingerichtet.' })
  const t = await angemeldet(ctx)
  if (t instanceof Response) return t
  return antwort(200, await zugang(ctx.env.BV_ZUGANG, t, ctx.env.BV_ADMINS))
}

export const onRequest = async (): Promise<Response> => antwort(405, { fehler: 'Nur POST.' })
