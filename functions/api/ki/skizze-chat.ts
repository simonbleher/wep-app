// POST /api/ki/skizze-chat – Skizze per Beschreibung bearbeiten (Cloudflare Pages Function).
//
// Der API-Key (Secret GEMINI_API_KEY) bleibt serverseitig; die App sieht ihn nie.
// Optional: KI_MODELLE (kommagetrennte Modellkette), APP_TOKEN (gemeinsames Geheimnis,
// dann muss die App es im Header x-wep-token mitschicken).

import { skizzeChat } from '../../_lib/skizzeChat'

interface Umgebung {
  GEMINI_API_KEY?: string
  KI_MODELLE?: string
  APP_TOKEN?: string
}

interface Kontext {
  request: Request
  env: Umgebung
}

const json = (status: number, body: unknown, kopf: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...kopf },
  })

export const onRequestPost = async ({ request, env }: Kontext): Promise<Response> => {
  if (env.APP_TOKEN && request.headers.get('x-wep-token') !== env.APP_TOKEN) {
    return json(401, { fehler: 'Nicht erlaubt.' })
  }
  let eingabe: unknown
  try {
    eingabe = await request.json()
  } catch {
    return json(400, { fehler: 'Anfrage ist kein gültiges JSON.' })
  }
  const modelle = env.KI_MODELLE?.split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  const antwort = await skizzeChat(eingabe as Parameters<typeof skizzeChat>[0], { apiKey: env.GEMINI_API_KEY ?? '', modelle })
  const erneut = 'erneutNachSek' in antwort.body ? antwort.body.erneutNachSek : undefined
  return json(antwort.status, antwort.body, erneut ? { 'retry-after': String(erneut) } : {})
}

// Alles andere ist nicht erlaubt
export const onRequest = async (): Promise<Response> => json(405, { fehler: 'Nur POST.' }, { allow: 'POST' })
