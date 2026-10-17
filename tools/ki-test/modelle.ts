// Modellkette: Kandidaten aus models.list filtern, nach Güte sortieren und per
// Probe-Anfrage prüfen, welche im kostenlosen Tarif tatsächlich antworten.
//
// models.list sagt nichts über den Tarif aus. Deshalb schickt die Probe eine
// winzige Anfrage MIT responseSchema (wie im echten Lauf). Ergebnis:
//   200            → frei nutzbar
//   429 „limit: 0“ → kein Freikontingent
//   429 sonst      → Limit gerade erreicht (Modell grundsätzlich frei)
//   400/403/404    → nicht nutzbar (z. B. kein responseSchema)

import { GeminiClient, GeminiFehler, type ModellInfo } from './gemini'

/** Alles, was keine Text-zu-JSON-Aufgabe kann oder ein Agent/Alias ist. */
const AUSSCHLUSS =
  /tts|image|banana|lyria|robotics|computer-use|antigravity|deep-research|transcribe|customtools|embedding|aqa|live|audio|veo|imagen|omni|-latest$/

export type ProbeStatus = 'frei' | 'limit-erreicht' | 'kein-freikontingent' | 'nicht-nutzbar'

export interface Kandidat {
  name: string
  anzeigename: string
  status: ProbeStatus
  meldung?: string
}

function rang(name: string): number[] {
  const version = parseFloat(name.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0')
  const stufe = /flash-lite/.test(name) ? 1 : /flash/.test(name) ? 2 : /pro/.test(name) ? 3 : /^gemma/.test(name) ? 0 : 2.5
  const stabil = /preview|exp/.test(name) ? 0 : 1
  const groesse = parseFloat(name.match(/-(\d+)b/)?.[1] ?? '0') // Gemma: 31b vor 26b
  return [version, stufe, stabil, groesse]
}

/** Sortierung „vom besten abwärts“: neuere Generation vor älterer, darin Pro > Flash > Flash-Lite, stabil vor Vorschau. */
export function sortiereNachGuete(namen: string[]): string[] {
  return [...namen].sort((a, b) => {
    const ra = rang(a)
    const rb = rang(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i]
    return a.localeCompare(b)
  })
}

export function textKandidaten(modelle: ModellInfo[]): ModellInfo[] {
  return modelle.filter(
    (m) =>
      /^(gemini|gemma)-/.test(m.name) &&
      m.methoden.includes('generateContent') &&
      !AUSSCHLUSS.test(m.name),
  )
}

const PROBE_SCHEMA = {
  type: 'OBJECT',
  properties: { ok: { type: 'BOOLEAN' } },
  required: ['ok'],
}

export async function probiere(client: GeminiClient, name: string): Promise<Omit<Kandidat, 'anzeigename'>> {
  try {
    await client.generiereJson(name, 'Antworte als JSON.', [{ text: 'Setze ok auf true.' }], PROBE_SCHEMA, 512)
    return { name, status: 'frei' }
  } catch (e) {
    if (!(e instanceof GeminiFehler)) throw e
    if (e.status === 200) return { name, status: 'frei' } // Antwort kam, nur leer/abgeschnitten
    if (e.status === 429) {
      return { name, status: e.keinFreikontingent ? 'kein-freikontingent' : 'limit-erreicht', meldung: e.message.slice(0, 120) }
    }
    return { name, status: 'nicht-nutzbar', meldung: `HTTP ${e.status}: ${e.message.slice(0, 120)}` }
  }
}

/** Holt models.list, filtert, sortiert und probt alle Kandidaten. */
export async function ermittleKette(client: GeminiClient): Promise<Kandidat[]> {
  const kandidaten = textKandidaten(await client.listeModelle())
  const anzeige = new Map(kandidaten.map((k) => [k.name, k.anzeigename]))
  const sortiert = sortiereNachGuete(kandidaten.map((k) => k.name))
  const ergebnis: Kandidat[] = []
  for (const name of sortiert) {
    const p = await probiere(client, name)
    ergebnis.push({ ...p, anzeigename: anzeige.get(name) ?? '' })
    process.stdout.write(`  ${name.padEnd(34)} ${p.status}${p.meldung ? `  (${p.meldung})` : ''}\n`)
  }
  return ergebnis
}
