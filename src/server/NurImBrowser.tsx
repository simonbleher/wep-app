// Android- und Windows-App mit dem Web-Paket von v2, aber einer Hülle ohne Server-Anmeldung (src/server/modus.ts):
// Die App arbeitet weiter wie v1 (Daten auf dem Gerät, OneDrive). Konten und Abgabe an Grün und BV gibt es mit der
// neuen App-Version (Paket 8) oder im Browser.
import { Capacitor } from '@capacitor/core'

export const BROWSER_ADRESSE = 'https://wep-pankow.pages.dev'
/** Neueste App-Version zum Herunterladen (docs/ANDROID.md, docs/WINDOWS.md). */
export const APK_ADRESSE = 'https://wep-pankow-apk.pages.dev/wep.apk'
export const EXE_ADRESSE = 'https://wep-pankow-apk.pages.dev/windows/wep-setup.exe'

export function NurImBrowser() {
  const android = Capacitor.isNativePlatform()
  return (
    <div className="app-hinweis-band" role="note">
      Für Konten und Abgabe an Grün und BV bitte die App aktualisieren:{' '}
      <a href={android ? APK_ADRESSE : EXE_ADRESSE} target="_blank" rel="noopener noreferrer">
        neue {android ? 'Android-App (APK)' : 'Windows-App'} laden
      </a>{' '}
      – oder im Browser nutzen:{' '}
      <a href={BROWSER_ADRESSE} target="_blank" rel="noopener noreferrer">
        wep-pankow.pages.dev
      </a>
      . Bis dahin arbeitet diese App weiter wie bisher.
    </div>
  )
}
