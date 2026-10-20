// Abgleich-Logik zwischen lokalem Speicher und OneDrive-App-Ordner.
//
// Reine Logik ohne Browser-APIs – dadurch mit gemocktem Graph-Client testbar.
//
// Regeln (Beta, ein Nutzer mit mehreren Geräten):
// - Eine Datei pro WEP: <Vorgangs-Nr>.json (im Client-Ordner, in der App: daten/)
// - Nur lokal geändert  → hochladen
// - Nur in OneDrive geändert → herunterladen
// - Beides geändert (Konflikt) → neuere Änderung (geaendertAm) gewinnt, die
//   ältere Fassung bleibt als <Vorgangs-Nr>.konflikt-<Zeit>.json in OneDrive
//   erhalten, und es gibt einen Hinweis.
// - Die „Offline-Warteschlange“ ergibt sich aus den Metadaten in IndexedDB:
//   Jedes WEP mit lokalGeaendertAm > letzterSyncAm wartet auf den Upload und
//   wird beim nächsten Abgleich (z. B. sobald wieder Netz da ist) hochgeladen.
// - Löschen wird in der Beta nicht synchronisiert: Ein lokal gelöschtes WEP
//   bleibt in OneDrive, wird auf diesem Gerät aber nicht wieder geladen.
import type { Wep } from '@/model'
import { PROFIL_DATEI } from './ordner'
import type {
  GraphClient,
  LokalSpeicher,
  RemoteDatei,
  SyncDatei,
  SyncErgebnis,
  SyncMeta,
} from './types'

export const KONFLIKT_MARKE = '.konflikt-'

export function dateiName(wepId: string): string {
  return `${wepId}.json`
}

/** Liefert die WEP-id zu einem Dateinamen oder null für fremde/Konflikt-/Profil-Dateien. */
export function wepIdAusName(name: string): string | null {
  if (!name.endsWith('.json') || name.includes(KONFLIKT_MARKE) || name === PROFIL_DATEI) {
    return null
  }
  return name.slice(0, -'.json'.length)
}

export function konfliktName(wepId: string, zeit: string): string {
  return `${wepId}${KONFLIKT_MARKE}${zeit.replace(/[:.]/g, '-')}.json`
}

export function verpacke(wep: Wep, geaendertAm: string, geraet: string): string {
  const datei: SyncDatei = { format: 'wep-sync/1', geaendertAm, geraet, wep }
  return JSON.stringify(datei, null, 2)
}

export function entpacke(inhalt: string): SyncDatei {
  const daten = JSON.parse(inhalt) as Partial<SyncDatei>
  if (daten.format !== 'wep-sync/1' || !daten.wep || !daten.geaendertAm) {
    throw new Error('Unbekanntes Dateiformat')
  }
  return daten as SyncDatei
}

/** Hat das WEP lokale Änderungen, die noch nicht in OneDrive sind? */
export function wartetAufUpload(meta: SyncMeta | undefined): boolean {
  if (!meta) return true
  return !meta.letzterSyncAm || meta.lokalGeaendertAm > meta.letzterSyncAm
}

export interface SyncOptionen {
  client: GraphClient
  lokal: LokalSpeicher
  geraet: string
  /** Für Tests überschreibbar. */
  jetzt?: () => string
}

export async function synchronisiere(opt: SyncOptionen): Promise<SyncErgebnis> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const ergebnis: SyncErgebnis = {
    hochgeladen: [],
    heruntergeladen: [],
    konflikte: [],
    fehler: [],
  }

  const [remoteListe, weps, metas] = await Promise.all([
    opt.client.liste(),
    opt.lokal.alleWeps(),
    opt.lokal.alleMeta(),
  ])

  const remote = new Map<string, RemoteDatei>()
  for (const d of remoteListe) {
    const id = wepIdAusName(d.name)
    if (id) remote.set(id, d)
  }
  const lokal = new Map(weps.map((w) => [w.id, w]))
  const meta = new Map(metas.map((m) => [m.id, m]))
  const ids = new Set([...remote.keys(), ...lokal.keys()])

  for (const id of [...ids].sort()) {
    try {
      const r = remote.get(id)
      const w = lokal.get(id)
      const m = meta.get(id)

      if (w && !r) {
        await hochladen(opt, w, m, ergebnis, jetzt)
        continue
      }
      if (!w && r) {
        if (m?.geloescht) continue // auf diesem Gerät bewusst gelöscht
        await herunterladen(opt, id, r, ergebnis, jetzt)
        continue
      }
      if (!w || !r) continue

      const lokalGeaendert = wartetAufUpload(m)
      const remoteGeaendert = !m?.remoteETag || m.remoteETag !== r.eTag

      if (!lokalGeaendert && !remoteGeaendert) continue
      if (lokalGeaendert && !remoteGeaendert) {
        await hochladen(opt, w, m, ergebnis, jetzt)
        continue
      }
      if (!lokalGeaendert && remoteGeaendert) {
        await herunterladen(opt, id, r, ergebnis, jetzt)
        continue
      }

      // Beide Seiten geändert → Konflikt
      const fremd = entpacke(await opt.client.lade(r.name))
      const lokalZeit = m?.lokalGeaendertAm ?? jetzt()
      if (JSON.stringify(fremd.wep) === JSON.stringify(w)) {
        // Inhaltlich gleich (z. B. erster Abgleich eines schon vorhandenen WEP)
        await opt.lokal.setzeMeta({
          id,
          lokalGeaendertAm: lokalZeit,
          letzterSyncAm: jetzt(),
          remoteETag: r.eTag,
        })
        continue
      }
      if (lokalZeit >= fremd.geaendertAm) {
        // Lokal ist neuer: OneDrive-Fassung sichern, dann lokale hochladen
        await opt.client.schreibe(
          konfliktName(id, fremd.geaendertAm),
          verpacke(fremd.wep, fremd.geaendertAm, fremd.geraet),
        )
        await hochladen(opt, w, m, ergebnis, jetzt)
        ergebnis.konflikte.push({
          wepId: id,
          text: `WEP ${id} wurde auf zwei Geräten geändert. Die Fassung von diesem Gerät ist neuer und wurde übernommen; die ältere liegt als Konflikt-Kopie in OneDrive.`,
        })
      } else {
        // OneDrive ist neuer: lokale Fassung als Kopie sichern, dann übernehmen
        await opt.client.schreibe(
          konfliktName(id, lokalZeit),
          verpacke(w, lokalZeit, opt.geraet),
        )
        await uebernehme(opt, id, fremd, r, ergebnis, jetzt)
        ergebnis.konflikte.push({
          wepId: id,
          text: `WEP ${id} wurde auf zwei Geräten geändert. Die Fassung aus OneDrive (${fremd.geraet}) ist neuer und wurde übernommen; die Fassung von diesem Gerät liegt als Konflikt-Kopie in OneDrive.`,
        })
      }
    } catch (e) {
      ergebnis.fehler.push({
        wepId: id,
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return ergebnis
}

async function hochladen(
  opt: SyncOptionen,
  wep: Wep,
  m: SyncMeta | undefined,
  ergebnis: SyncErgebnis,
  jetzt: () => string,
): Promise<void> {
  const geaendertAm = m?.lokalGeaendertAm ?? jetzt()
  const datei = await opt.client.schreibe(
    dateiName(wep.id),
    verpacke(wep, geaendertAm, opt.geraet),
  )
  await opt.lokal.setzeMeta({
    id: wep.id,
    lokalGeaendertAm: geaendertAm,
    letzterSyncAm: jetzt(),
    remoteETag: datei.eTag,
  })
  ergebnis.hochgeladen.push(wep.id)
}

async function herunterladen(
  opt: SyncOptionen,
  id: string,
  r: RemoteDatei,
  ergebnis: SyncErgebnis,
  jetzt: () => string,
): Promise<void> {
  const datei = entpacke(await opt.client.lade(r.name))
  await uebernehme(opt, id, datei, r, ergebnis, jetzt)
}

async function uebernehme(
  opt: SyncOptionen,
  id: string,
  datei: SyncDatei,
  r: RemoteDatei,
  ergebnis: SyncErgebnis,
  jetzt: () => string,
): Promise<void> {
  await opt.lokal.speichereAusSync(datei.wep, {
    id,
    lokalGeaendertAm: datei.geaendertAm,
    letzterSyncAm: jetzt(),
    remoteETag: r.eTag,
  })
  ergebnis.heruntergeladen.push(id)
}
