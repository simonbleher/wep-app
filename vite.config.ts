import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { versionsname } from './tools/versionsname.mjs'

/** Haupt.Neben aus package.json, letzte Stelle = Freigabe-Nummer aus RELEASE_NR (tools/versionsname.mjs). */
const version = versionsname()

/** Gehostete Seite; von dort holt die Android-App version.json und das Update-Paket. */
const HOST_URL = 'https://wep-pankow.pages.dev'

/** Nummer des nativen Teils der Android-App (android/native-version.txt, siehe docs/ANDROID.md). */
const nativeVersion = Number.parseInt(readFileSync('./android/native-version.txt', 'utf-8').trim(), 10)
if (!Number.isInteger(nativeVersion) || nativeVersion < 1) {
  throw new Error('android/native-version.txt muss eine ganze Zahl ab 1 enthalten.')
}

/** Nummer der Windows-Hülle (src-tauri/huelle-version.txt, siehe docs/WINDOWS.md). */
const windowsHuelle = Number.parseInt(readFileSync('./src-tauri/huelle-version.txt', 'utf-8').trim(), 10)
if (!Number.isInteger(windowsHuelle) || windowsHuelle < 1) {
  throw new Error('src-tauri/huelle-version.txt muss eine ganze Zahl ab 1 enthalten.')
}

/** Release-Seite, auf die der Update-Hinweis der Android-App verweist. */
const RELEASE_URL = 'https://github.com/simonbleher/wep-app/releases/latest'

/**
 * Schreibt `version.json` in den Build: versionName aus package.json, versionCode aus
 * WEP_VERSION_CODE (Release-Workflow: Lauf-Nummer, sonst 0 = unbekannt), `commit`
 * (Cloudflare: CF_PAGES_COMMIT_SHA, GitHub Actions: GITHUB_SHA) und `gebautAm` (ISO-Zeit).
 * `nativeVersion` (android/native-version.txt) sagt, zu welchem nativen Teil der Web-Teil passt;
 * `windowsHuelle` (src-tauri/huelle-version.txt) ist dasselbe für das Windows-Programm.
 * `bundleUrl` (nur wenn der Commit bekannt ist) zeigt auf das Live-Update-Paket, das
 * tools/update-paket.mjs nach dem Build als updates/<commit>.zip erzeugt.
 * Die Android-App liest die eingebaute Datei als „installiert“ und die gehostete als „neueste“
 * und vergleicht über den Commit (siehe src/android/update.ts).
 */
function versionJson(): Plugin {
  return {
    name: 'wep-version-json',
    generateBundle() {
      const versionCode = Number.parseInt(process.env.WEP_VERSION_CODE ?? '', 10) || 0
      const commit = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || ''
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source:
          JSON.stringify(
            {
              versionName: version,
              versionCode,
              ...(commit ? { commit, bundleUrl: `${HOST_URL}/updates/${commit}.zip` } : {}),
              nativeVersion,
              windowsHuelle,
              gebautAm: new Date().toISOString(),
              releaseUrl: RELEASE_URL,
            },
            null,
            2,
          ) + '\n',
      })
    },
  }
}

// Theme-Farbe der WEP-App: weiß wie Kopfzeile und Hintergrund (Design Beta 2)
const THEME_COLOR = '#ffffff'
const BACKGROUND_COLOR = '#ffffff'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // Wodurch sich zwei Freigaben unterscheiden: Commit (kurz) und Bauzeit – die Nummer in package.json bleibt gleich
    __APP_BUILD__: JSON.stringify({
      commit: (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 7),
      gebautAm: new Date().toISOString(),
    }),
  },
  plugins: [
    react(),
    versionJson(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'WEP – Wertermittlungsprotokoll',
        short_name: 'WEP',
        description:
          'Wertermittlungsprotokolle im Kleingarten direkt auf der Parzelle erfassen (offline-fähig).',
        lang: 'de',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Offline-Precaching aller gebauten Assets
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,xlsx}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
