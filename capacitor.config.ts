import type { CapacitorConfig } from '@capacitor/cli'

// Android-Hülle um die bestehende Web-App (Beta 2, Schritt 3: Test-APK).
// Die Web-App selbst bleibt unverändert; `dist/` ist der normale Vite-Build.
const config: CapacitorConfig = {
  appId: 'de.wep.app',
  appName: 'WEP',
  webDir: 'dist',
  // Hintergrund der WebView = App-Hintergrund (sichtbar unter den transparenten Systemleisten)
  backgroundColor: '#f4f6f4',
  android: {
    // Test-APK: Chrome-Inspektion (chrome://inspect) erlaubt
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    // Live-Update des Web-Teils (@capgo/capacitor-updater) im manuellen Modus: keine
    // Capgo-Cloud, keine Statistik, keine automatische Prüfung. Die App lädt das Paket
    // selbst (src/android/updateAblauf.ts); meldet sie den Start nicht binnen 15 s mit
    // notifyAppReady(), fällt das Plugin auf die vorige Fassung zurück.
    CapacitorUpdater: {
      autoUpdate: false,
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      appReadyTimeout: 15000,
      resetWhenUpdate: true,
    },
    // Randloser Modus (Android 15): Die WebView läuft unter den Systemleisten, die App
    // berücksichtigt die Insets selbst (env(safe-area-inset-*), viewport-fit=cover).
    // Helle App → dunkle Symbole in Status- und Navigationsleiste.
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
    },
  },
}

export default config
