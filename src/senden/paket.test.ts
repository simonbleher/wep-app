import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { neuerWep, neueWepId } from '@/model'
import { baueBvPaket, paketName } from './paket'

describe('An den BV senden: Paket', () => {
  it('Name aus Vorgangs-Nr., Anlage und Parzelle; ohne Nummer erkennbar', () => {
    const w = neuerWep(neueWepId())
    w.formalien = { ...w.formalien, vorgangsNr: '2026-152', kleingartenanlage: 'Rosenthal-Süd', parzelle: '42' }
    expect(paketName(w)).toBe('2026-152_Rosenthal-Süd_Parzelle_42_an-BV.zip')
    expect(paketName({ ...w, formalien: { ...w.formalien, vorgangsNr: '', parzelle: '' } })).toBe('ohne-Vorgangs-Nr_Rosenthal-Süd_an-BV.zip')
    expect(paketName({ ...w, formalien: { ...w.formalien, kleingartenanlage: 'A/B: "x"' } })).toBe('2026-152_A_B_x_Parzelle_42_an-BV.zip')
  })

  it('PDFs und WEP-Datei an der Wurzel, Fotos im Ordner „Fotos“', async () => {
    const blob = await baueBvPaket({
      pdfs: [{ name: '2026-152_WEP_uebersichtlich.pdf', daten: new Uint8Array([1, 2]) }],
      wepDatei: { name: '2026-152_Rosenthal-Süd.wep', daten: new Uint8Array([3]) },
      fotos: [{ name: '01_Laube.jpg', daten: new Uint8Array([4, 5, 6]) }],
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()).toEqual(['2026-152_Rosenthal-Süd.wep', '2026-152_WEP_uebersichtlich.pdf', 'Fotos/01_Laube.jpg'])
    expect([...(await zip.file('Fotos/01_Laube.jpg')!.async('uint8array'))]).toEqual([4, 5, 6])
  })
})
