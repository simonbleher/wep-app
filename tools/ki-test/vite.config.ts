// Minimale Vite-Konfiguration für den KI-Testlauf (vite-node): nur der Pfad-Alias
// `@` → src, ohne React-/PWA-Plugins der App.
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
})
