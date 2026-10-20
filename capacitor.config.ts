import type { CapacitorConfig } from '@capacitor/cli'

// Android-Hülle um die bestehende Web-App (Beta 2, Schritt 3: Test-APK).
// Die Web-App selbst bleibt unverändert; `dist/` ist der normale Vite-Build.
const config: CapacitorConfig = {
  appId: 'de.wep.app',
  appName: 'WEP',
  webDir: 'dist',
  android: {
    // Test-APK: Chrome-Inspektion (chrome://inspect) erlaubt
    webContentsDebuggingEnabled: true,
  },
}

export default config
