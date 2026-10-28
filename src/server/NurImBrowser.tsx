// Android- und Windows-App mit dem Web-Paket von v2 (src/server/modus.ts): Die App arbeitet weiter wie v1
// (Daten auf dem Gerät, OneDrive). Konten und Abgabe an Grün und BV gibt es vorerst nur im Browser.
export const BROWSER_ADRESSE = 'https://wep-pankow.pages.dev'

export function NurImBrowser() {
  return (
    <div className="app-hinweis-band" role="note">
      Die neue WEP-App mit Konten und Abgabe an Grün und BV bitte im Browser nutzen:{' '}
      <a href={BROWSER_ADRESSE} target="_blank" rel="noopener noreferrer">
        wep-pankow.pages.dev
      </a>
      . Diese App arbeitet weiter wie bisher.
    </div>
  )
}
