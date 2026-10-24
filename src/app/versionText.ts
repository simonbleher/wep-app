// Anzeige der App-Version: Die Nummer in package.json bleibt gleich, deshalb gehören Stand (Bauzeit) und Commit dazu –
// daran erkennt man, ob ein Gerät die neueste Freigabe hat.

/** „0.1.0 · Stand 24.10.2026, 15:30 · 6a3c4a1“; ohne Commit (lokaler Build) „· lokal“. */
export function versionText(
  version: string = __APP_VERSION__,
  build: { commit: string; gebautAm: string } = __APP_BUILD__,
): string {
  const zeit = new Date(build.gebautAm)
  const stand = Number.isNaN(zeit.getTime())
    ? ''
    : `Stand ${zeit.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
  return [version, stand, build.commit || 'lokal'].filter(Boolean).join(' · ')
}

/**
 * Web-App neu laden und dabei den Cache des Service Workers verwerfen, damit die neueste Freigabe geladen wird
 * (ein installierter Browser-Stand bleibt sonst oft eine Sitzung lang alt).
 */
export async function ladeWebAppNeu(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    if (typeof caches !== 'undefined') await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  } finally {
    location.reload()
  }
}
