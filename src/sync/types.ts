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
  /** Nur in daten/papierkorb/: wann das WEP gelöscht wurde (ISO). */
  geloeschtAm?: string
  /** Nur in daten/papierkorb/: Gerät, das gelöscht hat (nur zur Info). */
  geloeschtVon?: string
}

/** Ein gelöschtes WEP im lokalen Papierkorb (IndexedDB-Store „papierkorb“). */
export interface PapierkorbEintrag {
  /** WEP-id (= Vorgangs-Nr.) */
  id: string
  wep: Wep
  /** Löschzeitpunkt (ISO); nach 30 Tagen wird endgültig gelöscht. */
  geloeschtAm: string
  geloeschtVon?: string
}

/**
 * Ein offener Konflikt an einem WEP. Bis zur Entscheidung bleibt das WEP erhalten
 * (bei „zwei-geraete“ gilt die neuere Fassung, die andere liegt in `fassung` und als
 * Konflikt-Kopie in OneDrive).
 */
export interface KonfliktInfo {
  /**
   * zwei-geraete: auf zwei Geräten geändert.
   * geloescht-geaendert: auf einem Gerät gelöscht, auf einem anderen danach noch geändert.
   */
  art: 'zwei-geraete' | 'geloescht-geaendert'
  erkanntAm: string
  /** Das andere beteiligte Gerät (Kennung). */
  geraet: string
  /** Nur geloescht-geaendert: Wurde auf diesem Gerät („hier“) oder auf dem anderen gelöscht? */
  geloeschtWo?: 'hier' | 'anderes-geraet'
  /** Nur zwei-geraete: die nicht übernommene Fassung. */
  fassung?: Wep
  /** Nur zwei-geraete: wann die andere Fassung zuletzt geändert wurde (ISO). */
  fassungGeaendertAm?: string
  /** Namen der Konflikt-Kopien in OneDrive (daten/), die nach der Entscheidung entfernt werden. */
  kopien: string[]
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
  /** Im Papierkorb dieses Geräts (das WEP selbst liegt dann im Store „papierkorb“). */
  geloescht?: boolean
  /** Löschzeitpunkt (ISO), solange `geloescht` gilt. */
  geloeschtAm?: string
  /** eTag der Datei in daten/papierkorb/ beim letzten Abgleich; fehlt = Löschung noch nicht in OneDrive. */
  papierkorbETag?: string
  /** Endgültig gelöscht: nur noch Marke, damit der Abgleich die Dateien in OneDrive entfernt. */
  endgueltig?: boolean
  /** Hier aus dem Papierkorb geholt; die Papierkorb-Datei in OneDrive wird beim Abgleich zurückgeholt. */
  wiederhergestellt?: boolean
  /** Offener Konflikt (siehe KonfliktInfo). */
  konflikt?: KonfliktInfo
  /** Konflikt-Kopien in daten/, die beim nächsten Abgleich gelöscht werden. */
  aufraeumen?: string[]
}

/** Eine Datei im OneDrive-App-Ordner. */
export interface RemoteDatei {
  name: string
  eTag: string
  geaendertAm: string
}

/**
 * Zugriff auf einen Ordner im OneDrive-App-Ordner (in Tests durch einen Mock ersetzt).
 * Dateinamen sind relativ zum Ordner des Clients; der Wurzel-Client (Ordner '') sieht
 * den App-Ordner selbst.
 */
export interface GraphClient {
  /** Dateien (keine Unterordner) des Ordners; ein fehlender Ordner ergibt eine leere Liste. */
  liste(): Promise<RemoteDatei[]>
  lade(name: string): Promise<string>
  /** Legt die Datei an oder ersetzt sie; fehlende Ordner entstehen dabei. */
  schreibe(name: string, inhalt: string | Blob, typ?: string): Promise<RemoteDatei>
  /**
   * Verschiebt eine Datei in einen Ordner des App-Ordners (`zielOrdner` ist immer relativ zum
   * App-Ordner, z. B. 'daten' oder 'daten/papierkorb').
   * Ist dort schon eine gleichnamige Datei, bleibt alles unverändert: 'vorhanden'.
   */
  verschiebe(name: string, zielOrdner: string): Promise<'verschoben' | 'vorhanden'>
  /** Löscht die Datei; ist sie schon weg, passiert nichts (idempotent). */
  loesche(name: string): Promise<void>
}

/** Lokaler Speicher, den die Sync-Logik braucht (in der App: IndexedDB). */
export interface LokalSpeicher {
  alleWeps(): Promise<Wep[]>
  alleMeta(): Promise<SyncMeta[]>
  setzeMeta(meta: SyncMeta): Promise<void>
  alleImPapierkorb(): Promise<PapierkorbEintrag[]>
  /**
   * Schreibt zusammengehörige Änderungen in einem Schritt. Je Feld: Wert = setzen,
   * `null` = entfernen, fehlt = unverändert.
   */
  schreibe(a: LokaleAenderung): Promise<void>
  /**
   * Verschiebt ein aktives WEP in den Papierkorb (atomar, damit keine zwischenzeitliche
   * Speicherung verloren geht) und setzt die Metadaten. Liefert den Eintrag oder undefined,
   * wenn es das WEP nicht (mehr) gibt.
   */
  legeInPapierkorb(id: string, geloeschtAm: string, geloeschtVon: string): Promise<PapierkorbEintrag | undefined>
  /** Speichert eine Änderung der App – außer das WEP liegt im Papierkorb (dann false). */
  speichereWep(wep: Wep, jetzt: string): Promise<boolean>
}

export interface LokaleAenderung {
  id: string
  wep?: Wep | null
  papierkorb?: PapierkorbEintrag | null
  meta?: SyncMeta | null
  /**
   * Wirkt auf die Android-Upload-Warteschlange: geaendert = einreihen, wiederhergestellt =
   * Löschsperre aufheben und einreihen, geloescht = Eintrag entfernen und sperren.
   */
  ereignis?: 'geaendert' | 'wiederhergestellt' | 'geloescht'
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
  /** Auf einem anderen Gerät gelöscht: hier in den Papierkorb gelegt. */
  geloescht: string[]
  /** Auf einem anderen Gerät wiederhergestellt: hier wieder da. */
  wiederhergestellt: string[]
  /** Endgültig entfernt (Papierkorb abgelaufen oder anderswo endgültig gelöscht). */
  bereinigt: string[]
}
