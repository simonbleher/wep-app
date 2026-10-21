// Brücke zum eigenen nativen Android-Plugin „WepNative“ (Kotlin, siehe
// android/app/src/main/java/de/wep/app/). Nur in der Android-App vorhanden.
//
// Das Plugin erledigt, was die WebView nicht kann oder nicht soll:
// - Token-Anfragen an Microsoft ohne Origin-Header (Cross-Origin wird für Nicht-SPA-
//   Registrierungen abgelehnt)
// - Anmeldedaten verschlüsselt speichern (EncryptedSharedPreferences), damit auch der
//   Hintergrunddienst sie lesen kann
// - Upload-Warteschlange (Dateien im App-Speicher) und der WorkManager-Worker
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/** Anmeldedaten, wie sie verschlüsselt auf dem Gerät liegen. */
export interface Anmeldung {
  clientId: string
  refreshToken: string
  accessToken: string
  /** Ablaufzeit des Zugriffstokens (ms seit 1970). */
  ablauf: number
  name: string
  benutzername: string
}

/** Ein Eintrag der Upload-Warteschlange. */
export interface WarteschlangenEintrag {
  /** Dateiname im OneDrive-Ordner daten/, z. B. „2026-001.json“. */
  name: string
  /** Letzter bekannter eTag der Datei in OneDrive (leer = noch nie hochgeladen). */
  eTag?: string
  /** lokalGeaendertAm der eingereihten Fassung (ISO). */
  geaendertAm: string
  eingereihtAm: string
  /** Hochladen scheiterte mit 412/409: liegt, bis die App den Konflikt geklärt hat. */
  blockiert: boolean
  groesse: number
}

/** Ergebnis eines erfolgreichen Hintergrund-Uploads (wird beim App-Start übernommen). */
export interface UploadErgebnis {
  name: string
  eTag: string
  /** lokalGeaendertAm der hochgeladenen Fassung (ISO). */
  geaendertAm: string
  /** Zeitpunkt des Uploads (ISO). */
  zeit: string
}

/** Ein Foto in der Upload-Warteschlange des Hintergrunddienstes. */
export interface FotoWarteschlangenEintrag {
  wepId: string
  fotoId: string
  eingereihtAm: string
  groesse: number
}

/** Ergebnis eines erfolgreichen Foto-Uploads im Hintergrund. */
export interface FotoUploadErgebnis {
  wepId: string
  fotoId: string
  /** Zeitpunkt des Uploads (ISO). */
  zeit: string
}

export interface ProtokollEintrag {
  zeit: string
  art: 'lauf' | 'upload' | 'fehler' | 'info'
  text: string
}

export interface NetzInfo {
  typ: 'WLAN' | 'Mobilfunk' | 'Ethernet' | 'Sonstiges' | 'keins'
  /** Unbegrenztes („nicht getaktetes“) Netz – das, was WorkManager als UNMETERED prüft. */
  unmetered: boolean
}

export interface WepNativePlugin {
  tokenAnfrage(a: { url: string; formular: Record<string, string> }): Promise<{ status: number; text: string }>
  speichereAnmeldung(a: Anmeldung): Promise<void>
  leseAnmeldung(): Promise<Partial<Anmeldung>>
  loescheAnmeldung(): Promise<void>

  /**
   * Reiht eine WEP-Datei ein. Ist ihr Name als gelöscht gesperrt (`markiereGeloescht`), wird sie
   * ignoriert, außer die App hebt die Sperre ausdrücklich auf (`sperreAufheben`: das WEP lebt).
   */
  reiheEin(a: { name: string; inhalt: string; eTag?: string; geaendertAm: string; sperreAufheben?: boolean }): Promise<void>
  entferne(a: { name: string }): Promise<void>
  /**
   * Das WEP wurde gelöscht: Eintrag entfernen und diesen Dateinamen für Uploads sperren, auch
   * für den Hintergrunddienst bei geschlossener App. Ein gerade laufender Upload wird danach
   * sofort wieder aus daten/ nach daten/papierkorb/ verschoben.
   */
  markiereGeloescht(a: { name: string; geloeschtAm: string }): Promise<void>
  liste(): Promise<{ eintraege: WarteschlangenEintrag[] }>
  /**
   * Reiht ein Foto (JPEG als Base64) für den Upload nach daten/fotos/<wepId>/<fotoId>.jpg ein.
   * Ist das WEP für Foto-Uploads gesperrt (`sperreFotos`), wird es ignoriert.
   */
  reiheFotoEin(a: { wepId: string; fotoId: string; base64: string }): Promise<void>
  entferneFoto(a: { wepId: string; fotoId: string }): Promise<void>
  /**
   * Sperrt (gesperrt: true) bzw. gibt frei (false) Foto-Uploads eines WEP. Gesperrt, wenn das WEP im
   * Papierkorb liegt: Einträge werden entfernt und nie hochgeladen; ein gerade laufender Upload wird
   * sofort nach daten/papierkorb/fotos/ verschoben.
   */
  sperreFotos(a: { wepId: string; gesperrt: boolean }): Promise<void>
  listeFotos(): Promise<{ eintraege: FotoWarteschlangenEintrag[] }>
  /** Liefert die Foto-Upload-Ergebnisse seit dem letzten Aufruf. */
  holeFotoErgebnisse(): Promise<{ ergebnisse: FotoUploadErgebnis[] }>
  /** Liefert die Upload-Ergebnisse seit dem letzten Aufruf und leert die Ergebnisdatei. */
  holeErgebnisse(): Promise<{ ergebnisse: UploadErgebnis[] }>
  holeProtokoll(): Promise<{ eintraege: ProtokollEintrag[] }>

  /** Merkt „nur WLAN“ und plant den Worker neu (Bedingung UNMETERED bzw. CONNECTED). */
  planeUpload(a: { nurWlan: boolean }): Promise<void>
  jetztVersuchen(): Promise<void>
  netzTyp(): Promise<NetzInfo>

  /** „Speichern unter…“: Datei in Stücken (Base64) übergeben, dann den System-Dialog öffnen. */
  dateiBeginnen(): Promise<void>
  dateiAnhaengen(a: { daten: string }): Promise<void>
  dateiSpeichern(a: { name: string; typ: string }): Promise<{ gespeichert: boolean }>

  /** Nummer des nativen Teils (android/native-version.txt) und versionCode der installierten APK. */
  nativeVersion(): Promise<{ nativeVersion: number; versionCode: number }>
  /**
   * Lädt die APK in den App-Cache (nur https, nur das eigene APK-Projekt) und prüft die SHA-256.
   * Fortschritt über das Ereignis `apkFortschritt`. Fehlercodes: KEIN_NETZ, PRUEFSUMME.
   */
  ladeApk(a: { url: string; sha256?: string }): Promise<{ groesse: number }>
  /**
   * Öffnet den Android-Installer für die geladene APK. Fehlt die Erlaubnis „Apps installieren“,
   * öffnet das Plugin die Einstellung und weist mit dem Code ERLAUBNIS ab.
   */
  installiereApk(): Promise<void>
  addListener(
    eventName: 'apkFortschritt',
    fn: (f: { geladen: number; gesamt: number }) => void,
  ): Promise<PluginListenerHandle>
}

export const WepNative = registerPlugin<WepNativePlugin>('WepNative')
