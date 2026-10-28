// Server-Modus (v2): Schritte im Ablauf (Abgabe Bau → Grün → BV, Rückfrage …) aus der App. Abgegeben wird nur, was
// beim Server angekommen ist: erst abgleichen, dann den Schritt auf genau diesem Stand (Revision) ausführen.
import type { Wep } from '@/model'
import { wartetAufUpload } from '@/sync/engine'
import { syncSpeicher } from '@/sync/speicher'
import { gemerktesKonto } from './api'
import { jetztMitServerAbgleichen } from './abgleichDienst'
import { darfAnlegen, darfLoeschen, istGruenWep, moeglicheAktionen, neuerKopf, schreibrecht, type AblaufAktion, type AblaufAktionName, type RechteKonto, type Schreibrecht, type WepKopf } from './rechte'

async function rufe<T>(pfad: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(pfad, { ...init, credentials: 'same-origin', headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) } })
  const d = (await r.json().catch(() => ({}))) as T & { fehler?: string }
  if (!r.ok) throw new Error(d.fehler ?? `Server antwortet mit ${r.status}`)
  return d
}

export interface GruenKonto {
  id: string
  name: string
  email: string
}

export const ladeGruenKonten = async () => (await rufe<{ konten: GruenKonto[] }>('/api/v2/konten/gruen')).konten

export interface VerlaufEintrag {
  zeit: string
  aktion: string
  wer: string
  notiz?: string
  zustandVorher?: string
  zustandNachher?: string
}

export const ladeVerlauf = async (wepId: string) => (await rufe<{ verlauf: VerlaufEintrag[] }>(`/api/v2/weps/${encodeURIComponent(wepId)}/verlauf`)).verlauf

/**
 * Führt einen Schritt aus. Ohne Netz oder solange hier noch Änderungen auf den Server warten, wird nicht abgegeben.
 * Danach wird abgeglichen, damit der neue Zustand im WEP steht.
 */
export async function fuehreSchrittAus(wepId: string, schritt: AblaufAktion): Promise<{ ok: true } | { ok: false; meldung: string }> {
  if (!navigator.onLine) return { ok: false, meldung: 'Ohne Netz geht das nicht: Der aktuelle Stand muss erst beim Server sein. Deine Änderungen bleiben auf dem Gerät.' }
  try {
    await jetztMitServerAbgleichen()
  } catch (e) {
    return { ok: false, meldung: `Abgleich nicht möglich: ${e instanceof Error ? e.message : String(e)}` }
  }
  const m = (await syncSpeicher.alleMeta()).find((x) => x.id === wepId)
  if (!m || m.serverRev === undefined || wartetAufUpload(m)) return { ok: false, meldung: 'Der aktuelle Stand ist noch nicht beim Server. Bitte gleich noch einmal versuchen.' }
  if (m.konflikt) return { ok: false, meldung: 'Bitte zuerst den Konflikt oben klären.' }
  try {
    await rufe(`/api/v2/weps/${encodeURIComponent(wepId)}/aktion`, { method: 'POST', body: JSON.stringify({ ...schritt, basisRev: m.serverRev }) })
  } catch (e) {
    return { ok: false, meldung: e instanceof Error ? e.message : String(e) }
  }
  await jetztMitServerAbgleichen().catch(() => undefined)
  return { ok: true }
}

/** Kopf aus dem WEP (Ablauf vom Server). Noch nie hochgeladen: in Arbeit bei mir – als Bau-WEP oder eigenes Grün-WEP. */
export function kopfAusWep(wep: Wep, ich: RechteKonto): WepKopf {
  const a = wep.ablauf
  if (!a) return neuerKopf(ich) ?? { zustand: 'bau_in_arbeit', bauKonto: null }
  return {
    zustand: a.zustand,
    bauKonto: a.bau?.id ?? null,
    gruenKonto: a.gruen?.id ?? null,
    rueckfrageAn: a.rueckfrage?.an ?? null,
    rueckfrageBei: a.rueckfrage?.bei ?? null,
    zusammengefuehrtAus: a.zusammengefuehrtAus?.id ?? null,
  }
}

const ichAusSpeicher = (): RechteKonto => {
  const k = gemerktesKonto()
  return { id: k?.id ?? '', rollen: k?.status === 'freigegeben' ? k.rollen : [] }
}

/** Zustand für Liste und Kopf (auch für WEPs, die noch nie auf dem Server waren). */
export const zustandVon = (wep: Wep) => kopfAusWep(wep, ichAusSpeicher()).zustand

/** Eigenes Grün-WEP (ohne Bau-Teil)? */
export const istEigenesGruenWep = (wep: Wep) => istGruenWep(kopfAusWep(wep, ichAusSpeicher()))

export interface ServerSicht {
  recht: Schreibrecht
  aktionen: AblaufAktionName[]
  darfLoeschen: boolean
  darfAnlegen: boolean
}

/** Was ich (zuletzt bestätigtes Konto) an diesem WEP darf – für Reiter, Menü und Knöpfe. */
export function serverSicht(wep: Wep): ServerSicht {
  const ich = ichAusSpeicher()
  const kopf = kopfAusWep(wep, ich)
  return { recht: schreibrecht(kopf, ich), aktionen: moeglicheAktionen(kopf, ich), darfLoeschen: darfLoeschen(kopf, ich), darfAnlegen: darfAnlegen(ich) }
}
