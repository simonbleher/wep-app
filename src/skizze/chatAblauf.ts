/**
 * Ablauf einer Chat-Nachricht: bearbeiten → Selbstprüfung (höchstens 1 Korrekturrunde).
 *
 * Unabhängig von UI und Netzwerk: `rufe` (HTTP oder direkter Aufruf des Server-Kerns) und
 * `rendere` (Canvas im Browser oder @napi-rs/canvas im Testlauf) werden übergeben.
 */

import { macheRueckgaengig, pruefeSzene, wendeAn, type Schritt } from './operationen'
import { aufrufZuOperation, type Aufruf } from './chatWerkzeuge'
import { szeneKompakt, type Szene } from './szene'

export interface ChatAnfrage {
  nachricht: string
  szene: string
  bild?: string
  modus?: 'bearbeiten' | 'pruefen'
  befunde?: string[]
}

export interface ChatAntwortDaten {
  aufrufe: Aufruf[]
  modell: string
  vermerke?: string[]
  sekunden?: number
}

export interface ChatAbhaengigkeiten {
  rufe(anfrage: ChatAnfrage): Promise<ChatAntwortDaten>
  /** PNG der Szene, Base64 ohne Vorspann. */
  rendere(szene: Szene): Promise<string>
}

export interface ChatSchritt extends Schritt {
  /** true = Korrektur aus der Selbstprüfung */
  pruefung?: boolean
}

export interface ChatErgebnis {
  szene: Szene
  schritte: ChatSchritt[]
  /** Rückfragen und Erklärungen der KI (Funktion „hinweis“). */
  hinweise: string[]
  modelle: string[]
  /** Befunde des Codes nach dem Anwenden (vor der Korrektur). */
  befunde: string[]
  /** Satz der KI zur Selbstprüfung („fertig“) oder Hinweis, falls die Prüfung ausfiel. */
  pruefung?: string
  fehler?: string
  sekunden: number
}

/** Fehler des Servers (z. B. 503 „ausgelastet“) in lesbarer Form. */
export class ChatFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly erneutNachSek?: number,
  ) {
    super(message)
  }
}

interface Angewendet {
  szene: Szene
  schritte: ChatSchritt[]
  hinweise: string[]
  fertig?: string
}

function wendeAufrufeAn(szene: Szene, aufrufe: Aufruf[], pruefung: boolean): Angewendet {
  let s = szene
  const schritte: ChatSchritt[] = []
  const hinweise: string[] = []
  let fertig: string | undefined
  for (const aufruf of aufrufe) {
    const r = aufrufZuOperation(aufruf)
    if (r.art === 'operation') {
      const e = wendeAn(s, r.operation)
      s = e.szene
      schritte.push({ ...e.schritt, ...(pruefung ? { pruefung: true } : {}) })
    } else if (r.art === 'hinweis') {
      if (r.text) hinweise.push(r.text)
    } else if (r.art === 'fertig') {
      fertig = r.text || 'passt'
    } else {
      schritte.push({ ok: false, text: r.text, ids: [], ...(pruefung ? { pruefung: true } : {}) })
    }
  }
  return { szene: s, schritte, hinweise, fertig }
}

export async function fuehreChatAus(szene: Szene, nachricht: string, deps: ChatAbhaengigkeiten): Promise<ChatErgebnis> {
  const t0 = Date.now()
  const ergebnis: ChatErgebnis = { szene, schritte: [], hinweise: [], modelle: [], befunde: [], sekunden: 0 }
  const fertig = (e: ChatErgebnis): ChatErgebnis => ({ ...e, sekunden: (Date.now() - t0) / 1000 })

  let antwort: ChatAntwortDaten
  try {
    antwort = await deps.rufe({ nachricht, szene: szeneKompakt(szene), bild: await deps.rendere(szene), modus: 'bearbeiten' })
  } catch (e) {
    return fertig({ ...ergebnis, fehler: (e as Error).message })
  }
  ergebnis.modelle.push(antwort.modell)
  const a = wendeAufrufeAn(szene, antwort.aufrufe, false)
  ergebnis.szene = a.szene
  ergebnis.schritte = a.schritte
  ergebnis.hinweise = a.hinweise

  // Selbstprüfung nur, wenn sich wirklich etwas geändert hat
  if (!a.schritte.some((s) => s.ok)) return fertig(ergebnis)
  const befunde = pruefeSzene(a.szene).map((b) => b.text)
  ergebnis.befunde = befunde
  try {
    const pruef = await deps.rufe({
      nachricht,
      szene: szeneKompakt(a.szene),
      bild: await deps.rendere(a.szene),
      modus: 'pruefen',
      befunde,
    })
    ergebnis.modelle.push(pruef.modell)
    const k = wendeAufrufeAn(a.szene, pruef.aufrufe, true)
    ergebnis.szene = k.szene
    ergebnis.schritte = [...ergebnis.schritte, ...k.schritte]
    ergebnis.hinweise = [...ergebnis.hinweise, ...k.hinweise]
    ergebnis.pruefung = k.schritte.length ? `${k.schritte.length} Korrektur(en)` : (k.fertig ?? 'passt')
  } catch (e) {
    // Die Änderungen stehen schon; nur die Prüfung fiel aus.
    ergebnis.pruefung = `Prüfung nicht möglich: ${(e as Error).message}`
  }
  return fertig(ergebnis)
}

/** Macht einen Schritt der Liste rückgängig (unabhängig von den anderen). */
export const schrittRueckgaengig = macheRueckgaengig
