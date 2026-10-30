// POST /api/csp-bericht – Meldungen der Content-Security-Policy (Report-Only, public/_headers; Fund M4,
// docs/SICHERHEITSPRUEFUNG-V2.md). Schreibt eine kurze Zeile ins Log der Functions (Cloudflare → wep-pankow → Functions →
// Echtzeit-Logs): welche Regel, welche Quelle (nur Herkunft), auf welcher Seite (nur Pfad). Keine Query, keine Inhalte,
// nichts in der Datenbank. Antwortet immer 204.

const MAX_BYTES = 8192

/** Nur Herkunft bzw. Schlüsselwort („inline“, „eval“, „data“ …), nie Pfad oder Query einer fremden Adresse. */
export function quelle(v: unknown): string {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t) return '?'
  try {
    return new URL(t).origin
  } catch {
    return /^[a-z-]{1,30}$/i.test(t) ? t : '?'
  }
}

const pfad = (v: unknown): string => {
  try {
    return new URL(String(v)).pathname.slice(0, 100)
  } catch {
    return '?'
  }
}

const kurz = (v: unknown) => (typeof v === 'string' ? v.replace(/[^\w\s:'*.-]/g, '').slice(0, 60) : '?')

/** Liest eine Meldung (altes Format `csp-report` oder Reporting-API) und liefert die Logzeile – oder undefined. */
export function berichtZeile(text: string): string | undefined {
  let daten: unknown
  try {
    daten = JSON.parse(text)
  } catch {
    return undefined
  }
  const eintraege = Array.isArray(daten) ? daten.map((d) => (d as { body?: unknown }).body) : [(daten as { 'csp-report'?: unknown })['csp-report']]
  const zeilen = eintraege.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null).slice(0, 5).map((e) => {
    const regel = e['effective-directive'] ?? e['violated-directive'] ?? e.effectiveDirective
    const blockiert = e['blocked-uri'] ?? e.blockedURL
    const seite = e['document-uri'] ?? e.documentURL
    return `${kurz(regel)} ← ${quelle(blockiert)} auf ${pfad(seite)}`
  })
  return zeilen.length ? `CSP (nur gemeldet): ${zeilen.join(' | ')}` : undefined
}

export const onRequestPost = async ({ request }: { request: Request }): Promise<Response> => {
  const laenge = Number(request.headers.get('content-length') ?? '0')
  if (laenge <= MAX_BYTES) {
    const text = (await request.text().catch(() => '')).slice(0, MAX_BYTES)
    const zeile = berichtZeile(text)
    if (zeile) console.warn(zeile)
  }
  return new Response(null, { status: 204 })
}
