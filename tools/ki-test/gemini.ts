// Schlanker Client für die Gemini-API (Google AI Studio).
//
// Der API-Key wird ausschließlich im Header `x-goog-api-key` übertragen – nie in
// der URL –, damit er weder in Fehlermeldungen noch in Logs auftaucht. Zusätzlich
// werden alle Fehlertexte vor der Ausgabe vom Key bereinigt.

import { readFileSync, existsSync } from 'node:fs'

const BASIS = 'https://generativelanguage.googleapis.com/v1beta'

/** Liest GEMINI_API_KEY aus .dev.vars (Projektwurzel) oder der Umgebung. */
export function leseApiKey(pfadDevVars: string): string {
  if (existsSync(pfadDevVars)) {
    for (const zeile of readFileSync(pfadDevVars, 'utf8').split(/\r?\n/)) {
      const m = zeile.match(/^\s*GEMINI_API_KEY\s*=\s*(.*)\s*$/)
      if (m) return m[1].replace(/^["']|["']$/g, '').trim()
    }
  }
  const ausUmgebung = process.env.GEMINI_API_KEY
  if (ausUmgebung) return ausUmgebung.trim()
  throw new Error('GEMINI_API_KEY fehlt (in .dev.vars eintragen: GEMINI_API_KEY=...)')
}

export class GeminiFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Vom Server empfohlene Wartezeit (RetryInfo) in Sekunden, falls angegeben. */
    readonly wartenSek?: number,
    /** true, wenn das Kontingent im kostenlosen Tarif 0 ist („limit: 0“). */
    readonly keinFreikontingent = false,
  ) {
    super(message)
  }
}

export interface ModellInfo {
  name: string // ohne Präfix „models/“
  anzeigename: string
  methoden: string[]
}

export interface Teil {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

export interface Antwort {
  text: string
  tokensEin?: number
  tokensAus?: number
}

export class GeminiClient {
  constructor(private readonly key: string) {}

  private bereinige(text: string): string {
    return this.key ? text.split(this.key).join('***') : text
  }

  private async anfrage(pfad: string, body?: unknown): Promise<any> {
    let res: Response
    try {
      res = await fetch(`${BASIS}/${pfad}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'x-goog-api-key': this.key, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      throw new GeminiFehler(this.bereinige(`Netzwerkfehler: ${(e as Error).message}`), 0)
    }
    const text = await res.text()
    if (res.ok) return JSON.parse(text)

    let meldung = text
    let wartenSek: number | undefined
    try {
      const fehler = JSON.parse(text).error
      meldung = fehler?.message ?? text
      for (const d of fehler?.details ?? []) {
        if (String(d['@type']).endsWith('RetryInfo') && d.retryDelay) {
          wartenSek = parseFloat(String(d.retryDelay))
        }
      }
    } catch {
      /* kein JSON – Rohtext behalten */
    }
    const keinFrei = res.status === 429 && /limit:\s*0\b/.test(meldung)
    throw new GeminiFehler(
      this.bereinige(meldung).slice(0, 400),
      res.status,
      wartenSek,
      keinFrei,
    )
  }

  /** models.list – alle Seiten. */
  async listeModelle(): Promise<ModellInfo[]> {
    const ergebnis: ModellInfo[] = []
    let seite = ''
    do {
      const j = await this.anfrage(`models?pageSize=200${seite ? `&pageToken=${seite}` : ''}`)
      for (const m of j.models ?? []) {
        ergebnis.push({
          name: String(m.name).replace(/^models\//, ''),
          anzeigename: m.displayName ?? '',
          methoden: m.supportedGenerationMethods ?? [],
        })
      }
      seite = j.nextPageToken ?? ''
    } while (seite)
    return ergebnis
  }

  /** generateContent mit JSON-Antwort nach responseSchema. */
  async generiereJson(
    modell: string,
    systemText: string,
    teile: Teil[],
    schema: unknown,
    maxTokens?: number,
  ): Promise<Antwort> {
    const j = await this.anfrage(`models/${modell}:generateContent`, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: teile }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
      },
    })
    const kandidat = j.candidates?.[0]
    const text: string = (kandidat?.content?.parts ?? [])
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text ?? '')
      .join('')
    if (!text) {
      const grund = kandidat?.finishReason ?? j.promptFeedback?.blockReason ?? 'leer'
      throw new GeminiFehler(`Leere Antwort (${grund})`, 200)
    }
    return {
      text,
      tokensEin: j.usageMetadata?.promptTokenCount,
      tokensAus: j.usageMetadata?.candidatesTokenCount,
    }
  }
}
