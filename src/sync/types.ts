// Gemeinsame Typen der OneDrive-Synchronisation (Beta: ein Nutzer, mehrere Geräte).
import type { Wep } from '@/model'

/** Format der JSON-Datei, die pro WEP im OneDrive-App-Ordner liegt. */
export interface SyncDatei {
  format: 'wep-sync/1'
  /** Zeitpunkt der letzten inhaltlichen Änderung (ISO), entscheidet bei Konflikten. */
  geaendertAm: string
  /** Kennung des Geräts, das zuletzt geschrieben hat (nur zur Info). */
  geraet: string
  wep: Wep
}

/** Synchronisations-Zustand eines WEP auf diesem Gerät (liegt in IndexedDB). */
export interface SyncMeta {
  /** WEP-id (= Vorgangs-Nr.) */
  id: string
  /** Wann das WEP auf diesem Gerät zuletzt geändert wurde (ISO). */
  lokalGeaendertAm: string
  /** Wann es zuletzt erfolgreich abgeglichen wurde (ISO). Fehlt = noch nie. */
  letzterSyncAm?: string
  /** eTag der Datei in OneDrive beim letzten Abgleich. */
  remoteETag?: string
  /** Auf diesem Gerät gelöscht: nicht wieder aus OneDrive herunterladen. */
  geloescht?: boolean
}

/** Eine Datei im OneDrive-App-Ordner. */
export interface RemoteDatei {
  name: string
  eTag: string
  geaendertAm: string
}

/** Zugriff auf den OneDrive-App-Ordner (in Tests durch einen Mock ersetzt). */
export interface GraphClient {
  liste(): Promise<RemoteDatei[]>
  lade(name: string): Promise<string>
  schreibe(name: string, inhalt: string): Promise<RemoteDatei>
}

/** Lokaler Speicher, den die Sync-Logik braucht (in der App: IndexedDB). */
export interface LokalSpeicher {
  alleWeps(): Promise<Wep[]>
  alleMeta(): Promise<SyncMeta[]>
  /** Speichert ein WEP, das aus OneDrive kommt (ändert lokalGeaendertAm nicht neu). */
  speichereAusSync(wep: Wep, meta: SyncMeta): Promise<void>
  setzeMeta(meta: SyncMeta): Promise<void>
}

export interface SyncHinweis {
  wepId: string
  text: string
}

export interface SyncErgebnis {
  hochgeladen: string[]
  heruntergeladen: string[]
  konflikte: SyncHinweis[]
  fehler: SyncHinweis[]
}
