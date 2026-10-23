// WEP-Datei einspielen. Neu und „als Kopie“ laufen über das Einspielen der Sicherung; bei Abweichung wird
// das lokale WEP nur um die gewählten Teile ergänzt. Nichts wird ohne ausdrückliche Wahl überschrieben.
import type { Foto, Wep } from '@/model'
import { spieleEin, type EinspielErgebnis, type SicherungsQuelle, type SicherungsZiel } from '@/sicherung'
import type { GeleseneTeilen } from './lesen'
import type { TeilenVorschau, TeilenWahl } from './vorschau'
import type { TeilId } from './types'

export interface TeilenErgebnis extends EinspielErgebnis {
  /** Bei Abweichung: die Teile, die übernommen wurden. */
  teile: TeilId[]
}

export async function spieleTeilenEin(opt: {
  gelesen: GeleseneTeilen
  vorschau: TeilenVorschau
  wahl: TeilenWahl
  lokal: SicherungsQuelle
  ziel: SicherungsZiel
  jetzt?: () => string
}): Promise<TeilenErgebnis> {
  const { gelesen, vorschau: v, wahl, lokal, ziel } = opt
  const p = v.punkt
  const schluessel = p.schluessel

  // Neu, im Papierkorb, oder bewusst als neues WEP: genau wie bei der Sicherung
  if (p.status !== 'anders' || wahl.wep === 'kopie') {
    const e = await spieleEin({
      sicherung: gelesen.sicherung,
      vorschau: v.basis,
      wahl: { [schluessel]: wahl.wep },
      lokal,
      ziel,
      jetzt: opt.jetzt,
    })
    return { ...e, teile: [] }
  }

  const e: TeilenErgebnis = { weps: [], papierkorb: 0, eigene: 0, profil: false, fotos: 0, fotosFehlen: 0, bauExcel: 0, fehler: [], teile: [] }
  if (wahl.wep !== 'uebernehmen') return e
  const datei: Wep = gelesen.daten.wep
  const hier = (await lokal.weps()).find((w) => w.wep.id === datei.id)?.wep
  if (!hier) {
    e.fehler.push(`${datei.id}: Das WEP ist auf diesem Gerät nicht mehr vorhanden.`)
    return e
  }
  // Nur Teile, die die Vorschau anbietet und die gewählt sind
  const gewaehlt = v.teile.map((t) => t.teil).filter((t) => wahl.teile[t] === 'uebernehmen')
  if (gewaehlt.length === 0) return e

  let neu: Wep = { ...hier }
  try {
    for (const teil of gewaehlt) {
      if (teil === 'formalien') {
        neu = { ...neu, formalien: datei.formalien }
        if (datei.status !== undefined) neu.status = datei.status
        else delete neu.status
        if (datei.rolle !== undefined) neu.rolle = datei.rolle
        else delete neu.rolle
      } else if (teil === 'bau') {
        neu = { ...neu, bau: datei.bau }
        if (datei.grundriss !== undefined) neu.grundriss = datei.grundriss
        else delete neu.grundriss
      } else if (teil === 'gruen') {
        neu = { ...neu, gruen: datei.gruen }
        if (datei.skizze !== undefined) neu.skizze = datei.skizze
        else delete neu.skizze
      } else if (teil === 'fotos') {
        const vorhanden = new Set((neu.fotos ?? []).map((f) => f.id))
        const dazu: Foto[] = []
        for (const foto of datei.fotos ?? []) {
          if (vorhanden.has(foto.id)) continue
          const bytes = await gelesen.sicherung.foto(datei.id, foto.id)
          if (!bytes) {
            e.fotosFehlen++
            continue
          }
          await ziel.speichereFoto(datei.id, foto, bytes)
          dazu.push(foto)
          e.fotos++
        }
        if (dazu.length) neu = { ...neu, fotos: [...(neu.fotos ?? []), ...dazu] }
      } else if (teil === 'bauExcel' && datei.bauExcel) {
        const bytes = await gelesen.sicherung.bauExcel(datei.id)
        if (!bytes) continue
        neu = { ...neu, bauExcel: datei.bauExcel }
        await ziel.speichereBauExcel(datei.id, neu, bytes)
        e.bauExcel++
      } else {
        continue
      }
      e.teile.push(teil)
    }
    // Dateien liegen schon; erst jetzt zeigt das WEP darauf
    if (e.teile.length > 0) {
      await ziel.speichereWep(neu)
      e.weps.push({ id: datei.id, ersetzt: true })
    }
  } catch (err) {
    e.fehler.push(`${datei.id}: ${err instanceof Error ? err.message : String(err)}`)
  }
  return e
}
