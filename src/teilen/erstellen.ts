// WEP teilen: sammelt ein WEP (und auf Wunsch Fotos und Bau-Excel) in einer `.wep`-Datei.
import JSZip from 'jszip'
import type { Wep } from '@/model'
import type { SicherungsQuelle } from '@/sicherung'
import { TEILEN_ENDUNG, TEILEN_FORMAT, TEILEN_JSON, TEILEN_MIME, type TeilenDatei } from './types'

export interface TeilenOptionen {
  mitFotos: boolean
  mitBauExcel: boolean
  jetzt?: () => string
  appVersion?: string
}

export interface ErstellteTeilenDatei {
  blob: Blob
  dateiname: string
  inhalt: { fotos: number; bauExcel: boolean }
  /** Dateien, die laut WEP dazugehören, aber auf diesem Gerät fehlen (nur in OneDrive) und deshalb nicht mitkommen. */
  fotosOhneDatei: number
  bauExcelOhneDatei: boolean
}

const bytesVon = async (d: Blob | Uint8Array): Promise<Uint8Array> =>
  d instanceof Uint8Array ? d : new Uint8Array(await d.arrayBuffer())

/** `<Vorgangs-Nr>_<Anlage>.wep` – ohne Zeichen, die in Dateinamen Ärger machen. */
export function teilenDateiname(wep: Wep): string {
  const anlage = wep.formalien.kleingartenanlage
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 60)
  return `${wep.id}${anlage ? `_${anlage}` : ''}${TEILEN_ENDUNG}`
}

/** Größe der optionalen Anhänge laut WEP (für die Anzeige vor dem Teilen). */
export function anhangGroessen(wep: Wep): { fotos: number; fotoAnzahl: number; bauExcel: number } {
  const fotos = wep.fotos ?? []
  return { fotos: fotos.reduce((s, f) => s + (f.groesse || 0), 0), fotoAnzahl: fotos.length, bauExcel: wep.bauExcel?.groesse ?? 0 }
}

/**
 * Erstellt die `.wep`-Datei. Was nicht mitgeschickt wird (Schalter aus oder Datei fehlt auf diesem Gerät),
 * steht auch nicht im WEP der Datei – so zeigt der Empfänger keine Fotos an, die es bei ihm nicht gibt.
 */
export async function erstelleTeilen(quelle: SicherungsQuelle, wepId: string, opt: TeilenOptionen): Promise<ErstellteTeilenDatei> {
  const jetzt = (opt.jetzt ?? (() => new Date().toISOString()))()
  const vorhanden = (await quelle.weps()).find((w) => w.wep.id === wepId)
  if (!vorhanden) throw new Error(`WEP ${wepId} nicht gefunden`)
  const zip = new JSZip()
  const wep: Wep = { ...vorhanden.wep }
  delete wep.fotos
  delete wep.bauExcel
  let fotosOhneDatei = 0
  const fotoListe: { id: string }[] = []

  if (opt.mitFotos) {
    const fotos = []
    for (const foto of vorhanden.wep.fotos ?? []) {
      const datei = await quelle.fotoDatei(wepId, foto)
      if (!datei) {
        fotosOhneDatei++
        continue
      }
      zip.file(`fotos/${foto.id}.jpg`, await bytesVon(datei), { compression: 'STORE', createFolders: false })
      fotos.push(foto)
      fotoListe.push({ id: foto.id })
    }
    if (fotos.length) wep.fotos = fotos
  }
  let bauExcel = false
  let bauExcelOhneDatei = false
  if (opt.mitBauExcel && vorhanden.wep.bauExcel) {
    const datei = await quelle.bauExcelDatei(vorhanden.wep)
    if (datei) {
      zip.file('bau.xlsx', await bytesVon(datei), { compression: 'STORE', createFolders: false })
      wep.bauExcel = vorhanden.wep.bauExcel
      bauExcel = true
    } else {
      bauExcelOhneDatei = true
    }
  }
  const daten: TeilenDatei = {
    format: TEILEN_FORMAT,
    erstelltAm: jetzt,
    appVersion: opt.appVersion ?? '',
    wep,
    geaendertAm: vorhanden.geaendertAm,
    enthaelt: { fotos: opt.mitFotos, bauExcel: opt.mitBauExcel },
    fotos: fotoListe,
  }
  zip.file(TEILEN_JSON, JSON.stringify(daten, null, 1), { compression: 'DEFLATE' })
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return {
    blob: new Blob([bytes.slice().buffer], { type: TEILEN_MIME }),
    dateiname: teilenDateiname(wep),
    inhalt: { fotos: fotoListe.length, bauExcel },
    fotosOhneDatei,
    bauExcelOhneDatei,
  }
}
