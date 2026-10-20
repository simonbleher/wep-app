// Einstiegspunkt: rendert die React-App und registriert den Service Worker.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

if (Capacitor.isNativePlatform()) {
  // Android-App: Die Dateien liegen im APK, kein Service Worker nötig (und kein
  // veralteter Zwischenspeicher nach einem Update). Upload-Warteschlange starten.
  void import('@/android').then((m) => m.startAndroid())
} else {
  // Service Worker für Offline-Betrieb registrieren (autoUpdate, kein Prompt nötig).
  registerSW({ immediate: true })
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Wurzelelement #root nicht gefunden')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
