/**
 * Browser-Client für POST /api/ki/skizze-chat.
 * Der API-Schlüssel liegt nur auf dem Server; hier gibt es höchstens das optionale
 * App-Token (VITE_KI_TOKEN), das keinen KI-Zugang öffnet, sondern nur die Funktion absichert.
 */

import { ChatFehler, type ChatAnfrage, type ChatAntwortDaten } from './chatAblauf'

export const KI_SKIZZE_CHAT_URL = '/api/ki/skizze-chat'

export async function chatUeberHttp(anfrage: ChatAnfrage, fetchFn: typeof fetch = fetch): Promise<ChatAntwortDaten> {
  const token = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_KI_TOKEN
  let res: Response
  try {
    res = await fetchFn(KI_SKIZZE_CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-wep-token': token } : {}) },
      body: JSON.stringify(anfrage),
    })
  } catch {
    throw new ChatFehler('Kein Netz – der Chat braucht eine Internetverbindung.', 0)
  }
  let body: { fehler?: string; erneutNachSek?: number } & Partial<ChatAntwortDaten> = {}
  try {
    body = await res.json()
  } catch {
    /* kein JSON */
  }
  if (!res.ok) {
    const warte = res.status === 503 && body.erneutNachSek ? ` (in ca. ${body.erneutNachSek} s wieder)` : ''
    throw new ChatFehler((body.fehler ?? `Fehler ${res.status}`) + warte, res.status, body.erneutNachSek)
  }
  return body as ChatAntwortDaten
}
