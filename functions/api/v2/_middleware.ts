// Alle Endpunkte unter /api/v2/: ohne SERVER_MODUS=true gibt es sie nicht (404). In Produktion ist der Schalter gesetzt.
// CORS nur für die Herkünfte der Android- und Windows-App (die Web-App läuft auf derselben Herkunft wie der Server): Die
// Apps schicken `Authorization: Bearer`, keine Cookies – deshalb ohne Access-Control-Allow-Credentials.
import { istServerModus, jsonAntwort, type V2Umgebung } from '../../_lib/serverModus'

/** WebView-Herkünfte der Apps: Capacitor (Android, androidScheme https) und Tauri 2 unter Windows (useHttpsScheme). */
export const APP_HERKUENFTE = ['https://localhost', 'https://tauri.localhost', 'http://tauri.localhost']

function corsKoepfe(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

export const onRequest = async (ctx: { request: Request; env: V2Umgebung; next: () => Promise<Response> }): Promise<Response> => {
  if (!istServerModus(ctx.env)) return jsonAntwort(404, { fehler: 'Nicht gefunden.' })
  const origin = ctx.request.headers.get('origin') ?? ''
  const app = APP_HERKUENFTE.includes(origin)
  if (ctx.request.method === 'OPTIONS') return new Response(null, { status: app ? 204 : 403, headers: app ? corsKoepfe(origin) : {} })
  const antwort = await ctx.next()
  if (!app) return antwort
  const neu = new Response(antwort.body, antwort)
  for (const [k, v] of Object.entries(corsKoepfe(origin))) neu.headers.set(k, v)
  return neu
}
