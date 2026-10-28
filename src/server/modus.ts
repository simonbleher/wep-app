// Schalter für v2 (docs/PLAN-V2.md): Server, Konten mit Rollen, Abgabe-Ablauf. Wird beim Build eingebaut
// (VITE_SERVER_MODUS=true, in Cloudflare zuerst nur für die Vorschau). Ohne Schalter verhält sich die App wie v1.

/** Liest den Schalter aus den Build-Variablen; nur genau "true" schaltet ein. */
export const istServerModus = (env: { VITE_SERVER_MODUS?: string }): boolean => env.VITE_SERVER_MODUS === 'true'

/** Server-Modus dieses Builds. */
export const serverModus: boolean = istServerModus(import.meta.env)
