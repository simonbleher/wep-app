// Server-Modus (v2): Abgleich der App mit dem Server – HTTP-Zugriff auf /api/v2/weps, danach Fotos und Bau-Excel,
// Papierkorb-Aufräumen wie in v1, nie zwei Abgleiche gleichzeitig. Die Regeln stehen in ./abgleich.ts.
import type { Wep } from '@/model'
import { fotoUploadErlaubt } from '@/fotos/netz'
import { raeumePapierkorbAuf } from '@/sync/aktionen'
import { offeneBauExcel } from '@/sync/bauExcel'
import { offeneFotos } from '@/sync/fotos'
import { bauSpeicher, fotoSpeicher, syncSpeicher } from '@/sync/speicher'
import type { SyncErgebnis } from '@/sync/types'
import { AbgleichFehler, serverAbgleich, wartendeServerAenderungen, type ServerKopf, type ServerStand, type ServerZugriff } from './abgleich'
import { serverDateienAbgleichen } from './dateiAbgleich'
import { httpDateien } from './dateiDienst'

async function rufe<T>(pfad: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(pfad, {
    ...init,
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
  })
  const daten = (await r.json().catch(() => ({}))) as T & { fehler?: string; stand?: ServerStand }
  if (!r.ok) throw new AbgleichFehler(daten.fehler ?? `Server antwortet mit ${r.status}`, r.status, daten.stand)
  return daten
}

const pfad = (id: string) => `/api/v2/weps/${encodeURIComponent(id)}`

export const httpZugriff: ServerZugriff = {
  liste: async () => (await rufe<{ weps: ServerKopf[] }>('/api/v2/weps')).weps,
  lade: (id) => rufe<ServerStand>(pfad(id)),
  speichere: async (wep: Wep, basisRev: number) => (await rufe<{ kopf: ServerKopf }>(pfad(wep.id), { method: 'PUT', body: JSON.stringify({ wep, basisRev }) })).kopf,
  loesche: async (id, basisRev) => (await rufe<{ kopf: ServerKopf }>(pfad(id), { method: 'DELETE', body: JSON.stringify({ basisRev }) })).kopf,
  stelleWiederHer: async (id) => (await rufe<{ kopf: ServerKopf }>(`${pfad(id)}/wiederherstellen`, { method: 'POST' })).kopf,
  fuehreZusammen: async (wep, basisRev, aus, felder) =>
    (await rufe<{ kopf: ServerKopf }>(`${pfad(wep.id)}/zusammenfuehren`, { method: 'POST', body: JSON.stringify({ wep, basisRev, aus, felder }) })).kopf,
}

let laufend: Promise<SyncErgebnis> | undefined

/** Gleicht jetzt mit dem Server ab; läuft schon ein Abgleich, kommt dessen Ergebnis. */
export function jetztMitServerAbgleichen(): Promise<SyncErgebnis> {
  if (!laufend) {
    laufend = (async () => {
      if (!navigator.onLine) throw new Error('Keine Internetverbindung – Änderungen warten.')
      await raeumePapierkorbAuf()
      const erg = await serverAbgleich({ server: httpZugriff, lokal: syncSpeicher })
      // Fotos und Bau-Excel nach den WEPs: hochgeladen wird erst, wenn das WEP auf dem Server ist
      try {
        const d = await serverDateienAbgleichen({ server: httpDateien, lokal: syncSpeicher, fotos: fotoSpeicher, bau: bauSpeicher, uploadErlaubt: fotoUploadErlaubt })
        erg.fehler.push(...d.fehler)
      } catch (e) {
        erg.fehler.push({ wepId: 'Dateien', text: e instanceof Error ? e.message : String(e) })
      }
      return erg
    })().finally(() => {
      laufend = undefined
    })
  }
  return laufend
}

/** Änderungen, die noch auf den Server warten: WEPs, Löschungen, Fotos und Bau-Excel. */
export async function wartendeAenderungenServer(): Promise<number> {
  const [weps, korb, metas, fotos, bau] = await Promise.all([syncSpeicher.alleWeps(), syncSpeicher.alleImPapierkorb(), syncSpeicher.alleMeta(), fotoSpeicher.alleRecords(), bauSpeicher.alleRecords()])
  const aktiv = new Set(weps.map((w) => w.id))
  return (
    wartendeServerAenderungen(
      weps,
      korb.map((e) => e.id),
      metas,
    ) +
    offeneFotos(fotos, aktiv) +
    offeneBauExcel(bau, aktiv)
  )
}
