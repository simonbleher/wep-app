// Sicherung erstellen: sammelt den lokalen Stand in einer ZIP-Datei.
import JSZip from 'jszip'
import {
  SICHERUNG_FORMAT,
  SICHERUNG_JSON,
  type SicherungsDatei,
  type SicherungsQuelle,
} from './types'

export interface SicherungsOptionen {
  mitFotos: boolean
  mitBauExcel: boolean
  jetzt?: () => string
  appVersion?: string
}

export interface ErstellteSicherung {
  blob: Blob
  dateiname: string
  inhalt: SicherungsZaehlung
}

export interface SicherungsZaehlung {
  weps: number
  papierkorb: number
  eigenePositionen: number
  fotos: number
  /** Fotos, deren Datei auf diesem Gerät fehlt (nur in OneDrive) und deshalb nicht in die Sicherung kommen. */
  fotosOhneDatei: number
  bauExcel: number
  bauExcelOhneDatei: number
}

const bytesVon = async (d: Blob | Uint8Array): Promise<Uint8Array> =>
  d instanceof Uint8Array ? d : new Uint8Array(await d.arrayBuffer())

/** Dateiname mit Datum: `WEP-Sicherung_2026-10-20.zip`. */
export function sicherungsDateiname(jetzt: string): string {
  // Lokales Datum (nachts nach Mitternacht sonst der Vortag in UTC)
  const d = new Date(jetzt)
  const zwei = (n: number) => String(n).padStart(2, '0')
  return `WEP-Sicherung_${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}.zip`
}

/** Erstellt die Sicherung. Fehlende Fotodateien werden gezählt, brechen aber nichts ab. */
export async function erstelleSicherung(quelle: SicherungsQuelle, opt: SicherungsOptionen): Promise<ErstellteSicherung> {
  const jetzt = (opt.jetzt ?? (() => new Date().toISOString()))()
  const [weps, papierkorb, eigene, profil] = await Promise.all([
    quelle.weps(),
    quelle.papierkorb(),
    quelle.eigenePositionen(),
    quelle.profil(),
  ])
  const zip = new JSZip()
  const daten: SicherungsDatei = {
    format: SICHERUNG_FORMAT,
    erstelltAm: jetzt,
    appVersion: opt.appVersion ?? '',
    weps,
    papierkorb,
    eigenePositionen: eigene,
    profil,
    enthaelt: { fotos: opt.mitFotos, bauExcel: opt.mitBauExcel },
    fotos: [],
    bauExcel: [],
  }
  const zaehlung: SicherungsZaehlung = {
    weps: weps.length,
    papierkorb: papierkorb.length,
    eigenePositionen: eigene.filter((e) => !e.geloescht).length,
    fotos: 0,
    fotosOhneDatei: 0,
    bauExcel: 0,
    bauExcelOhneDatei: 0,
  }

  const alle = [...weps.map((w) => w.wep), ...papierkorb.map((p) => p.wep)]
  for (const wep of alle) {
    if (opt.mitFotos) {
      for (const foto of wep.fotos ?? []) {
        const datei = await quelle.fotoDatei(wep.id, foto)
        if (!datei) {
          zaehlung.fotosOhneDatei++
          continue
        }
        // JPEGs sind schon komprimiert: nur ablegen
        zip.file(`fotos/${wep.id}/${foto.id}.jpg`, await bytesVon(datei), { compression: 'STORE', createFolders: false })
        daten.fotos.push({ wepId: wep.id, id: foto.id })
        zaehlung.fotos++
      }
    }
    if (opt.mitBauExcel && wep.bauExcel) {
      const datei = await quelle.bauExcelDatei(wep)
      if (!datei) {
        zaehlung.bauExcelOhneDatei++
        continue
      }
      zip.file(`bau/${wep.id}.xlsx`, await bytesVon(datei), { compression: 'STORE', createFolders: false })
      daten.bauExcel.push({ wepId: wep.id })
      zaehlung.bauExcel++
    }
  }
  zip.file(SICHERUNG_JSON, JSON.stringify(daten, null, 1), { compression: 'DEFLATE' })
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return {
    blob: new Blob([bytes.slice().buffer], { type: 'application/zip' }),
    dateiname: sicherungsDateiname(jetzt),
    inhalt: zaehlung,
  }
}
