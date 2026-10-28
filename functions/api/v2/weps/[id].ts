// /api/v2/weps/<id>
//   GET    – WEP mit Kopf (Revision, Zustand …)
//   PUT    { wep, basisRev } – speichern (neu: Rolle Bau); 409 mit dem Stand des Servers, wenn sich die Revision geändert hat
//   DELETE { basisRev } – in den Papierkorb (nur der Besitzer, solange in Bearbeitung)
import { jsonAntwort } from '../../../_lib/serverModus'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../_lib/v2/kontext'
import { ladeWep, setzePapierkorb, speichereWep, type Ergebnis } from '../../../_lib/v2/weps'

const alsAntwort = <T,>(e: Ergebnis<T>, feld: string) =>
  e.ok ? jsonAntwort(200, { [feld]: e.wert }) : jsonAntwort(e.status, { fehler: e.fehler, ...(e.stand ? { stand: e.stand } : {}) })

async function vorbereiten(ctx: V2Kontext<'id'>, schreibend: boolean) {
  const db = datenbank(ctx.env)
  if (!db) return NICHT_EINGERICHTET()
  if (schreibend) {
    const fremd = fremdeHerkunft(ctx.request)
    if (fremd) return fremd
  }
  const konto = await freigegebenesKonto(db, ctx.request)
  return konto instanceof Response ? konto : { db, konto }
}

export const onRequestGet = async (ctx: V2Kontext<'id'>): Promise<Response> => {
  const v = await vorbereiten(ctx, false)
  if (v instanceof Response) return v
  const e = await ladeWep(v.db, v.konto, ctx.params.id)
  return e.ok ? jsonAntwort(200, e.wert) : alsAntwort(e, '')
}

export const onRequestPut = async (ctx: V2Kontext<'id'>): Promise<Response> => {
  const v = await vorbereiten(ctx, true)
  if (v instanceof Response) return v
  const body = (await ctx.request.json().catch(() => ({}))) as { wep?: unknown; basisRev?: unknown }
  return alsAntwort(await speichereWep(v.db, v.konto, ctx.params.id, body), 'kopf')
}

export const onRequestDelete = async (ctx: V2Kontext<'id'>): Promise<Response> => {
  const v = await vorbereiten(ctx, true)
  if (v instanceof Response) return v
  const body = (await ctx.request.json().catch(() => ({}))) as { basisRev?: unknown }
  return alsAntwort(await setzePapierkorb(v.db, v.konto, ctx.params.id, true, body.basisRev), 'kopf')
}
