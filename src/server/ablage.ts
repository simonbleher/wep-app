// Server-Modus (v2): lokale Ablage je Konto (Fund M7, docs/SICHERHEITSPRUEFUNG-V2.md). Meldet sich auf einem Gerät eine
// andere Person an, arbeitet sie in einer eigenen IndexedDB und sieht die WEPs der vorigen Person nicht – und lädt sie
// auch nicht unter ihrem Konto hoch.
//
// Die bisherige Ablage (`wep-db` im Browser, `wep-db-v2` in den Apps) gehört dem ersten Konto, das sich nach dieser
// Umstellung anmeldet: Vorhandene Daten gehen nicht verloren. Jedes weitere Konto bekommt `<Ablage>-<Konto-Id>`.
// Wem die bisherige Ablage gehört, steht im localStorage.

export const besitzerSchluessel = (basis: string) => `wep-ablage-besitzer:${basis}`

type Merker = Pick<Storage, 'getItem' | 'setItem'>

/** Name der IndexedDB für dieses Konto. Ohne localStorage: die bisherige Ablage (wie vor der Umstellung). */
export function ablageFuer(basis: string, kontoId: string, merker: Merker | undefined): string {
  if (!merker) return basis
  try {
    const besitzer = merker.getItem(besitzerSchluessel(basis))
    if (!besitzer) {
      merker.setItem(besitzerSchluessel(basis), kontoId)
      return basis
    }
    return besitzer === kontoId ? basis : `${basis}-${kontoId}`
  } catch {
    return basis
  }
}
