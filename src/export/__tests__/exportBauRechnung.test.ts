// Wichtigster Test des Bau-Teils (Beta 4, Paket 2): Die App rechnet dasselbe wie die Formeln der Vorlage.
// Jeder Fall (erfundene Daten) wird exportiert, mit LibreOffice neu berechnet, und die Zellen der Vorlage
// (Zwischenwerte, Wert je Bauteil, Summe „Baulichkeiten insgesamt“, Deckblatt) werden mit `berechneBau` verglichen.
// Ohne LibreOffice wird der Test übersprungen (wie die übrigen LibreOffice-Tests).
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { exportWep } from '../index'
import { blattPfadNachName, sharedStrings } from '../bauExcelLesen'
import { neuerWep, neueBauDaten, type Bauteil, type Wep, type BauDaten, type MangelAbzug } from '../../model'
import { berechneBau, kuerzelFuer, type BauErgebnis } from '../../bau'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')

function libreOfficeDa(): boolean {
  try {
    execSync('libreoffice --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
const LO = libreOfficeDa()

// ---------------------------------------------------------------------------
// Baukasten für Fälle
// ---------------------------------------------------------------------------

let zaehler = 0
function bt(art: Bauteil['art'], bisher: Bauteil[], o: Partial<Bauteil> = {}): Bauteil {
  return { id: `t${++zaehler}`, art, kuerzel: kuerzelFuer(art, bisher), flaeche: 0, maengel: [], ...o }
}
const mangel = (gruppe: string, abzug: number, text = 'Beispiel'): MangelAbzug => ({ gruppe, maengel: [text], abzug, begruendung: 'erfundener Befund' })

interface Fall {
  name: string
  jahr: number
  bau: (b: BauDaten) => void
  /** Vorlagenfehler im Export korrigieren (Standard) */
  korrigieren?: boolean
}

function bauMit(f: (liste: Bauteil[], bau: BauDaten) => void): (b: BauDaten) => void {
  return (bau) => f(bau.bauteile, bau)
}

const FAELLE: Fall[] = [
  {
    name: 'Normalfall: Laube Holz 12 cm, Mängel, Anbau, Schuppen, Gewächshaus',
    jahr: 2025,
    bau: bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 16, baujahr: 1998, material: 'holz-doppelwandig', wanddickeCm: 12, maengel: [mangel('dach', 8), mangel('waende', 5)] }))
      l.push(bt('anbau', l, { flaeche: 4, baujahr: 2005, material: 'holz-doppelwandig', wanddickeCm: 6, maengel: [mangel('fussboden', 3)] }))
      l.push(bt('schuppen', l, { flaeche: 6, baujahr: 2010, material: 'blech', rnManuell: true, restnutzungsjahre: 12 }))
      l.push(bt('gewaechshaus', l, { flaeche: 8, hoehe: 2, baujahr: 2018, minderungProJahr: 5, maengel: [mangel('unfertig', 10)] }))
      bau.ausstattung = { wasser: 'fehlt', wc: 'trockentoilette', strom: 'vorhanden' }
    }),
  },
  {
    name: 'Grenzfall 24 m² genau (nichts wird gekürzt)',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 24, baujahr: 2000, material: 'stein', wanddickeCm: 20 }))
    }),
  },
  {
    name: 'Grenzfall 24,01 m² (0,01 m² nicht berechnet)',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 24.01, baujahr: 2000, material: 'stein', wanddickeCm: 20 }))
    }),
  },
  {
    name: 'Laube 30 m² mit Anbauten A1, A2 und Vorplatz: alles über 24 m² nicht berechnet',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 30, baujahr: 1990, material: 'holz-doppelwandig', wanddickeCm: 16 }))
      l.push(bt('anbau', l, { flaeche: 4, baujahr: 1995, material: 'holz-doppelwandig', wanddickeCm: 9 }))
      l.push(bt('anbau', l, { flaeche: 3, baujahr: 1995, material: 'holz-doppelwandig', wanddickeCm: 9 }))
      l.push(bt('vorplatz', l, { flaeche: 6, baujahr: 2000, vorplatzLage: 'integriert' }))
    }),
  },
  {
    name: 'Anbauten A1 + A2 und Schuppen (prüft die korrigierten Formeln der Vorlage C33, K81)',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 12, baujahr: 2001, material: 'stein', wanddickeCm: 12, maengel: [mangel('dach', 10)] }))
      l.push(bt('anbau', l, { flaeche: 5, baujahr: 2003, material: 'stein', wanddickeCm: 10, maengel: [mangel('decken', 2)] }))
      l.push(bt('anbau', l, { flaeche: 5, baujahr: 2004, material: 'holz-doppelwandig', wanddickeCm: 7, maengel: [mangel('waende', 4)] }))
      l.push(bt('schuppen', l, { flaeche: 7, baujahr: 2012, material: 'holz-doppelwandig', wanddickeCm: 3, maengel: [mangel('dach', 5)] }))
    }),
  },
  {
    name: 'dasselbe ohne Korrektur der Vorlagenfehler (App und Excel weichen wie dokumentiert ab)',
    jahr: 2025,
    korrigieren: false,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 12, baujahr: 2001, material: 'stein', wanddickeCm: 12 }))
      l.push(bt('anbau', l, { flaeche: 5, baujahr: 2003, material: 'stein', wanddickeCm: 10 }))
      l.push(bt('anbau', l, { flaeche: 5, baujahr: 2004, material: 'holz-doppelwandig', wanddickeCm: 7 }))
      l.push(bt('schuppen', l, { flaeche: 7, baujahr: 2012, material: 'holz-doppelwandig', wanddickeCm: 3 }))
    }),
  },
  {
    name: 'wirtschaftlich abgeschrieben: alte Laube Bauklasse IV, Gewächshaus 20 Jahre × 5 %',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 14, baujahr: 1960, material: 'holz-einwandig', wanddickeCm: 2 }))
      l.push(bt('gewaechshaus', l, { flaeche: 6, baujahr: 2006, minderungProJahr: 5 }))
    }),
  },
  {
    name: 'abgeschrieben, aber Restnutzung vom Wertermittler auf 5 Jahre festgelegt (Bauklasse IV)',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 14, baujahr: 1960, material: 'holz-einwandig', wanddickeCm: 2, rnManuell: true, restnutzungsjahre: 5, rnBegruendung: 'gepflegt' }))
    }),
  },
  {
    name: 'fehlende Bauklasse (kein Material) und Anbau mit „fehlt“',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 15, baujahr: 1999 }))
      l.push(bt('anbau', l, { flaeche: 3, baujahr: 1999, typ: 'fehlt', typManuell: true }))
    }),
  },
  {
    name: 'widerrechtliches Bauteil wird nicht bewertet',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 20, baujahr: 1999, material: 'stein', wanddickeCm: 20, nichtBewerten: true }))
    }),
  },
  {
    name: 'Restnutzung hinter dem Tabellenende (Bauklasse IV, 45 Jahre): Excel rechnet 0 % Abzug',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2020, material: 'holz-doppelwandig', wanddickeCm: 3, rnManuell: true, restnutzungsjahre: 45 }))
    }),
  },
  {
    name: 'Restnutzung 7,9 Jahre wird abgerundet, Keller (Bauklasse II) wird auf die Restnutzung der Laube begrenzt',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 12, baujahr: 2005, material: 'stein', wanddickeCm: 12, rnManuell: true, restnutzungsjahre: 7.9 }))
      l.push(bt('keller', l, { flaeche: 9, baujahr: 2005, material: 'stein', wanddickeCm: 12, genehmigt: true }))
    }),
  },
  {
    name: 'Vorplatz integriert (Regelwert nach Bauklasse der Laube) mit Mängeln',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 14, baujahr: 2008, material: 'stein', wanddickeCm: 18, maengel: [mangel('dach', 6), mangel('beraeumt', 10)] }))
      l.push(bt('vorplatz', l, { flaeche: 5, baujahr: 2008, vorplatzLage: 'integriert' }))
    }),
  },
  {
    name: 'Vorplatz angebaut, hochwertig, 8 Jahre × 5 %, Mängel 10 %',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 14, baujahr: 2008, material: 'holz-doppelwandig', wanddickeCm: 12 }))
      l.push(bt('vorplatz', l, { flaeche: 6, baujahr: 2018, vorplatzLage: 'angebaut', vorplatzGuete: 'hochwertig', minderungProJahr: 5, maengel: [mangel('eigen', 10)] }))
    }),
  },
  {
    name: 'Vorplatz angebaut, minderwertig, abgeschrieben (Alter × Minderung ≥ 100 %)',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2008, material: 'stein', wanddickeCm: 12 }))
      l.push(bt('vorplatz', l, { flaeche: 4, baujahr: 2000, vorplatzLage: 'angebaut', vorplatzGuete: 'minderwertig', minderungProJahr: 5 }))
    }),
  },
  {
    name: 'Abwassersammelgrube: Kunststoff 5 m³, 2012, Nachweis vorhanden, nicht geleert (Alter über 16 Jahre gedeckelt)',
    jahr: 2030,
    bau: bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2008, material: 'stein', wanddickeCm: 12 }))
      bau.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'kunststoff', inhaltM3: 5, baujahr: 2000, genehmigtAm: '2000-05-01', genehmigungNr: 'G-17', dichtheitAm: '2029-03-02', nichtGeleert: true } }
      bau.index = { jahr: 2030, wert: 190, quelle: 'erfunden', manuell: true }
    }),
  },
  {
    name: 'Abwassersammelgrube Schachtringe 3,5 m³, Dichtheitsnachweis fehlt → keine Bewertung',
    jahr: 2025,
    bau: bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2008, material: 'stein', wanddickeCm: 12 }))
      bau.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'schachtringe', inhaltM3: 3.5, baujahr: 1995, dichtheitFehlt: true } }
    }),
  },
  {
    name: 'Abwassersammelgrube Schachtringe 60 Jahre alt (nie unter 0 €)',
    jahr: 2025,
    bau: bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2008, material: 'stein', wanddickeCm: 12 }))
      bau.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'schachtringe', inhaltM3: 3, baujahr: 1965, dichtheitAm: '2025-01-10' } }
    }),
  },
  {
    name: 'Grube nicht betriebsfähig → Beseitigung, keine Bewertung',
    jahr: 2025,
    bau: bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2008, material: 'stein', wanddickeCm: 12 }))
      bau.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'beton', inhaltM3: 4, baujahr: 2001, dichtheitAm: '2025-01-10', zuBeseitigen: true, nichtGeleert: true, abfuhrBescheinigungAm: '2024-02-03' } }
      bau.beseitigung = [
        { id: 'x1', gegenstand: 'Einbehalt für Fäkalienabfuhr, wenn Grube bei der WE nicht geleert ist', menge: 1, einheit: 'pauschal', einzelpreis: 150, faktor: 1 },
        { id: 'x2', gegenstand: 'Abwassergrube entfernen und verfüllen', menge: 4, einheit: 'm³', einzelpreis: 250, faktor: 1 },
      ]
    }),
  },
  {
    name: 'Kanalanschluss: Erstellungspreis 1.800 €, 20 Jahre',
    jahr: 2025,
    bau: bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2008, material: 'stein', wanddickeCm: 12 }))
      bau.abwasser = { art: 'kanal', grube: {}, kanal: { baujahr: 2006, kosten: 1800 } }
    }),
  },
  {
    name: 'Kanalanschluss: Erstellungspreis 3.000 € (gedeckelt auf 2.200 €), erstellt im Jahr der Wertermittlung',
    jahr: 2025,
    bau: bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2008, material: 'stein', wanddickeCm: 12 }))
      bau.abwasser = { art: 'kanal', grube: {}, kanal: { baujahr: 2025, kosten: 3000 } }
    }),
  },
  {
    name: 'Laube nicht beräumt (4 m³ × 100 €) und Beseitigung mit Faktor',
    jahr: 2025,
    bau: bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 12, baujahr: 2008, material: 'stein', wanddickeCm: 12, maengel: [mangel('beraeumt', 10)] }))
      bau.nichtBeraeumt = { aktiv: true, m3: 4, preis: 100 }
      bau.beseitigung = [
        { id: 'b1', gegenstand: 'Rückbau Anbau1 s. - Skizze Bau', menge: 12.5, einheit: 'm³', einzelpreis: 120, faktor: 1.5, begruendung: 'lange Wegstrecke' },
        { id: 'b2', gegenstand: 'Schornsteinmauerwerk fachgerecht entsorgen.', menge: 1, einheit: 'Stück', einzelpreis: 250, faktor: 1 },
        { id: 'b3', gegenstand: 'Rückbau LVP komplett Ü1 ohne Bodenplatte  s. -Skizze Bau', menge: 7.5, einheit: 'm²', einzelpreis: 100, faktor: 1 },
      ]
    }),
  },
  {
    name: 'Baupreisindex 2026 fehlt in der Tabelle: Ersatzwert des Vorjahres',
    jahr: 2026,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 12, baujahr: 2008, material: 'stein', wanddickeCm: 24 }))
    }),
  },
  {
    name: 'Typenlaube GL (immer IV.1) mit Baujahr im Wertermittlungsjahr',
    jahr: 2025,
    bau: bauMit((l) => {
      l.push(bt('laube', l, { flaeche: 10, baujahr: 2025, material: 'holz-doppelwandig', wanddickeCm: 8, typenlaube: true }))
    }),
  },
]

// ---------------------------------------------------------------------------
// Vorlage ausfüllen, mit LibreOffice rechnen lassen, Zellen lesen
// ---------------------------------------------------------------------------

type Zellen = Record<string, Record<string, number | string>>
const ergebnisse: { fall: Fall; wep: Wep; erg: BauErgebnis; zellen: Zellen; korrekturen: number }[] = []

const BLAETTER = { b: 'Baulichkeiten', m: 'Mängelliste', k: 'Beseitigungskosten', d: 'Deckbl UPV' } as const

async function lies(zip: JSZip): Promise<Zellen> {
  const geteilt = await sharedStrings(zip)
  const aus: Zellen = {}
  for (const [kurz, name] of Object.entries(BLAETTER)) {
    const pfad = await blattPfadNachName(zip, name, '')
    const xml = await zip.file(pfad)!.async('string')
    const z: Record<string, number | string> = {}
    for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = /<v>([^<]*)<\/v>/.exec(m[3] ?? '')?.[1]
      if (v === undefined) continue
      const t = /\bt="(\w+)"/.exec(m[2])?.[1]
      z[m[1]] = t === 's' ? (geteilt[Number(v)] ?? '') : t === 'str' || t === 'e' ? v : Number(v)
    }
    aus[kurz] = z
  }
  return aus
}

beforeAll(async () => {
  if (!LO) return
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wep-bau-'))
  const eingang = path.join(tmp, 'in')
  const ausgang = path.join(tmp, 'out')
  fs.mkdirSync(eingang)
  fs.mkdirSync(ausgang)
  const b = fs.readFileSync(VORLAGE)
  const vorlage = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  const dateien: string[] = []
  const wepListe: { fall: Fall; wep: Wep; korrekturen: number }[] = []
  for (const [i, fall] of FAELLE.entries()) {
    const wep = neuerWep(`2026-${900 + i}`)
    wep.formalien.wertermittlungAm = `${fall.jahr}-06-15`
    wep.formalien.kleingartenanlage = 'KGA Testhain'
    wep.formalien.unterpaechter = 'Erika Musterfrau'
    wep.bau = neueBauDaten()
    fall.bau(wep.bau)
    const r = await exportWep(wep, vorlage, { teil: 'bau', vorlagenfehlerKorrigieren: fall.korrigieren !== false })
    const datei = path.join(eingang, `fall${String(i).padStart(2, '0')}.xlsx`)
    fs.writeFileSync(datei, Buffer.from(await r.blob.arrayBuffer()))
    dateien.push(datei)
    wepListe.push({ fall, wep, korrekturen: r.bau?.korrekturen.length ?? 0 })
  }
  // eigenes Profil: läuft auch neben anderen LibreOffice-Tests (gemeinsames Profil sperrt sich gegenseitig)
  execFileSync('libreoffice', [`-env:UserInstallation=file://${path.join(tmp, 'profil')}`, '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', ausgang, ...dateien], { stdio: 'pipe', timeout: 280000 })
  for (const [i, e] of wepListe.entries()) {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(ausgang, `fall${String(i).padStart(2, '0')}.xlsx`)))
    ergebnisse.push({ ...e, erg: berechneBau(e.wep)!, zellen: await lies(zip) })
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}, 300000)

const gleich = (z: Zellen, blatt: keyof typeof BLAETTER, zelle: string, soll: number, was: string) => {
  const ist = z[blatt][zelle]
  expect(typeof ist === 'number' ? ist : Number(ist ?? 0), `${was} (${BLAETTER[blatt]}!${zelle})`).toBeCloseTo(soll, 6)
}

describe.skipIf(!LO)('App-Rechnung = Excel-Rechnung (LibreOffice)', () => {
  it('alle Fälle wurden gerechnet', () => {
    expect(ergebnisse).toHaveLength(FAELLE.length)
  })

  for (const [i, fall] of FAELLE.entries()) {
    it(fall.name, () => {
      const { erg, zellen: z } = ergebnisse[i]
      const ohneKorrektur = fall.korrigieren === false
      const c = (zelle: string, soll: number, was: string) => gleich(z, 'b', zelle, soll, was)

      c('H7', erg.index?.wert ?? 0, 'Baupreisindex')
      // Laube
      const hauptBloecke: [string[], (typeof erg.laube)][] = [
        [['C14', 'H14', 'E15', 'H15', 'H16', 'A17', 'E17', 'I19', 'E14'], erg.laube],
        [['C23', 'H23', 'E24', 'H24', 'H25', 'A26', 'E26', 'I28', 'E23'], erg.anbauten[0]],
        [['C32', 'H32', 'E33', 'H33', 'H34', 'A35', 'E35', 'I37', 'E32'], erg.anbauten[1]],
        [['C49', 'H49', 'E50', 'H50', 'H51', 'A52', 'E52', 'I-', 'E49'], erg.schuppen],
      ]
      for (const [[nhk, nachM, abzug, nachA, proM2, flaeche, wert, nicht, maengel], e] of hauptBloecke) {
        // Für A2 rechnet die Vorlage ohne Korrektur mit dem Ergebnis von A1 (C33 = H23): dort weichen Zwischenwerte ab
        const a2 = nhk === 'C32' && ohneKorrektur
        c(nhk, e?.nhk ?? 0, 'NHK')
        c(maengel, e?.maengelProzent ?? 0, 'Mängelabzug %')
        c(nachM, e?.nachMaengeln ?? 0, 'nach Mängelabzug')
        c(abzug, e?.altersabzugProzent ?? 0, 'Altersabzug %')
        if (!a2) {
          c(nachA, e?.nachAlter ?? 0, 'nach Altersabzug')
          c(proM2, e?.wertProM2 ?? 0, '€/m²')
          c(wert, e?.wert ?? 0, 'Wert Bauteil')
        }
        c(flaeche, e?.flaeche ?? 0, 'Fläche')
        if (nicht !== 'I-') c(nicht, e?.nichtBerechnet ?? 0, 'nicht berechnete Fläche')
      }
      // Gewächshaus
      const g = erg.gewaechshaus
      c('I41', g?.nachMaengeln ?? 0, 'Gewächshaus nach Mängeln')
      c('E42', g?.altersabzugProzent ?? 0, 'Gewächshaus Altersabzug %')
      c('C43', g?.nachAlter ?? 0, 'Gewächshaus nach Alter')
      c('I43', g?.wertProM2 ?? 0, 'Gewächshaus €/m²')
      c('K44', g?.wert ?? 0, 'Gewächshaus Wert')
      // Vorplatz
      const v = erg.vorplatz
      c('I70', v?.wertProM2 ?? 0, 'Vorplatz €/m²')
      c('F71', v?.flaeche ?? 0, 'Vorplatz Fläche')
      c('K71', v?.wert ?? 0, 'Vorplatz Wert')
      // Abwasser
      if (erg.grube) {
        c('C75', erg.grube.altersabzugProzent, 'Grube Altersabzug %')
        c('F75', erg.grube.wertProM3, 'Grube €/m³')
      }
      c('K75', erg.grube?.wert ?? 0, 'Grube Wert')
      c('K77', erg.grube?.nichtGeleertAbzug ?? 0, 'nicht geleert')
      c('K79', erg.kanal?.wert ?? 0, 'Kanal Wert')
      // Summen
      c('I38', erg.nichtBerechneteFlaeche, 'nicht berechnete Flächen')
      c('F101', erg.bewerteteFlaeche, 'bewertete Fläche')
      c('H104', erg.nichtBeraeumtKosten, 'nicht beräumt')
      if (!ohneKorrektur) {
        c('K53', erg.summeBauteile, 'Zwischensumme')
        c('K81', erg.insgesamt, 'Baulichkeiten insgesamt')
        gleich(z, 'd', 'E21', erg.insgesamt, 'Deckblatt Baulichkeiten')
      }
      gleich(z, 'k', 'K24', erg.beseitigungSumme, 'Beseitigung Bau')
      gleich(z, 'd', 'E25', erg.nichtBeraeumtKosten, 'Deckblatt nicht beräumt')
      gleich(z, 'd', 'E26', erg.beseitigungSumme, 'Deckblatt Beseitigung Bau')
      // Mängelliste: Gesamtabzug der Laube
      const laubeMaengel = erg.laube?.maengelProzent ?? 0
      gleich(z, 'm', 'F46', laubeMaengel, 'Gesamtabzug Mängelliste')
    })
  }

  it('ohne Korrektur: die Vorlage weicht wie dokumentiert ab (Schuppen doppelt, A2 mit Ergebnis von A1)', () => {
    const idx = FAELLE.findIndex((f) => f.korrigieren === false)
    const { erg, zellen: z } = ergebnisse[idx]
    const ex = (zelle: string) => Number(z.b[zelle] ?? 0)
    // K81 der Vorlage zählt den Schuppen (K52) doppelt
    expect(ex('K81')).toBeCloseTo(erg.insgesamt + (erg.schuppen?.wert ?? 0) + (ex('C33') !== (erg.anbauten[1]?.nachMaengeln ?? 0) ? ex('E35') - (erg.anbauten[1]?.wert ?? 0) : 0), 2)
    expect(ex('E35')).not.toBeCloseTo(erg.anbauten[1]!.wert, 2)
  })

  it('Plausibilität: die Fälle rechnen echte Beträge (kein Vergleich von 0 mit 0)', () => {
    const werte = ergebnisse.map((e) => e.erg.insgesamt)
    // Normalfall, 24-m²-Fälle, Anbauten, Vorplatz, Abwasser: deutlich über 0 €
    for (const i of [0, 1, 2, 3, 4, 12, 13, 14, 16, 18, 19, 21, 22]) expect(werte[i], FAELLE[i].name).toBeGreaterThan(100)
    expect(Number(ergebnisse[0].zellen.b.K81)).toBeCloseTo(werte[0], 2)
    expect(Number(ergebnisse[1].zellen.b.C14)).toBe(515)
    expect(ergebnisse[1].zellen.b.F12).toBe('I.1')
    expect(ergebnisse[0].zellen.b.F12).toBe('III.1')
    // wirtschaftlich abgeschrieben: Wert 0, Excel sagt es auch
    expect(werte[6]).toBe(0)
    expect(Number(ergebnisse[6].zellen.b.E15)).toBe(100)
  })

  it('der Export nennt seine Korrekturen der Vorlage', () => {
    const idx = FAELLE.findIndex((f) => f.name.startsWith('Anbauten A1 + A2'))
    expect(ergebnisse[idx].korrekturen).toBeGreaterThanOrEqual(4)
    const ohne = FAELLE.findIndex((f) => f.korrigieren === false)
    expect(ergebnisse[ohne].korrekturen).toBe(0)
  })
})
