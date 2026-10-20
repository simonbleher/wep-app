// Kennung dieses Geräts (nur zur Info in den Sync-Dateien und Konflikt-Hinweisen).
const GERAET_KEY = 'wep-geraet'

/** Stabile, zufällige Kennung dieses Geräts. */
export function geraeteKennung(): string {
  try {
    let id = localStorage.getItem(GERAET_KEY)
    if (!id) {
      id = `${navigator.platform || 'Gerät'}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem(GERAET_KEY, id)
    }
    return id
  } catch {
    return 'unbekanntes Gerät'
  }
}
