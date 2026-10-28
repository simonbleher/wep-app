/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** App-Version aus package.json (siehe vite.config.ts). */
declare const __APP_VERSION__: string

/** Commit (kurz, leer bei lokalem Build) und Bauzeit (ISO) dieses Builds (siehe vite.config.ts). */
declare const __APP_BUILD__: { commit: string; gebautAm: string }

interface ImportMetaEnv {
  /** Client-ID der Microsoft-App-Registrierung (docs/SYNC.md). */
  readonly VITE_MS_CLIENT_ID?: string
  /** "true" schaltet v2 ein (Server, Konten, Ablauf – docs/PLAN-V2.md). Sonst verhält sich die App wie v1. */
  readonly VITE_SERVER_MODUS?: string
}
