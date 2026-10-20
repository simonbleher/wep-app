import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const version = (JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }).version

/** Release-Seite, auf die der Update-Hinweis der Android-App verweist. */
const RELEASE_URL = 'https://github.com/simonbleher/wep-app/releases/latest'

/**
 * Schreibt `version.json` in den Build (versionName aus package.json, versionCode aus
 * WEP_VERSION_CODE – der Release-Workflow setzt die Lauf-Nummer, sonst 0 = unbekannt).
 * Die Android-App liest die eingebaute Datei als „installiert“ und die gehostete als „neueste“.
 */
function versionJson(): Plugin {
  return {
    name: 'wep-version-json',
    generateBundle() {
      const versionCode = Number.parseInt(process.env.WEP_VERSION_CODE ?? '', 10) || 0
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ versionName: version, versionCode, releaseUrl: RELEASE_URL }, null, 2) + '\n',
      })
    },
  }
}

// Theme-Farbe der WEP-App: weiß wie Kopfzeile und Hintergrund (Design Beta 2)
const THEME_COLOR = '#ffffff'
const BACKGROUND_COLOR = '#ffffff'

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    versionJson(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
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
