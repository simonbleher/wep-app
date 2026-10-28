// Alle Endpunkte unter /api/v2/: ohne SERVER_MODUS=true gibt es sie nicht (404), v1 bleibt unberührt.
import { istServerModus, jsonAntwort, type V2Umgebung } from '../../_lib/serverModus'

export const onRequest = async (ctx: { env: V2Umgebung; next: () => Promise<Response> }): Promise<Response> =>
  istServerModus(ctx.env) ? ctx.next() : jsonAntwort(404, { fehler: 'Nicht gefunden.' })
