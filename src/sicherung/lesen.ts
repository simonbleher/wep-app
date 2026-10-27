// Sicherung lesen: prüft die Datei und liefert den Inhalt; die großen Dateien werden erst bei Bedarf entpackt.
import JSZip from 'jszip'
import { SICHERUNG_FORMAT, SICHERUNG_JSON, type SicherungsDatei } from './types'

export interface GeleseneSicherung {
  daten: SicherungsDatei
  foto(wepId: string, fotoId: string): Promise<Uint8Array | undefined>
  bauExcel(wepId: string): Promise<Uint8Array | undefined>
}

export class SicherungsFehler extends Error {}

/** Liest eine Sicherungsdatei. Wirft einen `SicherungsFehler` mit verständlichem Text, wenn sie nicht passt. */
export async function leseSicherung(quelle: Blob | Uint8Array | ArrayBuffer): Promise<GeleseneSicherung> {
  let zip: JSZip
  try {
    const bytes = quelle instanceof Blob ? await quelle.arrayBuffer() : quelle
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new SicherungsFehler('Diese Datei ist keine Sicherung der WEP-App (keine gültige ZIP-Datei).')
  }
  const eintrag = zip.file(SICHERUNG_JSON)
  if (!eintrag) throw new SicherungsFehler('Diese Datei ist keine Sicherung der WEP-App (sicherung.json fehlt).')
  let daten: SicherungsDatei
  try {
    daten = JSON.parse(await eintrag.async('string')) as SicherungsDatei
  } catch {
    throw new SicherungsFehler('Die Sicherung ist beschädigt (sicherung.json ist nicht lesbar).')
  }
  if (typeof daten.format !== 'string' || !daten.format.startsWith('wep-sicherung/')) {
    throw new SicherungsFehler('Diese Datei ist keine Sicherung der WEP-App.')
  }
  if (daten.format !== SICHERUNG_FORMAT) {
    throw new SicherungsFehler(
      `Die Sicherung hat das Format „${daten.format}“. Diese App-Version kennt nur „${SICHERUNG_FORMAT}“ – bitte die App aktualisieren.`,
    )
  }
  const liste = <T>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : [])
  const sauber: SicherungsDatei = {
    ...daten,
    weps: liste(daten.weps).filter((w) => w?.wep?.id),
    papierkorb: liste(daten.papierkorb).filter((p) => p?.wep?.id && p.id),
    eigenePositionen: liste(daten.eigenePositionen),
    fotos: liste(daten.fotos),
    bauExcel: liste(daten.bauExcel),
    profil: daten.profil ?? { profil: { name: '', rolle: 'gruen' } },
    enthaelt: daten.enthaelt ?? { fotos: false, bauExcel: false },
  }
  const bytes = async (pfad: string) => {
    const f = zip.file(pfad)
    return f ? await f.async('uint8array') : undefined
  }
  return {
    daten: sauber,
    foto: (wepId, fotoId) => bytes(`fotos/${wepId}/${fotoId}.jpg`),
    bauExcel: (wepId) => bytes(`bau/${wepId}.xlsx`),
  }
}
