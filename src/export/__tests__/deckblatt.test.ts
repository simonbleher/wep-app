// Deckblatt-Text (Zellen A31–A40 von „Deckbl UPV“) und Beispielwerte der Vorlage ohne Bau-Teil.
// Nur erfundene Daten; docs/WEP_Vorlage.xlsx wird nie verändert.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { erzeugeTestBauExcel } from '../../bauexcel/testBauExcel'
import { neuerWep } from '../../model'
import { Rechenwerk } from '../../pdf/formeln'
import { leseMappe } from '../../pdf/mappe'
import { sharedStrings } from '../bauExcelLesen'
import { DECKBLATT_ABSAETZE, absatzText } from '../deckblattText'
import { DECKBLATT_PLAETZE } from '../deckblatt'
import { exportWep, mitLeerenBauDaten } from '../index'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
const bytes = (b: Buffer | Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')

/** Text einer Zelle samt Fettdruck-Läufen aus der Datei (geteilter Text, auch Rich Text). */
async function zellText(zip: JSZip, zelle: string): Promise<{ text: string; fett: string }> {
  const blatt = await zip.file('xl/worksheets/sheet2.xml')!.async('string')
  const m = new RegExp(`<c r="${zelle}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(blatt)
  const v = m?.[1] && /<v>(\d+)<\/v>/.exec(m[1])
  if (!v) return { text: '', fett: '' }
  const strings = await zip.file('xl/sharedStrings.xml')!.async('string')
  const si = strings.match(/<si\b[\s\S]*?<\/si>|<si\s*\/>/g)![Number(v[1])]
  const laeufe = [...si.matchAll(/<r>([\s\S]*?)<\/r>/g)].map((r) => ({ fett: /<b\/>/.test(r[1]), text: /<t[^>]*>([\s\S]*?)<\/t>/.exec(r[1])?.[1] ?? '' }))
  const entschluessle = (t: string) => t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  if (!laeufe.length) return { text: entschluessle(/<t[^>]*>([\s\S]*?)<\/t>/.exec(si)![1]), fett: '' }
  return { text: entschluessle(laeufe.map((l) => l.text).join('')), fett: entschluessle(laeufe.filter((l) => l.fett).map((l) => l.text).join('')) }
}

describe('Deckblatt-Text im Excel-Export', () => {
  let vorlage: Buffer
  beforeAll(() => {
    vorlage = fs.readFileSync(VORLAGE)
  })

  it('A31–A40 tragen genau den Text aus deckblattText.ts, „Erklärung:“ ist fett', async () => {
    const r = await exportWep(neuerWep('2026-777'), bytes(vorlage))
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const soll: Record<string, string> = {
      A31: absatzText(DECKBLATT_ABSAETZE[0]),
      A33: `${absatzText(DECKBLATT_ABSAETZE[1])}\n${absatzText(DECKBLATT_ABSAETZE[2])}`,
      A34: absatzText(DECKBLATT_ABSAETZE[3]),
      A36: absatzText(DECKBLATT_ABSAETZE[4]),
      A37: absatzText(DECKBLATT_ABSAETZE[5]),
      A38: absatzText(DECKBLATT_ABSAETZE[6]),
      A40: absatzText(DECKBLATT_ABSAETZE[7]),
    }
    for (const [zelle, text] of Object.entries(soll)) expect((await zellText(zip, zelle)).text, zelle).toBe(text)
    expect((await zellText(zip, 'A33')).fett).toBe('Erklärung:')
    expect((await zellText(zip, 'A31')).fett).toBe('')
    // A35 gehörte zum alten Text („Änderungen der Bewertung …“) und bleibt leer
    expect((await zellText(zip, 'A35')).text).toBe('')
    // jeder Absatz kommt genau einmal vor
    expect(DECKBLATT_PLAETZE.flatMap((p) => p.absaetze).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('wörtlich: die acht Absätze der Aufgabe', () => {
    expect(DECKBLATT_ABSAETZE.map(absatzText)).toEqual([
      'Die Wertermittlung erfolgt auf der Grundlage der "Wertermittlungsrichtlinie für Kleingärten" des Landesverbandes Berlin der Gartenfreunde e.V.',
      'Erklärung: Die Wertermittler haften nicht für versteckte Mängel.',
      'Versteckte Mängel im Sinne dieses Protokolls sind Mängel an Baulichkeiten und baulichen Anlagen, die vom Wertermittler nicht eingesehen werden konnten. Dabei ist es unwichtig, ob die Einsehbarkeit wegen Wandverkleidungen innen und/oder außen (mit oder ohne Baugenehmigung), dichtem Pflanzenwuchs, eingebautem Mobiliar oder sonstigen Gegenständen behindert wurde.',
      'Dieses Protokoll ist das Ergebnis einer Momentaufnahme von Daten zum Zeitpunkt der Wertermittlung auf der Parzelle. Es ist rechtlich nicht mit einem Gutachten gleichzusetzen.',
      'Der neue Unterpächter muss das Inventar nicht übernehmen, es muss dann vom scheidenden Unterpächter entfernt werden.',
      'Wir weisen Sie darauf hin, dass die durch die Wertermittler ermittelten Beträge erst bei Neuverpachtung zur Zahlung fällig werden.',
      'Ein Widerspruch gegen diese Wertermittlung ist innerhalb von 14 Tagen schriftlich an den Bezirksverband der Gartenfreunde Pankow e.V. zu richten.',
      'Kontakt: wertermittlung@gartenfreunde-pankow.de',
    ])
  })

  it('auch mit Bau-Excel und beim Bau-Export; sonst ändert sich im Deckblatt nur A31–A40', async () => {
    const bau = await erzeugeTestBauExcel()
    for (const teil of ['gruen', 'bau'] as const) {
      const r = await exportWep(neuerWep('2026-777'), bytes(bau), { teil })
      const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
      expect((await zellText(zip, 'A40')).text, teil).toBe('Kontakt: wertermittlung@gartenfreunde-pankow.de')
      expect((await zellText(zip, 'A33')).fett, teil).toBe('Erklärung:')
      // außerhalb der Zeilen 31–40 bleibt das Blatt gleich (bis auf entfernte Zwischenwerte der Formeln)
      const vorher = await (await JSZip.loadAsync(bau)).file('xl/worksheets/sheet2.xml')!.async('string')
      const nachher = await zip.file('xl/worksheets/sheet2.xml')!.async('string')
      const ohneZeilen = (x: string) => x.replace(/<row\b[^>]*\br="(3[1-9]|40)"[\s\S]*?<\/row>/g, '').replace(/(<c\b[^>]*>\s*<f\b[^>]*?(?:\/>|>[^<]*<\/f>))\s*<v>[^<]*<\/v>/g, '$1')
      expect(ohneZeilen(nachher), teil).toBe(ohneZeilen(vorher))
    }
  })

  it('zweiter Export derselben Datei: die Texte werden nicht noch einmal angehängt', async () => {
    const erst = await exportWep(neuerWep('2026-777'), bytes(vorlage))
    const zweit = await exportWep(neuerWep('2026-777'), await erst.blob.arrayBuffer())
    const n = async (r: typeof erst) => ((await (await JSZip.loadAsync(await r.blob.arrayBuffer())).file('xl/sharedStrings.xml')!.async('string')).match(/<si\b/g) ?? []).length
    expect(await n(zweit)).toBe(await n(erst))
    expect((await sharedStrings(await JSZip.loadAsync(await zweit.blob.arrayBuffer()))).length).toBe(await n(erst))
  })

  it('docs/WEP_Vorlage.xlsx bleibt unverändert', async () => {
    const vorher = sha(vorlage)
    await exportWep(neuerWep('2026-777'), bytes(vorlage))
    expect(sha(fs.readFileSync(VORLAGE))).toBe(vorher)
  })
})

describe('Grün ohne Bau-Daten und ohne Bau-Excel: Beispielwerte der Vorlage geleert', () => {
  const wert = (rw: Rechenwerk, blatt: string, z: number, s: number) => rw.wert(blatt, z, s)

  async function rechne(mitHelfer: boolean) {
    const w = neuerWep('2026-778')
    w.gruen.aussenanlagen = [{ id: 'a', bezeichnung: 'Terrasse', anzahl: 10, einheit: 'm²', einzelpreis: 20, preisManuell: true, hinweise: [] }]
    const e = mitHelfer ? mitLeerenBauDaten(w, 'gruen', false) : { wep: w, teil: 'gruen' as const }
    const r = await exportWep(e.wep, bytes(fs.readFileSync(VORLAGE)), { teil: e.teil })
    return new Rechenwerk(await leseMappe(await r.blob.arrayBuffer()))
  }

  it('ohne den Schutz stehen die Beispielwerte noch in der Datei (so war der Fehler)', async () => {
    const rw = await rechne(false)
    expect(wert(rw, 'Baulichkeiten', 104, 6)).toBe(5) // F104 5 m³
    expect(wert(rw, 'Deckbl UPV', 25, 5)).toBe(250)
    expect(wert(rw, 'Deckbl UPV', 26, 5)).toBe(150)
    expect(wert(rw, 'Deckbl UPV', 28, 5)).toBe(200 - 250 - 150)
  })

  it('mit dem Schutz: F104/G104 leer, Fäkalien-Zeile leer, Deckblatt zieht nichts ab', async () => {
    const rw = await rechne(true)
    for (const [z, s] of [[104, 6], [104, 7]] as const) expect(wert(rw, 'Baulichkeiten', z, s) ?? null, `Baulichkeiten ${z}/${s}`).toBeNull()
    for (const s of [2, 6, 7, 8]) expect(wert(rw, 'Beseitigungskosten', 12, s) ?? null, `Beseitigung Zeile 12, Spalte ${s}`).toBeNull()
    expect(wert(rw, 'Deckbl UPV', 25, 5) ?? 0).toBe(0)
    expect(wert(rw, 'Deckbl UPV', 26, 5) ?? 0).toBe(0)
    expect(wert(rw, 'Deckbl UPV', 28, 5)).toBe(200)
  })

  it('mitLeerenBauDaten: nichts ändern, wenn Bau-Daten oder Bau-Excel da sind; sonst Grün → beides', () => {
    const w = neuerWep('x')
    expect(mitLeerenBauDaten(w, 'gruen', true)).toEqual({ wep: w, teil: 'gruen' })
    const mitBau = { ...w, bau: { ...(mitLeerenBauDaten(w, 'gruen', false).wep.bau!), beschreibung: 'x' } }
    expect(mitLeerenBauDaten(mitBau, 'gruen', false).wep).toBe(mitBau)
    expect(mitLeerenBauDaten(w, 'gruen', false).teil).toBe('beides')
    expect(mitLeerenBauDaten(w, 'bau', false).teil).toBe('bau')
    expect(w.bau).toBeUndefined() // das WEP selbst wird nicht verändert
  })
})
