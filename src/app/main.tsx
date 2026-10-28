// Einstiegspunkt: rendert die React-App und registriert den Service Worker.
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { istWindowsApp } from '@/windows/plattform'
import { wendeKontrastAn } from '@/profil'
import { serverModus } from '@/server/modus'
import { VorschauBand } from '@/server/VorschauBand'
import '@/design/tokens.css'
import './styles.css'

// Vorerst immer helles Farbschema: Skizzen-Editor und Android-Systemleisten sind
// noch nicht für den Dunkelmodus eingerichtet (siehe docs/ENTSCHEIDUNGEN.md).
document.documentElement.dataset.thema = 'hell'
// Sonnen-Kontrast (Geräte-Einstellung im Profil) vor dem ersten Zeichnen anwenden
wendeKontrastAn()

if (Capacitor.isNativePlatform()) {
  // Android-App: Die Dateien liegen im APK, kein Service Worker nötig (und kein
  // veralteter Zwischenspeicher nach einem Update). Upload-Warteschlange starten.
  // Helle App: dunkle Symbole in Status- und Navigationsleiste (auch im Dunkelmodus des Geräts)
  void SystemBars.setStyle({ style: SystemBarsStyle.Light }).catch(() => undefined)
  void import('@/android').then((m) => m.startAndroid())
} else if (istWindowsApp()) {
  // Windows-Programm: Die Dateien liegen in der .exe (oder im geladenen Live-Update-Paket), kein
  // Service Worker nötig – er würde ein Live-Update nur mit altem Zwischenspeicher überlagern.
  void import('@/windows').then((m) => m.startWindows())
} else {
  // Service Worker für Offline-Betrieb registrieren (autoUpdate, kein Prompt nötig).
  registerSW({ immediate: true })
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Wurzelelement #root nicht gefunden')
}

// BV-Kontrollseite unter /bv (nicht in der Navigation der Wertermittler); lädt erst bei Bedarf nach
const BvApp = lazy(() => import('@/bv/BvSeite'))
const istBvSeite = /^\/bv(\/|$)/.test(window.location.pathname)

createRoot(container).render(
  <StrictMode>
    {serverModus && <VorschauBand />}
    {istBvSeite ? (
      <Suspense fallback={<div className="app" aria-busy="true" />}>
        <BvApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
