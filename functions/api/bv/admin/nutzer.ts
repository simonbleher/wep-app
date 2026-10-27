// /api/bv/admin/nutzer – nur für Admins (BV_ADMINS):
//   GET  → alle Anträge und Freigaben
//   POST { tid, oid, aktion: 'freigeben' | 'sperren' | 'loeschen' }
import { aktiv, angemeldet, antwort, type BvKontext } from '../../../_lib/bvZugang'
import { aendereNutzer, alleNutzer, istAdmin, type AdminAktion } from '../../../_lib/freigaben'

async function alsAdmin(ctx: BvKontext) {
  if (!aktiv(ctx.env)) return antwort(503, { fehler: 'Zugangskontrolle nicht eingerichtet.' })
  const t = await angemeldet(ctx)
  if (t instanceof Response) return t
  if (!istAdmin(t, ctx.env.BV_ADMINS)) return antwort(403, { fehler: 'Nur für Admins.' })
  return t
}

export const onRequestGet = async (ctx: BvKontext): Promise<Response> => {
  const t = await alsAdmin(ctx)
  if (t instanceof Response) return t
  return antwort(200, { nutzer: await alleNutzer(ctx.env.BV_ZUGANG!) })
}

const AKTIONEN: readonly AdminAktion[] = ['freigeben', 'sperren', 'loeschen']
const SICHER = /^[A-Za-z0-9-]{1,64}$/

export const onRequestPost = async (ctx: BvKontext): Promise<Response> => {
  const t = await alsAdmin(ctx)
  if (t instanceof Response) return t
  let body: { tid?: unknown; oid?: unknown; aktion?: unknown }
  try {
    body = await ctx.request.json()
  } catch {
    return antwort(400, { fehler: 'Anfrage ist kein gültiges JSON.' })
  }
  const { tid, oid, aktion } = body
  if (typeof tid !== 'string' || typeof oid !== 'string' || !SICHER.test(tid) || !SICHER.test(oid) || !AKTIONEN.includes(aktion as AdminAktion)) {
    return antwort(400, { fehler: 'tid, oid und aktion (freigeben, sperren, loeschen) angeben.' })
  }
  const ok = await aendereNutzer(ctx.env.BV_ZUGANG!, { tid, oid }, aktion as AdminAktion, t)
  return ok ? antwort(200, { nutzer: await alleNutzer(ctx.env.BV_ZUGANG!) }) : antwort(404, { fehler: 'Eintrag nicht gefunden.' })
}

export const onRequest = async (): Promise<Response> => antwort(405, { fehler: 'Nur GET und POST.' })
