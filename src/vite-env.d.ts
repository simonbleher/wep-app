/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** App-Version aus package.json (siehe vite.config.ts). */
declare const __APP_VERSION__: string

/** Commit (kurz, leer bei lokalem Build) und Bauzeit (ISO) dieses Builds (siehe vite.config.ts). */
declare const __APP_BUILD__: { commit: string; gebautAm: string }
