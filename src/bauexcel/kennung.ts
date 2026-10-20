// Kennung des Inhalts einer Datei (SHA-256, gekürzt). Gleiche Datei = gleiche Kennung; so erkennt ein
// Gerät, ob die Datei in OneDrive schon die ist, die das WEP meint (und nicht noch die alte Fassung).

export async function inhaltsKennung(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const daten = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', daten.slice()))
  return [...hash.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
