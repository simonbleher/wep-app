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

  reiheEin(a: { name: string; inhalt: string; eTag?: string; geaendertAm: string }): Promise<void>
  entferne(a: { name: string }): Promise<void>
  liste(): Promise<{ eintraege: WarteschlangenEintrag[] }>
  /** Liefert die Upload-Ergebnisse seit dem letzten Aufruf und leert die Ergebnisdatei. */
  holeErgebnisse(): Promise<{ ergebnisse: UploadErgebnis[] }>
  holeProtokoll(): Promise<{ eintraege: ProtokollEintrag[] }>

  /** Merkt „nur WLAN“ und plant den Worker neu (Bedingung UNMETERED bzw. CONNECTED). */
  planeUpload(a: { nurWlan: boolean }): Promise<void>
  jetztVersuchen(): Promise<void>
  netzTyp(): Promise<NetzInfo>

  /** Nummer des nativen Teils (android/native-version.txt) und versionCode der installierten APK. */
  nativeVersion(): Promise<{ nativeVersion: number; versionCode: number }>
  /**
   * Lädt die APK in den App-Cache (nur https, nur *.pages.dev) und prüft die SHA-256.
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
