// Server-Modus in der Android- und Windows-App (Paket 8): Die Oberfläche ruft den Server wie im Browser über
// relative Adressen (/api/v2/…). In den Apps liegt die Seite aber unter https://localhost (Capacitor) bzw.
// https://tauri.localhost (Tauri). Dieser Aufsatz auf `fetch` leitet solche Aufrufe an die Server-Adresse um,
// hängt das Sitzungs-Token als Bearer an und schickt keine Cookies mit (CORS ist auf dem Server nur für die
// Herkünfte der Apps offen, functions/api/v2/_middleware.ts).

/** Adresse des Servers für die Apps; zum Testen mit VITE_SERVER_ADRESSE überschreibbar. */
export const SERVER_ADRESSE = (import.meta.env.VITE_SERVER_ADRESSE || 'https://wep-pankow.pages.dev').replace(/\/+$/, '')

/** Gehört die Adresse zur v2-Schnittstelle der eigenen Seite? Dann die Adresse beim Server, sonst null. */
export function serverZiel(url: string, seite: string, server: string): string | null {
  let u: URL
  try {
    u = new URL(url, seite)
  } catch {
    return null
  }
  if (u.origin !== new URL(seite).origin) return null
  if (u.pathname !== '/api/v2' && !u.pathname.startsWith('/api/v2/')) return null
  return `${server}${u.pathname}${u.search}`
}

/** `fetch` mit Umleitung an den Server und Bearer-Token. Andere Adressen bleiben unberührt. */
export function fetchMitBearer(original: typeof fetch, server: string, token: () => string | null, seite: () => string): typeof fetch {
  return (eingabe, init) => {
    const roh = typeof eingabe === 'string' ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url
    const ziel = serverZiel(roh, seite(), server)
    if (!ziel) return original(eingabe, init)
    const anfrage = new Request(ziel, eingabe instanceof Request ? eingabe : undefined)
    const kopf = new Headers(init?.headers ?? anfrage.headers)
    const t = token()
    if (t) kopf.set('authorization', `Bearer ${t}`)
    else kopf.delete('authorization')
    return original(new Request(anfrage, { ...init, headers: kopf, credentials: 'omit', mode: 'cors' }))
  }
}

/** Einmal beim Start der App im Server-Modus: alle Aufrufe von /api/v2/… gehen an den Server. */
export function installiereAppZugriff(token: () => string | null, server = SERVER_ADRESSE): void {
  const original = window.fetch.bind(window)
  window.fetch = fetchMitBearer(original, server, token, () => window.location.href)
}
