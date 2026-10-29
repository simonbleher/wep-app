// Android- und Windows-App im Server-Modus (Paket 8): Die WEPs aus der Zeit vor dem Server liegen weiter in der
// v1-Datenbank (`wep-db`) auf dem Gerät. Sie werden nicht automatisch übernommen (das ist Paket 7). Hier lassen sie
// sich nur lesen – als Quelle für eine Sicherung, die man danach unter Profil → Sicherung einspielt.
import { openDB, type IDBPDatabase } from 'idb'
import type { Wep } from '@/model'
import type { PapierkorbEintrag, SyncMeta } from '@/sync/types'
import type { BauExcelRecord } from '@/bauexcel/types'
import { lokaleEigene } from '@/katalog'
import { lokalesProfil } from '@/profil'
import type { SicherungsQuelle } from './types'

/** Gibt es die Datenbank? (Ohne Prüfung würde `openDB` eine leere anlegen.) */
async function gibtEs(name: string, idb: IDBFactory): Promise<boolean> {
  if (typeof idb.databases !== 'function') return true
  return (await idb.databases()).some((d) => d.name === name)
}

const hat = (db: IDBPDatabase, store: string) => db.objectStoreNames.contains(store)

/** Öffnet die v1-Datenbank nur zum Lesen (ohne Upgrade); undefined, wenn es sie nicht gibt. */
async function oeffne(name: string, idb: IDBFactory): Promise<IDBPDatabase | undefined> {
  if (!(await gibtEs(name, idb))) return undefined
  const db = await openDB(name)
  if (!hat(db, 'weps')) {
    db.close()
    return undefined
  }
  return db
}

/** Wie viele WEPs liegen noch in der v1-Datenbank? 0 auch, wenn es sie nicht gibt oder sie nicht lesbar ist. */
export async function zaehleAltbestand(name: string, idb: IDBFactory = indexedDB): Promise<number> {
  try {
    const db = await oeffne(name, idb)
    if (!db) return 0
    const n = await db.count('weps')
    db.close()
    return n
  } catch {
    return 0
  }
}

/**
 * Quelle für `erstelleSicherung` aus der v1-Datenbank. Eigene Positionen und Profil liegen im localStorage und gelten
 * für beide Modi gleich.
 */
export async function altbestandQuelle(name: string, idb: IDBFactory = indexedDB): Promise<SicherungsQuelle | undefined> {
  const db = await oeffne(name, idb)
  if (!db) return undefined
  const alle = async <T,>(store: string): Promise<T[]> => (hat(db, store) ? ((await db.getAll(store)) as T[]) : [])
  return {
    async weps() {
      const [weps, meta] = await Promise.all([alle<Wep>('weps'), alle<SyncMeta>('syncMeta')])
      const geaendert = new Map(meta.map((m) => [m.id, m.lokalGeaendertAm]))
      return weps.map((wep) => ({ wep, geaendertAm: geaendert.get(wep.id) }))
    },
    papierkorb: () => alle<PapierkorbEintrag>('papierkorb'),
    eigenePositionen: async () => lokaleEigene.lade().eintraege,
    async profil() {
      const s = lokalesProfil.lade()
      return { profil: s.profil, geaendertAm: s.geaendertAm }
    },
    async fotoDatei(wepId, foto) {
      if (!hat(db, 'fotoDaten')) return undefined
      return ((await db.get('fotoDaten', `${wepId}/${foto.id}`)) as { blob?: Blob } | undefined)?.blob
    },
    async bauExcelDatei(wep) {
      const r = (await alle<BauExcelRecord>('bauExcel')).find((x) => x.wepId === wep.id)
      if (!r?.hatDatei || r.version !== wep.bauExcel?.version || !hat(db, 'bauExcelDaten')) return undefined
      return ((await db.get('bauExcelDaten', wep.id)) as { blob?: Blob } | undefined)?.blob
    },
  }
}
