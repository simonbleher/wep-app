// /api/v2/weps/<id>/dateien/<foto-Id.jpg | bau.xlsx>
//   GET    – Datei abrufen (wer das WEP lesen darf)
//   PUT    – hochladen (wer das WEP bearbeiten darf; Größe und Art geprüft; Fotos des anderen Teils nur, wenn die Datei fehlt)
//   DELETE – entfernen (wer das WEP bearbeiten darf; nicht bei Fotos des anderen Teils)
import { jsonAntwort } from '../../../../../_lib/serverModus'
import { dateiArt, fotoGrenze, pruefeZugriff, type R2Ablage } from '../../../../../_lib/v2/dateien'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../../../_lib/v2/kontext'

const ANDERER_TEIL = 'Dieses Foto gehört zum anderen Teil des WEP – es lässt sich nur dort ändern.'

async function vorbereiten(ctx: V2Kontext<'id' | 'datei'>, schreiben: boolean) {
  const db = datenbank(ctx.env)
  const r2 = ctx.env.WEP_DATEIEN as R2Ablage | undefined
  if (!db) return NICHT_EINGERICHTET()
  if (!r2) return jsonAntwort(503, { fehler: 'Der Dateispeicher ist noch nicht eingerichtet (WEP_DATEIEN).' })
  if (schreiben) {
    const fremd = fremdeHerkunft(ctx.request)
    if (fremd) return fremd
  }
  const art = dateiArt(ctx.params.id, ctx.params.datei)
  if (!art) return jsonAntwort(400, { fehler: 'Unbekannte Datei.' })
  const konto = await freigegebenesKonto(db, ctx.request)
  if (konto instanceof Response) return konto
  const z = await pruefeZugriff(db, konto, ctx.params.id, schreiben ? art : false)
  if (!z.ok) return jsonAntwort(z.status, { fehler: z.fehler })
  return { r2, art, nurNeu: Boolean(z.nurNeu), zeile: z.wert }
}

export const onRequestGet = async (ctx: V2Kontext<'id' | 'datei'>): Promise<Response> => {
  const v = await vorbereiten(ctx, false)
  if (v instanceof Response) return v
  const obj = await v.r2.get(v.art.key)
  if (!obj?.body) return jsonAntwort(404, { fehler: 'Datei nicht auf dem Server.' })
  return new Response(obj.body, { headers: { 'content-type': v.art.typ, 'content-length': String(obj.size), 'cache-control': 'private, no-store' } })
}

export const onRequestPut = async (ctx: V2Kontext<'id' | 'datei'>): Promise<Response> => {
  const v = await vorbereiten(ctx, true)
  if (v instanceof Response) return v
  const laenge = Number(ctx.request.headers.get('content-length') ?? '0')
  if (laenge > v.art.max) return jsonAntwort(413, { fehler: 'Die Datei ist zu groß.' })
  const bytes = await ctx.request.arrayBuffer()
  if (bytes.byteLength > v.art.max) return jsonAntwort(413, { fehler: 'Die Datei ist zu groß.' })
  if (!bytes.byteLength) return jsonAntwort(400, { fehler: 'Die Datei ist leer.' })
  // Inhalt grob prüfen: JPEG beginnt mit FF D8, XLSX ist ein ZIP (PK)
  const k = new Uint8Array(bytes.slice(0, 2))
  const passt = v.art.art === 'foto' ? k[0] === 0xff && k[1] === 0xd8 : k[0] === 0x50 && k[1] === 0x4b
  if (!passt) return jsonAntwort(415, { fehler: v.art.art === 'foto' ? 'Kein JPEG-Bild.' : 'Keine Excel-Datei.' })
  if (v.nurNeu && (await v.r2.get(v.art.key))) return jsonAntwort(403, { fehler: ANDERER_TEIL })
  if (v.art.fotoId) {
    const grenze = await fotoGrenze(v.r2, v.zeile, v.art.fotoId)
    if (grenze) return jsonAntwort(grenze.status, { fehler: grenze.fehler })
  }
  await v.r2.put(v.art.key, bytes, { httpMetadata: { contentType: v.art.typ } })
  return jsonAntwort(200, { ok: true })
}

export const onRequestDelete = async (ctx: V2Kontext<'id' | 'datei'>): Promise<Response> => {
  const v = await vorbereiten(ctx, true)
  if (v instanceof Response) return v
  if (v.nurNeu) return jsonAntwort(403, { fehler: ANDERER_TEIL })
  await v.r2.delete(v.art.key)
  return jsonAntwort(200, { ok: true })
}
