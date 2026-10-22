// Baubeschreibung: Vorschlag aus den Bauteil-Daten (Freitext, der Wertermittler kann ihn jederzeit ändern).
// Richtlinie S. 24: Vorhandensein bzw. Fehlen von Wasseranschluss, WC/Trockentoilette und Elektrizität vermerken;
// S. 4 Nr. 8 und S. 8: Mängelabzüge genau bezeichnen und textlich erläutern.
import type { Bauteil, Wep } from '../model'
import { MAENGEL_GRUPPEN } from './tabellen'
import { berechneBau, mangelProzent, nhkEintrag, typFuer, type BauOptionen } from './rechnen'

const zahl = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
const BAUTEIL_NAME: Record<Bauteil['art'], string> = {
  laube: 'Laube',
  anbau: 'Anbau',
  schuppen: 'Schuppen',
  gewaechshaus: 'Gewächshaus',
  vorplatz: 'Überdachter Laubenvorplatz',
  keller: 'Keller',
}
const MATERIAL_TEXT: Record<NonNullable<Bauteil['material']>, string> = {
  stein: 'Stein',
  'holz-doppelwandig': 'Holz, doppelwandig',
  'holz-einwandig': 'Holz, einwandig',
  blockhaus: 'Blockhaus',
  blech: 'Blech',
}

function maengelText(b: Bauteil): string {
  const teile = b.maengel
    .filter((m) => m.abzug > 0 || m.maengel.length)
    .map((m) => {
      const g = MAENGEL_GRUPPEN.find((x) => x.id === m.gruppe)
      const name = g ? g.name : 'sonstige Mängel'
      const was = m.maengel.length ? ` (${m.maengel.join('; ')})` : ''
      const warum = m.begruendung.trim() ? `, ${m.begruendung.trim()}` : ''
      return `${name} ${zahl(m.abzug)} %${was}${warum}`
    })
  if (!teile.length) return ''
  return `Mängelabzug ${zahl(mangelProzent(b))} %: ${teile.join('; ')}.`
}

function bauteilZeile(b: Bauteil, erg: ReturnType<typeof berechneBau>): string {
  const kopf = `${BAUTEIL_NAME[b.art]} ${b.kuerzel}${b.bezeichnung ? ` (${b.bezeichnung})` : ''}`
  const t: string[] = []
  if (b.laenge && b.breite) t.push(`${zahl(b.laenge)} × ${zahl(b.breite)} m (Außenmaße) = ${zahl(b.flaeche)} m²`)
  else if (b.flaeche > 0) t.push(`${zahl(b.flaeche)} m²`)
  if (b.hoehe) t.push(`${b.art === 'gewaechshaus' ? 'Firsthöhe' : 'Höhe'} ${zahl(b.hoehe)} m`)
  if (b.material) t.push(`${MATERIAL_TEXT[b.material]}${b.wanddickeCm ? `, Wanddicke ${zahl(b.wanddickeCm)} cm` : ''}`)
  const e = nhkEintrag(typFuer(b))
  if (e) t.push(`Bauklasse ${e.bauklasse}`)
  if (b.typenlaube) t.push('Typenlaube')
  if (b.baujahr) t.push(`Baujahr ${b.baujahr}${b.baujahrQuelle ? ` (${b.baujahrQuelle})` : ''}`)
  const ergBt = [erg?.laube, ...(erg?.anbauten ?? []), erg?.schuppen].find((x) => x?.bauteil.id === b.id)
  if (ergBt?.restnutzungsjahre !== undefined && ergBt.spalte !== 5) {
    t.push(`Restnutzungsdauer ${ergBt.restnutzungsjahre} Jahre${b.rnBegruendung?.trim() ? ` (${b.rnBegruendung.trim()})` : ''}`)
  }
  if (b.art === 'vorplatz') t.push((b.vorplatzLage ?? 'integriert') === 'integriert' ? 'in die Laube integriert (verlängertes Dach)' : `angebaut, Güte ${b.vorplatzGuete ?? 'ohne'}`)
  if (b.nichtBewerten) t.push('wird nicht bewertet (widerrechtlich bzw. nicht mehr nutzbar), Rückbau')
  if (b.art === 'keller') t.push(b.genehmigt ? 'Zustimmung/Genehmigung liegt vor' : 'Zustimmung/Genehmigung liegt nicht vor')
  const mt = b.nichtBewerten ? '' : maengelText(b)
  return [`${kopf}: ${t.join(', ')}.`, mt, b.notiz?.trim() ?? ''].filter(Boolean).join(' ')
}

/** Vorschlag für die Baubeschreibung (ein Absatz je Bauteil, dann Ausstattung, Abwasser, Nicht beräumt). */
export function schlageBaubeschreibungVor(wep: Pick<Wep, 'bau' | 'formalien'>, optionen: BauOptionen = {}): string {
  const bau = wep.bau
  if (!bau) return ''
  const erg = berechneBau(wep, optionen)
  const zeilen = bau.bauteile.map((b) => bauteilZeile(b, erg))
  const a = bau.ausstattung
  const ausst: string[] = []
  if (a.wasser) ausst.push(`Wasseranschluss ${a.wasser}`)
  if (a.wc) ausst.push(a.wc === 'wc' ? 'WC vorhanden' : a.wc === 'trockentoilette' ? 'Trockentoilette vorhanden' : 'WC/Trockentoilette fehlt')
  if (a.strom) ausst.push(`Elektrizitätsanschluss ${a.strom}`)
  if (ausst.length) zeilen.push(`Ausstattung: ${ausst.join(', ')}.`)
  const ab = bau.abwasser
  if (ab.art === 'grube') {
    const g = ab.grube
    const t = [`Abwassersammelgrube${g.inhaltM3 ? ` ${zahl(g.inhaltM3)} m³` : ''}`]
    if (g.genehmigtAm) t.push(`genehmigt am ${datum(g.genehmigtAm)}${g.genehmigungNr ? ` (Nr. ${g.genehmigungNr})` : ''}`)
    t.push(g.dichtheitAm && !g.dichtheitFehlt ? `Dichtheitsnachweis vom ${datum(g.dichtheitAm)}` : 'Dichtheitsnachweis fehlt, keine Bewertung')
    if (g.zuBeseitigen) t.push('nicht betriebsfähig bzw. nicht zugelassen, mit Beseitigung beauflagt')
    if (g.nichtGeleert) t.push('nicht geleert')
    zeilen.push(`${t.join(', ')}.`)
  } else if (ab.art === 'kanal') {
    zeilen.push(`Kanalisationsanschluss${ab.kanal.baujahr ? `, erstellt ${ab.kanal.baujahr}` : ''}.`)
  }
  if (bau.nichtBeraeumt.aktiv) zeilen.push(`Laube nicht beräumt${bau.nichtBeraeumt.m3 ? `, Inventar ca. ${zahl(bau.nichtBeraeumt.m3)} m³` : ''}.`)
  return zeilen.join('\n')
}

function datum(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

/** Bricht Text in Zeilen von höchstens `breite` Zeichen (für das Textfeld der Vorlage, das nicht umbricht). */
export function umbrechen(text: string, breite = 98): string[] {
  const aus: string[] = []
  for (const absatz of text.split(/\r?\n/)) {
    if (!absatz.trim()) {
      aus.push('')
      continue
    }
    let zeile = ''
    for (const wort of absatz.split(/\s+/)) {
      if (!wort) continue
      if (!zeile) zeile = wort
      else if (zeile.length + 1 + wort.length <= breite) zeile += ` ${wort}`
      else {
        aus.push(zeile)
        zeile = wort
      }
      while (zeile.length > breite) {
        aus.push(zeile.slice(0, breite))
        zeile = zeile.slice(breite)
      }
    }
    if (zeile) aus.push(zeile)
  }
  return aus
}
