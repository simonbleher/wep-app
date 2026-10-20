import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const version = (JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }).version

// Theme-Farbe der WEP-App (satter Grünton, hoher Kontrast für den Außeneinsatz)
const THEME_COLOR = '#1b5e20'
const BACKGROUND_COLOR = '#f4f6f4'

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
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
        // Design-Vorschau nicht in die App umleiten (sonst zeigt der Service Worker index.html)
        navigateFallbackDenylist: [/^\/entwurf/],
      },
    }),
  ],
  build: {
    rollupOptions: {
      // Zweiter Einstieg: Design-Vorschau (docs/entwurf/README.md), unabhängig von der App
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        entwurf: fileURLToPath(new URL('./entwurf.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
