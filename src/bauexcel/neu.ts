// „Neues WEP aus Bau-Excel“ (Beta 3, Paket 5): erst die Datei prüfen, dann erst das WEP anlegen – eine
// unbrauchbare Datei hinterlässt kein leeres WEP.
import { speichereWep } from '@/app/db'
import { leseBauFormalien } from '@/export/bauExcelLesen'
import type { Wep } from '@/model'
import { neuerWepMitProfil, type Profil } from '@/profil'
import { fuelleLeereFelder } from './abgleich'
import { fuelleLeereListen } from './gruenAbgleich'
import { setzeBauExcel, type BauWerkzeuge } from './index'

export async function legeWepAusBauExcelAn(opt: {
  id: string
  datei: Blob & { name?: string }
  profil: Profil
  /** Speichert das WEP (Standard: IndexedDB). */
  speichere?: (wep: Wep) => Promise<unknown>
  werkzeuge?: Partial<BauWerkzeuge>
}): Promise<Wep> {
  const speichere = opt.speichere ?? ((w: Wep) => speichereWep(w))
  // Prüfen, bevor etwas angelegt wird (wirft mit lesbarer Meldung)
  const pruefung = await setzeBauExcelPruefung(opt.datei)
  let wep = neuerWepMitProfil(opt.id, opt.profil)
  await speichere(wep)
  const erg = await setzeBauExcel({
    wepId: opt.id,
    datei: opt.datei,
    aendere: async (fn) => {
      wep = fn(wep)
      await speichere(wep)
    },
    werkzeuge: opt.werkzeuge,
  })
  // Leere Felder aus der Bau-Excel; Abweichungen (z. B. Wertermittler aus dem Profil) fragt die WEP-Ansicht ab
  wep = fuelleLeereFelder(wep, erg.bau ?? pruefung)
  // Außenanlagen, Aufwuchs und Beseitigung: ein neues WEP hat noch keine Einträge, alles aus der Bau-Excel wird übernommen
  wep = fuelleLeereListen(wep, erg.gruen)
  await speichere(wep)
  return wep
}

async function setzeBauExcelPruefung(datei: Blob) {
  const bytes = new Uint8Array(await datei.arrayBuffer())
  try {
    return await leseBauFormalien(bytes)
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    throw new Error(
      m.includes('Formalien')
        ? m
        : 'Diese Datei lässt sich nicht als Excel-Datei (.xlsx) lesen. Bitte die WEP-Datei des Bau-Wertermittlers wählen.',
    )
  }
}
