// Server-Modus (v2): Zusammenführen aus der App – lokal (auch ohne Netz) vormerken, beim Abgleich übernimmt der Server
// (./abgleich.ts). Zurücknehmen geht lokal, solange der Server es noch nicht hat, danach über den Server (online), solange
// das Bau-WEP bei Grün in Arbeit ist. Die Rechnung selbst steht in ./zusammenfuehren.ts.
import type { Formalien, Wep } from '@/model'
import { kopiereFotosLokal } from '@/app/db'
import { metaMit } from '@/sync/papierkorb'
import { syncSpeicher } from '@/sync/speicher'
import type { LokalSpeicher, SyncMeta } from '@/sync/types'
import { gemerktesKonto } from './api'
import { jetztMitServerAbgleichen } from './abgleichDienst'
import type { RechteKonto } from './rechte'
import { fuehreZusammen } from './zusammenfuehren'

/**
 * Eigene offene Grün-WEPs auf diesem Gerät: vom Server als „Grün in Arbeit, ohne Bau, mir gehörend“ bekannt, oder hier
 * angelegt und noch nie hochgeladen. Schon (lokal) zusammengeführte zählen nicht.
 */
export function eigeneOffeneWeps(weps: readonly Wep[], metas: readonly SyncMeta[], ich: RechteKonto): Wep[] {
  if (!ich.rollen.includes('gruen')) return []
  const metaVon = new Map(metas.map((m) => [m.id, m]))
  return weps.filter((w) => {
    const m = metaVon.get(w.id)
    if (m?.zusammengefuehrtIn || m?.zusammenfuehrung) return false
    const a = w.ablauf
    if (!a) return m?.serverRev === undefined
    return a.zustand === 'gruen_in_arbeit' && !a.bau && a.gruen?.id === ich.id
  })
}

/** Ein an mich abgegebenes Bau-WEP, das ich (noch) mit einem eigenen WEP zusammenführen kann. */
export function kannZusammenfuehren(wep: Wep, meta: SyncMeta | undefined, ich: RechteKonto): boolean {
  const a = wep.ablauf
  return Boolean(ich.rollen.includes('gruen') && a?.zustand === 'gruen_in_arbeit' && a.bau && a.gruen?.id === ich.id && !a.zusammengefuehrtAus && !meta?.zusammenfuehrung)
}

/** Lokal zusammenführen und für den Abgleich vormerken. Liefert das zusammengeführte WEP. */
export async function merkeZusammenfuehrung(lokal: LokalSpeicher, bauId: string, gruenId: string, felder: readonly (keyof Formalien)[], jetzt: string): Promise<Wep> {
  const weps = await lokal.alleWeps()
  const bau = weps.find((w) => w.id === bauId)
  const gruen = weps.find((w) => w.id === gruenId)
  if (!bau || !gruen) throw new Error('Eines der beiden WEPs ist auf diesem Gerät nicht vorhanden.')
  const neu = fuehreZusammen(bau, gruen, felder, jetzt)
  await lokal.speichereWep(neu, jetzt)
  const metas = await lokal.alleMeta()
  const bm = metas.find((m) => m.id === bauId)
  const gm = metas.find((m) => m.id === gruenId)
  await lokal.setzeMeta(metaMit(bm, bauId, jetzt, { zusammenfuehrung: { aus: gruenId, felder: [...felder], am: jetzt, vorher: bau } }))
  await lokal.setzeMeta(metaMit(gm, gruenId, jetzt, { zusammengefuehrtIn: bauId }))
  return neu
}

/** Lokal vorgemerktes Zusammenführen zurücknehmen (der Server hat es noch nicht). */
export async function nimmLokalZurueck(lokal: LokalSpeicher, bauId: string, jetzt: string): Promise<boolean> {
  const metas = await lokal.alleMeta()
  const bm = metas.find((m) => m.id === bauId)
  const z = bm?.zusammenfuehrung
  if (!z) return false
  await lokal.speichereWep(z.vorher, jetzt)
  const nach = (await lokal.alleMeta()).find((m) => m.id === bauId)
  await lokal.setzeMeta(metaMit(nach, bauId, jetzt, { zusammenfuehrung: undefined }))
  const gm = metas.find((m) => m.id === z.aus)
  if (gm) await lokal.setzeMeta(metaMit(gm, z.aus, jetzt, { zusammengefuehrtIn: undefined }))
  return true
}

const ich = (): RechteKonto => {
  const k = gemerktesKonto()
  return { id: k?.id ?? '', rollen: k?.status === 'freigegeben' ? k.rollen : [] }
}

/** Eigene offene WEPs dieses Geräts (für die Auswahl beim Zusammenführen). */
export async function ladeEigeneOffeneWeps(): Promise<Wep[]> {
  const [weps, metas] = await Promise.all([syncSpeicher.alleWeps(), syncSpeicher.alleMeta()])
  return eigeneOffeneWeps(weps, metas, ich())
}

/** Meta eines WEP (z. B. ob ein Zusammenführen vorgemerkt ist). */
export async function ladeMeta(id: string): Promise<SyncMeta | undefined> {
  return (await syncSpeicher.alleMeta()).find((m) => m.id === id)
}

/** Zusammenführen in der App: lokal rechnen, Fotos auf diesem Gerät mitnehmen, wenn Netz da ist gleich abgleichen. */
export async function zusammenfuehrenInApp(bauId: string, gruenId: string, felder: readonly (keyof Formalien)[]): Promise<{ offline: boolean; fehler?: string }> {
  await merkeZusammenfuehrung(syncSpeicher, bauId, gruenId, felder, new Date().toISOString())
  // Fotodateien des eigenen WEP gehören jetzt zum Bau-WEP (der Server kopiert sie auch; was fehlt, lädt die App hoch)
  await kopiereFotosLokal(gruenId, bauId)
  if (!navigator.onLine) return { offline: true }
  try {
    let erg = await jetztMitServerAbgleichen()
    // Lief schon ein Abgleich, der vor dem Zusammenführen begann: noch einmal, damit der Server es jetzt bekommt
    if ((await ladeMeta(bauId))?.zusammenfuehrung) erg = await jetztMitServerAbgleichen()
    const f = erg.fehler.find((x) => x.wepId === bauId)
    return { offline: false, ...(f ? { fehler: f.text } : {}) }
  } catch {
    return { offline: true }
  }
}

/**
 * Zusammenführen zurücknehmen. Noch nicht beim Server: nur hier. Sonst über den Server (nur mit Netz), danach abgleichen –
 * das eigene WEP kommt dann wieder auf dieses Gerät.
 */
export async function zuruecknehmenInApp(bauId: string): Promise<{ ok: true } | { ok: false; meldung: string }> {
  if (await nimmLokalZurueck(syncSpeicher, bauId, new Date().toISOString())) return { ok: true }
  if (!navigator.onLine) return { ok: false, meldung: 'Ohne Netz geht das nicht: Das Zusammenführen ist schon beim Server.' }
  try {
    await jetztMitServerAbgleichen()
  } catch (e) {
    return { ok: false, meldung: `Abgleich nicht möglich: ${e instanceof Error ? e.message : String(e)}` }
  }
  const m = await ladeMeta(bauId)
  if (!m || m.serverRev === undefined) return { ok: false, meldung: 'Das WEP ist noch nicht beim Server.' }
  const r = await fetch(`/api/v2/weps/${encodeURIComponent(bauId)}/zusammenfuehren-zuruecknehmen`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ basisRev: m.serverRev }),
  })
  if (!r.ok) {
    const d = (await r.json().catch(() => ({}))) as { fehler?: string }
    return { ok: false, meldung: d.fehler ?? `Server antwortet mit ${r.status}` }
  }
  // Der Abgleich holt den Stand des Servers (neue Revision) und das eigene WEP zurück auf dieses Gerät
  await jetztMitServerAbgleichen().catch(() => undefined)
  return { ok: true }
}
