// Kern von POST /api/ki/skizze-chat – ohne Cloudflare-Typen, damit er auch im
// Testlauf (tools/ki-test/run-chat.ts) und in Unit-Tests direkt aufrufbar ist.
//
// Eingabe: Nachricht + kompakte Szene (JSON) + gerendertes PNG der aktuellen Skizze.
// Ausgabe: nur Function Calls (Namen und Argumente); die Geometrie rechnet die App.

import {
  FUNKTIONEN,
  FUNKTIONS_NAMEN,
  SYSTEM_BEARBEITEN,
  SYSTEM_PRUEFEN,
  baueNachricht,
  bauePruefNachricht,
} from '../../src/skizze/chatWerkzeuge'
import { rufeFunktionen, type FunktionsAufruf, type Teil } from './gemini'
import { STANDARD_MODELLE, rufeMitKette } from './kette'

/** Obergrenzen, damit niemand mit einer Anfrage das Gratis-Kontingent leert. */
export const MAX_NACHRICHT = 2000
export const MAX_SZENE = 60_000
export const MAX_BILD_BASE64 = 3_000_000
export const MAX_BEFUNDE = 30

export interface ChatEingabe {
  nachricht: string
  /** Kompakte Szene (`szeneKompakt`). */
  szene: string
  /** PNG der aktuellen Skizze, Base64 ohne Vorspann. */
  bild?: string
  modus?: 'bearbeiten' | 'pruefen'
  /** Befunde der Code-Vorprüfung (nur Modus „pruefen“). */
  befunde?: string[]
}

export interface ChatAusgabe {
  aufrufe: FunktionsAufruf[]
  modell: string
  vermerke: string[]
  sekunden: number
  tokensEin?: number
  tokensAus?: number
}

export interface ChatUmgebung {
  apiKey: string
  /** Kette; sonst `STANDARD_MODELLE`. */
  modelle?: string[]
  fetch?: typeof fetch
  jetzt?: () => number
}

export interface ChatAntwort {
  status: number
  body: ChatAusgabe | { fehler: string; erneutNachSek?: number }
}

/** Prüft die Eingabe; gibt eine Fehlermeldung oder undefined zurück. */
export function pruefeEingabe(e: unknown): string | undefined {
  const x = e as Partial<ChatEingabe> | null
  if (!x || typeof x !== 'object') return 'Anfrage ist kein JSON-Objekt.'
  if (typeof x.nachricht !== 'string' || !x.nachricht.trim()) return 'Nachricht fehlt.'
  if (x.nachricht.length > MAX_NACHRICHT) return `Nachricht zu lang (max. ${MAX_NACHRICHT} Zeichen).`
  if (typeof x.szene !== 'string' || !x.szene.trim()) return 'Szene fehlt.'
  if (x.szene.length > MAX_SZENE) return 'Szene zu groß.'
  if (x.bild !== undefined && (typeof x.bild !== 'string' || x.bild.length > MAX_BILD_BASE64)) return 'Bild ungültig oder zu groß.'
  if (x.modus !== undefined && x.modus !== 'bearbeiten' && x.modus !== 'pruefen') return 'Modus ungültig.'
  if (
    x.befunde !== undefined &&
    (!Array.isArray(x.befunde) || x.befunde.length > MAX_BEFUNDE || x.befunde.some((b) => typeof b !== 'string' || b.length > 300))
  ) {
    return 'Befunde ungültig.'
  }
  return undefined
}

export async function skizzeChat(eingabe: ChatEingabe, umgebung: ChatUmgebung): Promise<ChatAntwort> {
  const problem = pruefeEingabe(eingabe)
  if (problem) return { status: 400, body: { fehler: problem } }
  if (!umgebung.apiKey) return { status: 500, body: { fehler: 'KI ist nicht eingerichtet (GEMINI_API_KEY fehlt).' } }

  const pruefen = eingabe.modus === 'pruefen'
  const teile: Teil[] = [
    {
      text: pruefen
        ? bauePruefNachricht(eingabe.szene, eingabe.nachricht, eingabe.befunde ?? [])
        : baueNachricht(eingabe.szene, eingabe.nachricht),
    },
  ]
  if (eingabe.bild) teile.push({ inlineData: { mimeType: 'image/png', data: eingabe.bild } })

  const fetchFn = umgebung.fetch ?? fetch
  const jetzt = umgebung.jetzt ?? Date.now
  const t0 = jetzt()
  const erg = await rufeMitKette(
    umgebung.modelle?.length ? umgebung.modelle : STANDARD_MODELLE,
    (modell) =>
      rufeFunktionen(fetchFn, umgebung.apiKey, modell, pruefen ? SYSTEM_PRUEFEN : SYSTEM_BEARBEITEN, teile, FUNKTIONEN),
    jetzt,
    (a) => a.aufrufe.some((c) => FUNKTIONS_NAMEN.includes(c.name)),
  )
  if (erg.ausgelastet) {
    return {
      status: 503,
      body: { fehler: 'Die KI ist gerade ausgelastet. Bitte gleich noch einmal versuchen.', erneutNachSek: erg.ausgelastet.erneutNachSek },
    }
  }
  if (erg.fehler || !erg.wert || !erg.modell) {
    return { status: erg.fehler?.status ?? 502, body: { fehler: erg.fehler?.text ?? 'Keine Antwort von der KI.' } }
  }
  return {
    status: 200,
    body: {
      aufrufe: erg.wert.aufrufe.filter((c) => FUNKTIONS_NAMEN.includes(c.name)),
      modell: erg.modell,
      vermerke: erg.vermerke,
      sekunden: (jetzt() - t0) / 1000,
      tokensEin: erg.wert.tokensEin,
      tokensAus: erg.wert.tokensAus,
    },
  }
}
