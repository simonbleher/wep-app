// Anbindung der Sicherung an den lokalen Speicher dieses Geräts (IndexedDB, localStorage).
import {
  alleBauExcelRecords,
  alleImPapierkorb,
  alleSyncMeta,
  alleWeps,
  fotoRecordsVon,
  ladeBauExcelDatei,
  ladeFotoDatei,
  schreibeLokal,
  speichereBauExcel,
  speichereFoto,
  speichereWep,
} from '@/app/db'
import { lokaleEigene } from '@/katalog'
import { aendereProfil, lokalesProfil } from '@/profil'
import { belegteNummern } from '@/sync/aktionen'
import { papierkorbMeta } from '@/sync/papierkorb'
import { browserBilddienst } from '@/fotos/browserBild'
import { erzeugeVorschau } from '@/fotos/komprimieren'
import { fotoKey } from '@/fotos/types'
import type { SicherungsQuelle, SicherungsZiel } from './types'

export const lokalerStand: SicherungsQuelle = {
  async weps() {
    const [weps, meta] = await Promise.all([alleWeps(), alleSyncMeta()])
    const geaendert = new Map(meta.map((m) => [m.id, m.lokalGeaendertAm]))
    return weps.map((wep) => ({ wep, geaendertAm: geaendert.get(wep.id) }))
  },
  papierkorb: alleImPapierkorb,
  async eigenePositionen() {
    return lokaleEigene.lade().eintraege
  },
  async profil() {
    const s = lokalesProfil.lade()
    return { profil: s.profil, geaendertAm: s.geaendertAm }
  },
  fotoDatei: (wepId, foto) => ladeFotoDatei(wepId, foto.id),
  async bauExcelDatei(wep) {
    const r = (await alleBauExcelRecords()).find((x) => x.wepId === wep.id)
    // nur die Fassung, die das WEP meint (nie eine veraltete)
    if (!r?.hatDatei || r.version !== wep.bauExcel?.version) return undefined
    return ladeBauExcelDatei(wep.id)
  },
}

export const lokalesZiel: SicherungsZiel = {
  belegteNummern,
  async speichereWep(wep) {
    await speichereWep(wep)
  },
  async legeInPapierkorb(eintrag) {
    await schreibeLokal({
      id: eintrag.id,
      papierkorb: eintrag,
      meta: papierkorbMeta(undefined, eintrag.id, eintrag.geloeschtAm),
      ereignis: 'geloescht',
    })
  },
  async speichereFoto(wepId, foto, bytes) {
    // Ein Foto, das hier schon liegt, bleibt, wie es ist
    if ((await fotoRecordsVon(wepId)).some((r) => r.id === foto.id && r.hatDatei)) return
    const vorschau = await erzeugeVorschau(bytes, browserBilddienst)
    await speichereFoto(
      {
        key: fotoKey(wepId, foto.id),
        wepId,
        id: foto.id,
        vorschau: new Blob([vorschau.slice().buffer], { type: 'image/jpeg' }),
        hatDatei: true,
        hochgeladen: false,
        erstelltAm: foto.aufgenommenAm,
      },
      new Blob([bytes.slice().buffer], { type: 'image/jpeg' }),
    )
  },
  async speichereBauExcel(wepId, wep, bytes) {
    const blob = new Blob([bytes.slice().buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await speichereBauExcel(
      { wepId, version: wep.bauExcel?.version ?? '', hatDatei: true, hochgeladen: false, erstelltAm: new Date().toISOString() },
      blob,
    )
  },
  async setzeEigenePositionen(eintraege) {
    lokaleEigene.speichere({ ...lokaleEigene.lade(), eintraege, wartet: true })
  },
  async setzeProfil(profil) {
    aendereProfil(profil)
  },
}
