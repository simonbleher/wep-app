// Beta 3, Paket 5: Formalien aus der Bau-Excel übernehmen – leere Felder füllen, bei abweichenden Werten
// je Feld wählen lassen, nie still überschreiben. Auswählen, Austauschen und „Neues WEP aus Bau-Excel“.
import { beforeAll, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { leseBauFormalien, type BauFormalien } from '@/export/bauExcelLesen'
import { neuerWep, type Wep } from '@/model'
import { LEERES_PROFIL } from '@/profil'
import { FakeBau } from '@/sync/testHilfen'
import { feldAnzeige, fuelleLeereFelder, pruefeFormalien, uebernimmFormalien, wendeAbgleichAn } from '../abgleich'
import { legeWepAusBauExcelAn } from '../neu'
import { setzeBauExcel } from '../index'
import { erzeugeTestBauExcel, TEST_FORMALIEN } from '../testBauExcel'

let bau: BauFormalien
let bytes: Uint8Array
beforeAll(async () => {
  bytes = await erzeugeTestBauExcel()
  bau = await leseBauFormalien(bytes)
})

const mitBau = (w: Wep): Wep => ({ ...w, bauExcel: { name: 'Bau.xlsx', groesse: 1, version: 'v1', hinzugefuegtAm: 'x' } })

describe('pruefeFormalien', () => {
  it('leeres WEP: alles, was die Bau-Excel ausgefüllt hat, ist neu', () => {
    const ab = pruefeFormalien(neuerWep('2026-007').formalien, bau)
    // Die Vorgangs-Nr. steht schon im neuen WEP und ist dieselbe wie in der Bau-Excel
    expect(ab.neu.map((f) => f.feld).sort()).toEqual(Object.keys(bau).filter((f) => f !== 'vorgangsNr').sort())
    expect(ab.gleich).toBe(1)
    expect(ab.unterschiede).toEqual([])
  })

  it('gleiche Werte (auch Datum als Text oder mit anderer Schreibweise) sind kein Unterschied', () => {
    const w = neuerWep('2026-007')
    w.formalien = { ...w.formalien, kleingartenanlage: ' KGA  Testgarten ', wertermittlungAm: '2026-10-14', parzellenflaecheM2: 380 }
    const ab = pruefeFormalien(w.formalien, bau)
    expect(ab.gleich).toBe(4) // dazu die Vorgangs-Nr.
    expect(ab.unterschiede).toEqual([])
    expect(ab.neu.map((f) => f.feld)).not.toContain('kleingartenanlage')
  })

  it('abweichende Werte kommen als Unterschied „Bau-Excel sagt … / im WEP steht …“', () => {
    const w = neuerWep('2026-007')
    w.formalien = { ...w.formalien, parzelle: 'Parzelle 17', wertermittlungAm: '2026-10-01', parzellenflaecheM2: 400 }
    const ab = pruefeFormalien(w.formalien, bau)
    expect(ab.unterschiede).toEqual([
      { feld: 'parzelle', name: 'Parzelle', bau: 'Parzelle 42', wep: 'Parzelle 17' },
      { feld: 'wertermittlungAm', name: 'Wertermittlung am', bau: '14.10.2026', wep: '01.10.2026' },
      { feld: 'parzellenflaecheM2', name: 'Parzellenfläche (m²)', bau: '380 m²', wep: '400 m²' },
    ])
  })

  it('was die Bau-Excel nicht ausgefüllt hat, wird nie angefasst', () => {
    const w = neuerWep('2026-007')
    w.formalien = { ...w.formalien, auftraggeber: 'Eigener Auftraggeber', anwesendAuftraggeber: 'Frau Muster' }
    const ab = pruefeFormalien(w.formalien, { parzelle: 'Parzelle 42' })
    expect(ab.neu.map((f) => f.feld)).toEqual(['parzelle'])
    expect(uebernimmFormalien(w.formalien, { parzelle: 'Parzelle 42' }, new Set()).auftraggeber).toBe('Eigener Auftraggeber')
  })

  it('feldAnzeige: Datum und Fläche lesbar', () => {
    expect(feldAnzeige('wertermittlungAm', '2026-10-14')).toBe('14.10.2026')
    expect(feldAnzeige('parzellenflaecheM2', 380.5)).toBe('380,5 m²')
    expect(feldAnzeige('weg', undefined)).toBe('')
  })
})

describe('Auswahl je Feld bei abweichenden Werten', () => {
  const wepMitAbweichung = () => {
    const w = mitBau(neuerWep('2026-007'))
    w.formalien = {
      ...w.formalien,
      parzelle: 'Parzelle 17',
      unterpaechter: 'Max Beispielmann',
      kleingartenanlage: 'KGA Testgarten',
    }
    return w
  }

  it('leere Felder werden gefüllt, abweichende bleiben stehen, bis der Nutzer wählt', () => {
    const w = fuelleLeereFelder(wepMitAbweichung(), bau)
    expect(w.formalien.weg).toBe('Rosenweg') // war leer
    expect(w.formalien.parzelle).toBe('Parzelle 17') // nicht still überschrieben
    expect(w.formalien.unterpaechter).toBe('Max Beispielmann')
    expect(w.bauExcel?.abgeglichen).toBe(false) // es gibt noch Unterschiede
  })

  it('ohne Unterschiede gilt die Bau-Excel sofort als abgeglichen', () => {
    const w = fuelleLeereFelder(mitBau(neuerWep('2026-007')), bau)
    expect(w.bauExcel?.abgeglichen).toBe(true)
    expect(w.formalien.parzelle).toBe('Parzelle 42')
  })

  it('je Feld: Bau-Excel für „Parzelle“, WEP für „Unterpächter“', () => {
    const w = wendeAbgleichAn(fuelleLeereFelder(wepMitAbweichung(), bau), bau, new Set(['parzelle'] as const))
    expect(w.formalien.parzelle).toBe('Parzelle 42')
    expect(w.formalien.unterpaechter).toBe('Max Beispielmann')
    expect(w.bauExcel?.abgeglichen).toBe(true)
  })

  it('„Alle im WEP lassen“: nichts ändert sich, aber die Frage ist beantwortet', () => {
    const vorher = fuelleLeereFelder(wepMitAbweichung(), bau)
    const w = wendeAbgleichAn(vorher, bau, new Set())
    expect(w.formalien).toEqual(vorher.formalien)
    expect(w.bauExcel?.abgeglichen).toBe(true)
  })

  it('„Alle aus der Bau-Excel“: Datum und Fläche kommen im richtigen Typ an', () => {
    const w0 = mitBau(neuerWep('2026-007'))
    w0.formalien = { ...w0.formalien, wertermittlungAm: '2026-10-01', parzellenflaecheM2: 400 }
    const alle = new Set(pruefeFormalien(w0.formalien, bau).unterschiede.map((f) => f.feld))
    const w = wendeAbgleichAn(w0, bau, alle)
    expect(w.formalien.wertermittlungAm).toBe('2026-10-14')
    expect(w.formalien.parzellenflaecheM2).toBe(380)
  })

  it('ein Feld, das nicht abweicht, lässt sich nicht „versehentlich“ überschreiben', () => {
    const w0 = mitBau(neuerWep('2026-007'))
    w0.formalien = { ...w0.formalien, parzelle: 'Parzelle 42' }
    expect(uebernimmFormalien(w0.formalien, bau, new Set(['parzelle', 'weg'] as const)).parzelle).toBe('Parzelle 42')
  })
})

describe('Bau-Excel wählen und austauschen', () => {
  const datei = (b: Uint8Array, name = 'Bau Testgarten.xlsx') => Object.assign(new Blob([b.slice().buffer]), { name })

  /** WEP-Speicher im Arbeitsspeicher für die Funktionen aus src/bauexcel. */
  function wepSpeicher(start: Wep) {
    let w = start
    return { aktuell: () => w, aendere: async (fn: (x: Wep) => Wep) => void (w = fn(w)) }
  }

  it('merkt Datei und Verweis; die Kennung ändert sich nur, wenn sich der Inhalt ändert', async () => {
    const ablage = new FakeBau()
    const s = wepSpeicher(neuerWep('2026-007'))
    const erg = await setzeBauExcel({ wepId: '2026-007', datei: datei(bytes), aendere: s.aendere, werkzeuge: { ablage, jetzt: () => 'Z1' } })
    expect(erg).toMatchObject({ unveraendert: false, ersetzt: false, bau: { parzelle: 'Parzelle 42' } })
    expect(s.aktuell().bauExcel).toMatchObject({ name: 'Bau Testgarten.xlsx', groesse: bytes.length, hinzugefuegtAm: 'Z1' })
    expect(ablage.record('2026-007')).toMatchObject({ hatDatei: true, hochgeladen: false, version: s.aktuell().bauExcel!.version })

    const neu = await erzeugeTestBauExcel({ werte: { ...TEST_FORMALIEN, E4: 'Parzelle 17' } })
    const erg2 = await setzeBauExcel({
      wepId: '2026-007',
      datei: datei(neu, 'Bau neu.xlsx'),
      aktuell: s.aktuell().bauExcel,
      aendere: s.aendere,
      werkzeuge: { ablage, jetzt: () => 'Z2' },
    })
    expect(erg2).toMatchObject({ ersetzt: true, bau: { parzelle: 'Parzelle 17' } })
    expect(s.aktuell().bauExcel?.name).toBe('Bau neu.xlsx')
    expect(ablage.record('2026-007')?.version).toBe(s.aktuell().bauExcel!.version)
  })

  it('ein Austausch führt zum selben Abgleich wie die erste Datei', async () => {
    const ablage = new FakeBau()
    const s = wepSpeicher(neuerWep('2026-007'))
    const waehle = (b: Uint8Array) =>
      setzeBauExcel({ wepId: '2026-007', datei: datei(b), aktuell: s.aktuell().bauExcel, aendere: s.aendere, werkzeuge: { ablage } })
    let erg = await waehle(bytes)
    await s.aendere((w) => fuelleLeereFelder(w, erg.bau))
    expect(s.aktuell().bauExcel?.abgeglichen).toBe(true)
    expect(s.aktuell().formalien.parzelle).toBe('Parzelle 42')

    const neu = await erzeugeTestBauExcel({ werte: { ...TEST_FORMALIEN, E4: 'Parzelle 17', E5: 'Tulpenweg' } })
    erg = await waehle(neu)
    expect(s.aktuell().bauExcel).not.toHaveProperty('abgeglichen') // die neue Fassung ist noch nicht abgeglichen
    const ab = pruefeFormalien(s.aktuell().formalien, erg.bau)
    expect(ab.unterschiede).toEqual([
      { feld: 'parzelle', name: 'Parzelle', bau: 'Parzelle 17', wep: 'Parzelle 42' },
      { feld: 'weg', name: 'Weg', bau: 'Tulpenweg', wep: 'Rosenweg' },
    ])
  })

  it('eine Datei, die keine Excel-Datei ist, wird mit verständlicher Meldung abgelehnt – nichts wird gemerkt', async () => {
    const ablage = new FakeBau()
    const s = wepSpeicher(neuerWep('2026-007'))
    await expect(
      setzeBauExcel({ wepId: '2026-007', datei: datei(new TextEncoder().encode('Hallo'), 'foto.jpg'), aendere: s.aendere, werkzeuge: { ablage } }),
    ).rejects.toThrow(/nicht als Excel-Datei/)
    expect(s.aktuell().bauExcel).toBeUndefined()
    expect(ablage.records.size).toBe(0)
  })

  it('eine Excel-Datei ohne Blatt „Formalien“ wird abgelehnt', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types/>')
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Etwas" r:id="rId1"/></sheets></workbook>')
    const leer = await zip.generateAsync({ type: 'uint8array' })
    const ablage = new FakeBau()
    const s = wepSpeicher(neuerWep('2026-007'))
    await expect(setzeBauExcel({ wepId: '2026-007', datei: datei(leer), aendere: s.aendere, werkzeuge: { ablage } })).rejects.toThrow(/Formalien/)
    expect(ablage.records.size).toBe(0)
  })

  it('dieselbe Datei erneut gewählt: unverändert, kein neuer Stand', async () => {
    const ablage = new FakeBau()
    const s = wepSpeicher(neuerWep('2026-007'))
    await setzeBauExcel({ wepId: '2026-007', datei: datei(bytes), aendere: s.aendere, werkzeuge: { ablage } })
    const vorher = s.aktuell().bauExcel
    const erg = await setzeBauExcel({ wepId: '2026-007', datei: datei(bytes), aktuell: vorher, aendere: s.aendere, werkzeuge: { ablage } })
    expect(erg.unveraendert).toBe(true)
    expect(s.aktuell().bauExcel).toEqual(vorher)
  })
})

describe('Neues WEP aus Bau-Excel', () => {
  const datei = (b: Uint8Array) => Object.assign(new Blob([b.slice().buffer]), { name: 'Bau Testgarten.xlsx' })

  it('legt das WEP an, merkt die Datei und befüllt die Formalien (Name aus dem Profil bleibt)', async () => {
    const gespeichert: Wep[] = []
    const ablage = new FakeBau()
    const w = await legeWepAusBauExcelAn({
      id: '2026-007',
      datei: datei(bytes),
      profil: { ...LEERES_PROFIL, name: 'Max Mustermann' },
      speichere: async (x) => void gespeichert.push(structuredClone(x)),
      werkzeuge: { ablage },
    })
    expect(w.id).toBe('2026-007')
    expect(w.formalien).toMatchObject({
      parzelle: 'Parzelle 42',
      unterpaechter: 'Erika Musterfrau',
      wertermittlerBaulichkeiten: 'Bert Bauer',
      wertermittlerAussenAufwuchs: 'Max Mustermann', // aus dem Profil, nicht in der Bau-Excel
      kleingartenanlage: 'KGA Testgarten', // aus der Bau-Excel
    })
    expect(w.bauExcel).toMatchObject({ name: 'Bau Testgarten.xlsx', abgeglichen: true }) // nichts zu fragen
    expect(pruefeFormalien(w.formalien, bau).unterschiede).toEqual([])
    expect(ablage.record('2026-007')?.hatDatei).toBe(true)
    expect(gespeichert.at(-1)).toEqual(w)
  })

  it('eine unbrauchbare Datei legt kein WEP an', async () => {
    const gespeichert: Wep[] = []
    await expect(
      legeWepAusBauExcelAn({
        id: '2026-008',
        datei: datei(new TextEncoder().encode('kein Excel')),
        profil: LEERES_PROFIL,
        speichere: async (x) => void gespeichert.push(x),
        werkzeuge: { ablage: new FakeBau() },
      }),
    ).rejects.toThrow(/Excel/)
    expect(gespeichert).toEqual([])
  })
})
