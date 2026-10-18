// Schlanker Gemini-Client für Cloudflare Pages Functions (nur fetch, kein Node).
//
// Der API-Key geht ausschließlich im Header `x-goog-api-key` raus – nie in die URL –
// und wird aus allen Fehlertexten entfernt, damit er weder in Logs noch in Antworten
// an die App auftaucht.

const BASIS = 'https://generativelanguage.googleapis.com/v1beta'

export class GeminiFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Vom Server empfohlene Wartezeit (RetryInfo) in Sekunden. */
    readonly wartenSek?: number,
    /** true, wenn das Kontingent im kostenlosen Tarif 0 ist („limit: 0“). */
    readonly keinFreikontingent = false,
  ) {
    super(message)
  }
}

export interface Teil {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

export interface FunktionsAufruf {
  name: string
  args?: Record<string, unknown>
}

export interface FunktionsAntwort {
  aufrufe: FunktionsAufruf[]
  tokensEin?: number
  tokensAus?: number
}

export interface FunktionsDeklaration {
  name: string
  description: string
  parameters: unknown
}

export async function rufeFunktionen(
  fetchFn: typeof fetch,
  key: string,
  modell: string,
  systemText: string,
  teile: Teil[],
  funktionen: readonly FunktionsDeklaration[],
): Promise<FunktionsAntwort> {
  const bereinige = (t: string) => (key ? t.split(key).join('***') : t)
  let res: Response
  try {
    res = await fetchFn(`${BASIS}/models/${encodeURIComponent(modell)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: 'user', parts: teile }],
        tools: [{ functionDeclarations: funktionen }],
        // ANY: das Modell muss eine Funktion aufrufen, Fließtext gibt es nicht
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
        generationConfig: { temperature: 0.2 },
      }),
    })
  } catch (e) {
    throw new GeminiFehler(bereinige(`Netzwerkfehler: ${(e as Error).message}`), 0)
  }
  const text = await res.text()
  if (!res.ok) {
    let meldung = text
    let wartenSek: number | undefined
    try {
      const fehler = JSON.parse(text).error
      meldung = fehler?.message ?? text
      for (const d of fehler?.details ?? []) {
        if (String(d['@type']).endsWith('RetryInfo') && d.retryDelay) wartenSek = parseFloat(String(d.retryDelay))
      }
    } catch {
      /* kein JSON – Rohtext behalten */
    }
    throw new GeminiFehler(
      bereinige(meldung).slice(0, 400),
      res.status,
      wartenSek,
      res.status === 429 && /limit:\s*0\b/.test(meldung),
    )
  }
  const j = JSON.parse(text)
  const aufrufe: FunktionsAufruf[] = []
  for (const teil of j.candidates?.[0]?.content?.parts ?? []) {
    if (teil.functionCall?.name) aufrufe.push({ name: String(teil.functionCall.name), args: teil.functionCall.args ?? {} })
  }
  return { aufrufe, tokensEin: j.usageMetadata?.promptTokenCount, tokensAus: j.usageMetadata?.candidatesTokenCount }
}
