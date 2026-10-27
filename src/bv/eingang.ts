// BV-Kontrollseite: eingegangene Dateien lesen und für die Liste aufbereiten. Kein Server – die Geschäftsstelle bekommt
// die Dateien per Synology oder E-Mail (.wep oder „…_an-BV.zip“ aus „An den BV senden“) und öffnet sie hier.
// Gelesen wird mit derselben Logik wie beim Teilen (`leseTeilen`); alles Weitere (PDFs, JPGs im Ordner) wird übersprungen.
import JSZip from 'jszip'
import { vorgangsNrVon, type Wep } from '@/model'
import { leseTeilen, TeilenFehler } from '@/teilen'

export type BvStatus = 'neu' | 'geprueft' | 'rueckfrage'
export const BV_STATUS_TEXT: Record<BvStatus, string> = { neu: 'neu', geprueft: 'geprüft', rueckfrage: 'Rückfrage' }

/** Ein eingegangenes WEP (eine Fassung). Fotos und Bau-Excel liegen als Dateien daneben (`BvDatei`). */
export interface BvEingang {
  /** WEP-Kennung und Stand: dieselbe Fassung zweimal eingelesen ergibt denselben Schlüssel. */
  id: string
  wep: Wep
  /** Letzte Änderung auf dem Gerät des Wertermittlers (aus der Datei). */
  stand: string
  appVersion: string
  dateiname: string
  eingangAm: string
  status: BvStatus
  notiz: string
  fotoIds: string[]
  hatBauExcel: boolean
  /** Gesamtbetrag laut Protokoll (wird nach dem Einlesen berechnet). */
  gesamt?: number
}

export interface GelesenesWep {
  eingang: BvEingang
  fotos: { id: string; daten: Uint8Array }[]
  bauExcel?: Uint8Array
}

export interface LeseErgebnis {
  weps: GelesenesWep[]
  fehler: { datei: string; meldung: string }[]
  /** Dateien, die keine WEPs sind (PDFs, Fotos, Text …) und übersprungen wurden. */
  uebersprungen: string[]
}

export interface EingangsDatei {
  name: string
  daten: Blob | Uint8Array | ArrayBuffer
}

export const eingangsSchluessel = (wep: Wep, stand: string): string => `${wep.id}|${stand}`

const bytes = async (d: Blob | Uint8Array | ArrayBuffer): Promise<Uint8Array> =>
  d instanceof Uint8Array ? d : new Uint8Array(d instanceof Blob ? await d.arrayBuffer() : d)

async function leseWepDatei(name: string, daten: Uint8Array, jetzt: string): Promise<GelesenesWep> {
  const g = await leseTeilen(daten)
  const wep = g.daten.wep
  const stand = g.daten.geaendertAm || g.daten.erstelltAm || jetzt
  const fotos: { id: string; daten: Uint8Array }[] = []
  for (const f of g.daten.fotos) {
    const b = await g.sicherung.foto(wep.id, f.id)
    if (b) fotos.push({ id: f.id, daten: b })
  }
  const bauExcel = g.daten.enthaelt.bauExcel ? await g.sicherung.bauExcel(wep.id) : undefined
  return {
    eingang: {
      id: eingangsSchluessel(wep, stand),
      wep,
      stand,
      appVersion: g.daten.appVersion,
      dateiname: name,
      eingangAm: jetzt,
      status: 'neu',
      notiz: '',
      fotoIds: fotos.map((f) => f.id),
      hatBauExcel: Boolean(bauExcel),
    },
    fotos,
    ...(bauExcel ? { bauExcel } : {}),
  }
}

const endung = (name: string) => name.toLowerCase().split('.').pop() ?? ''

/**
 * Liest .wep-Dateien und Pakete („…_an-BV.zip“, darin eine oder mehrere .wep-Dateien). Eine ZIP ohne WEP und alle
 * anderen Dateien werden übersprungen, fehlerhafte WEP-Dateien mit verständlicher Meldung gemeldet.
 */
export async function leseEingangsDateien(dateien: EingangsDatei[], jetzt = new Date().toISOString()): Promise<LeseErgebnis> {
  const erg: LeseErgebnis = { weps: [], fehler: [], uebersprungen: [] }
  const fehler = (datei: string, e: unknown) =>
    erg.fehler.push({ datei, meldung: e instanceof TeilenFehler || e instanceof Error ? e.message : String(e) })

  for (const d of dateien) {
    let art = endung(d.name)
    if (art !== 'wep' && art !== 'zip') {
      // Ohne passende Endung (z. B. umbenannter E-Mail-Anhang): ZIP am Inhalt erkennen
      const kopf = await bytes(d.daten instanceof Blob ? d.daten.slice(0, 4) : d.daten)
      if (!(kopf[0] === 0x50 && kopf[1] === 0x4b && kopf[2] === 0x03 && kopf[3] === 0x04)) {
        erg.uebersprungen.push(d.name)
        continue
      }
      art = 'zip'
    }
    const daten = await bytes(d.daten)
    if (art === 'wep') {
      try {
        erg.weps.push(await leseWepDatei(d.name, daten, jetzt))
      } catch (e) {
        fehler(d.name, e)
      }
      continue
    }
    // ZIP: entweder eine umbenannte WEP-Datei (wep.json an der Wurzel) oder ein Paket mit .wep-Dateien darin
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(daten)
    } catch {
      fehler(d.name, new Error('Die ZIP-Datei ist beschädigt.'))
      continue
    }
    if (zip.file('wep.json')) {
      try {
        erg.weps.push(await leseWepDatei(d.name, daten, jetzt))
      } catch (e) {
        fehler(d.name, e)
      }
      continue
    }
    const innen = Object.values(zip.files).filter((f) => !f.dir && endung(f.name) === 'wep')
    if (!innen.length) {
      erg.uebersprungen.push(d.name)
      continue
    }
    for (const f of innen) {
      try {
        erg.weps.push(await leseWepDatei(d.name, await f.async('uint8array'), jetzt))
      } catch (e) {
        fehler(`${d.name} → ${f.name}`, e)
      }
    }
  }
  return erg
}

/** Hinweis zur Vorgangs-Nr. in der Liste. */
export type BvHinweis = { art: 'fehlt' } | { art: 'doppelt'; neueste: boolean; anzahl: number }

export interface BvZeile {
  eingang: BvEingang
  nr: string
  hinweise: BvHinweis[]
}

/**
 * Zeilen der Übersichtstabelle: neueste Eingänge zuerst. Gleiche Vorgangs-Nr. mehrfach (zweite Fassung desselben WEP oder
 * ein anderes WEP mit derselben Nummer) bekommt einen Hinweis; die neueste Fassung (nach Stand) ist gekennzeichnet.
 */
export function bvZeilen(eingaenge: readonly BvEingang[]): BvZeile[] {
  const nachNr = new Map<string, BvEingang[]>()
  for (const e of eingaenge) {
    const nr = vorgangsNrVon(e.wep)
    if (nr) nachNr.set(nr, [...(nachNr.get(nr) ?? []), e])
  }
  return [...eingaenge]
    .sort((a, b) => b.eingangAm.localeCompare(a.eingangAm) || b.stand.localeCompare(a.stand))
    .map((e) => {
      const nr = vorgangsNrVon(e.wep)
      const hinweise: BvHinweis[] = []
      if (!nr) hinweise.push({ art: 'fehlt' })
      const gruppe = nr ? (nachNr.get(nr) ?? []) : []
      if (gruppe.length > 1) {
        const neueste = gruppe.reduce((x, y) => (y.stand > x.stand ? y : x))
        hinweise.push({ art: 'doppelt', neueste: neueste.id === e.id, anzahl: gruppe.length })
      }
      return { eingang: e, nr, hinweise }
    })
}
