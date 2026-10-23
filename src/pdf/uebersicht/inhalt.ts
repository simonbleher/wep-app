/**
 * Inhalt des übersichtlichen PDF: Deckblatt, dann je Teil Tabellen, Skizzen, Bestätigung.
 * Nimmt die Zahlen aus `Protokoll` (`daten.ts`) und setzt sie mit `Satz` (`seitenbau.ts`) auf Seiten.
 */
import { DECKBLATT_ABSAETZE } from '../../export/deckblattText'
import type { Rolle } from '../../model'
import type { GrundrissDaten } from '../../skizze/grundriss'
import type { SkizzeDaten } from '../../skizze/types'
import type { ParzellenLage } from '../../parzelle/lage'
import type { PdfSkizzen } from '../erzeugen'
import { zeichneGrundriss, zeichneGruenSkizze } from '../skizzen'
import type { BauteilRechnung, Posten, Protokoll } from './daten'
import { abzugEuro, euro, flaeche, prozent, zahl } from './format'
import { BREITE, FARBE, RAENDER, Satz, type Zeile } from './seitenbau'

/** Seitenverhältnis (Höhe zu Breite) des Skizzenkastens der Vorlage (B7:G48), in dem beide Skizzen denselben Maßstab haben. */
export const SKIZZEN_VERHAELTNIS = 1.3748

export interface InhaltOptionen {
  rolle: Rolle
  skizzen?: PdfSkizzen
  /** Die Unterschrift soll über den Namen der Wertermittler stehen. */
  mitUnterschrift: boolean
}

const r = (text: string): { text: string; ausricht: 'r' } => ({ text, ausricht: 'r' })

// ---------------------------------------------------------------------------------------------------- Deckblatt

function deckblatt(s: Satz, p: Protokoll): void {
  s.neueSeite('deckblatt')
  s.absatz(p.verband.name, { groesse: 10, farbe: FARBE.text2, fett: true, nach: 1 })
  if (p.verband.adresse) s.absatz(p.verband.adresse, { groesse: 8.5, farbe: FARBE.text2, nach: 16 })
  s.absatz('Wertermittlungsprotokoll', { groesse: 26, fett: true, farbe: FARBE.akzentDunkel, nach: 1 })
  s.absatz(p.verband.titel, { groesse: 12.5, farbe: FARBE.text2, nach: 8 })
  s.linie(FARBE.akzent, 1.4)
  s.abstand(10)
  s.schluesselWerte(p.formalien, { labelBreite: 205, groesse: 9.5 })

  s.h2('Bewertung')
  const zeilen: Zeile[] = p.bewertung.map((z) => ({
    art: z.art === 'plus' || z.art === 'minus' ? 'normal' : z.art,
    zellen: [{ text: z.art === 'minus' ? `abzüglich ${z.text}` : z.text }, r(z.art === 'minus' ? abzugEuro(z.betrag) : euro(z.betrag))],
  }))
  s.tabelle({ breiten: [0, 120], zeilen, groesse: 10, padY: 3.4 })

  s.abstand(4)
  s.platz(90)
  s.absatz('„Sachlich und rechnerisch geprüft“', { groesse: 9, fett: true, nach: 20 })
  const box = s.reserviere(30)
  const unten = box.y + 26
  s.seite.ops.push({ t: 'text', x: box.x, y: unten - 3, s: 'Datum:', groesse: 9, fett: false, kursiv: false, unterstrichen: false, farbe: FARBE.text2 })
  s.seite.ops.push({ t: 'linie', x1: box.x + 40, y1: unten, x2: box.x + 160, y2: unten, breite: 0.75, farbe: FARBE.rand })
  s.seite.ops.push({ t: 'linie', x1: box.x + 260, y1: unten, x2: box.x + BREITE, y2: unten, breite: 0.75, farbe: FARBE.rand })
  s.seite.ops.push({ t: 'text', x: box.x + 260, y: unten + 11, s: 'Unterschrift BV', groesse: 8.5, fett: false, kursiv: false, unterstrichen: false, farbe: FARBE.text2 })
  s.abstand(14)

  const absaetze = DECKBLATT_ABSAETZE.map((a) => a.map((l) => ({ text: l.text, fett: l.fett })))
  // Die Kontaktzeile bleibt beim vorletzten Absatz (nie allein oben auf der nächsten Seite)
  if (absaetze.length > 1) {
    const kontakt = absaetze.pop()!
    absaetze.push([...absaetze.pop()!, { text: '\n', fett: false }, ...kontakt])
  }
  s.h2('Hinweise und Erklärung')
  for (const a of absaetze) s.absatz(a, { groesse: 8.5, nach: 5, zusammen: true })
}

// -------------------------------------------------------------------------------------------------- Baulichkeiten

const mal = (n: number | undefined) => (n === undefined ? '' : euro(n))

function bauteilTabelle(s: Satz, b: BauteilRechnung): void {
  s.h2(b.titel, b.kopf || undefined)
  const zeilen: Zeile[] = b.schritte
    .filter((x) => x.wert !== undefined)
    .map((x) => ({ zellen: [{ text: x.text }, { text: x.angabe ?? '' }, r(`${mal(x.wert)}/m²`)] }))
  zeilen.push({ art: 'summe', zellen: [{ text: 'Wert des Bauteils' }, { text: `${flaeche(b.flaeche)} × ${mal(b.wertProM2)}`, ausricht: 'r' }, r(euro(b.wert))] })
  if (b.nichtBerechnet) zeilen.push({ art: 'hinweis', zellen: [{ text: `Nicht berechnete Baufläche: ${flaeche(b.nichtBerechnet)}`, spanne: 3 }] })
  s.tabelle({ kopf: [{ text: 'Rechenschritt' }, { text: 'Angabe' }, { text: 'Ergebnis', ausricht: 'r' }], breiten: [0, 140, 92], zeilen })
}

function baulichkeiten(s: Satz, p: Protokoll): void {
  if (!p.bauteile.length && !p.abwasser.grube && !p.abwasser.kanal) return
  s.platz(320)
  s.h1('Baulichkeiten')
  const index = p.index ? `Baupreisindex ${zahl(p.index.wert, 1)} %${p.index.text ? ` ${p.index.text}` : ''}. ` : ''
  s.absatz(`${index}Rechenweg je Bauteil: Normalherstellungskosten (NHK) je m², abzüglich Mängel- und Altersabzug, mal Baupreisindex, mal Fläche.`, { groesse: 9, farbe: FARBE.text2, nach: 4 })
  for (const b of p.bauteile) bauteilTabelle(s, b)

  s.platz(70 + p.bauZusammenstellung.length * 22)
  s.h2('Zusammenstellung Baulichkeiten')
  s.tabelle({
    breiten: [0, 110],
    zeilen: p.bauZusammenstellung.map((z) => ({ art: z.art === 'plus' || z.art === 'minus' ? 'normal' : z.art, zellen: [{ text: z.text }, r(euro(z.betrag))] })),
  })
  if (p.bebauteFlaeche) s.absatz(`Bewertete bebaute Fläche: ${flaeche(p.bebauteFlaeche)}`, { groesse: 9.5, nach: 6 })
  if (p.bauBeschreibung.length) {
    s.h2('Baubeschreibung')
    for (const a of p.bauBeschreibung) s.absatz(a, { groesse: 10, nach: 5 })
  }
}

function maengel(s: Satz, p: Protokoll): void {
  if (!p.maengel.length) return
  s.h1('Mängel')
  for (const b of p.maengel) {
    s.h2(b.titel)
    const zeilen: Zeile[] = []
    for (const z of b.zeilen) {
      zeilen.push({ zellen: [{ text: z.hoechstens ? `${z.gruppe}\nhöchstens ${zahl(z.hoechstens)} %` : z.gruppe }, { text: z.maengel.length ? z.maengel.join('; ') : '–' }, r(prozent(z.abzug))] })
      if (z.begruendung) zeilen.push({ art: 'hinweis', zellen: [{ text: `Begründung: ${z.begruendung}`, spanne: 3 }] })
    }
    zeilen.push({ art: 'summe', zellen: [{ text: 'Mängelabzug insgesamt', spanne: 2 }, r(prozent(b.gesamt))] })
    s.tabelle({ kopf: [{ text: 'Bereich' }, { text: 'Festgestellte Mängel' }, { text: 'Abzug', ausricht: 'r' }], breiten: [112, 0, 56], zeilen })
  }
}

function abwasser(s: Satz, p: Protokoll): void {
  const { grube, kanal } = p.abwasser
  if (!grube && !kanal) return
  s.h1('Abwasser')
  const rz = (label: string, wert: string | undefined): Zeile | undefined => (wert ? { zellen: [{ text: label }, r(wert)] } : undefined)
  const alle = (z: (Zeile | undefined)[]) => z.filter((x): x is Zeile => Boolean(x))
  if (grube) {
    s.h2('Abwassersammelgrube')
    s.tabelle({
      breiten: [0, 150],
      zeilen: alle([
        rz('Genehmigung vom', grube.genehmigtAm),
        rz('Genehmigungsnummer', grube.nr),
        grube.alter !== undefined ? rz('Alter', `${zahl(grube.alter)} Jahre`) : undefined,
        grube.grundwert !== undefined ? rz('Grundwert', `${euro(grube.grundwert)}/m³`) : undefined,
        grube.abzugProzent !== undefined ? rz('Altersabzug (3 % je Jahr)', prozent(grube.abzugProzent)) : undefined,
        grube.wertProM3 !== undefined ? rz('Wert nach Altersabzug', `${euro(grube.wertProM3)}/m³`) : undefined,
        grube.menge !== undefined ? rz('Inhalt', `${zahl(grube.menge)} m³`) : undefined,
        rz('Dichtheitsgutachten vom', grube.dichtheitAm ?? (grube.nachweisFehlt ? 'fehlt' : undefined)),
        { art: 'summe', zellen: [{ text: 'Wert der Grube' }, r(euro(grube.wert))] },
        grube.nichtGeleertAbzug ? { zellen: [{ text: 'Abzug wegen nicht geleerter Grube' }, r(euro(grube.nichtGeleertAbzug))] } : undefined,
      ]),
    })
  }
  if (kanal) {
    s.h2('Abwasserkanal')
    s.tabelle({
      breiten: [0, 150],
      zeilen: alle([
        rz('Erstellt', kanal.baujahr),
        kanal.alter !== undefined ? rz('Alter', `${zahl(kanal.alter)} Jahre`) : undefined,
        kanal.kosten !== undefined ? rz('Kosten', euro(kanal.kosten)) : undefined,
        kanal.hoechstens !== undefined ? rz('höchstens', euro(kanal.hoechstens)) : undefined,
        kanal.abzug !== undefined ? rz('Altersabzug (3 % je Jahr)', prozent(kanal.abzug * 100)) : undefined,
        { art: 'summe', zellen: [{ text: 'Wert des Kanals' }, r(euro(kanal.wert))] },
      ]),
    })
  }
}

// ------------------------------------------------------------------------------------------------------ Grün-Teil

function positionsTabelle(s: Satz, posten: Posten[], summeText: string, summe: number): void {
  const zeilen: Zeile[] = posten.map((x) => ({
    zellen: [{ text: String(x.nr) }, { text: x.text }, r(x.anzahl === undefined ? '' : zahl(x.anzahl, 3)), { text: x.einheit ?? '' }, r(x.einzelpreis === undefined ? '' : euro(x.einzelpreis)), r(euro(x.summe))],
  }))
  zeilen.push({ art: 'gesamt', zellen: [{ text: summeText, spanne: 5 }, r(euro(summe))] })
  s.tabelle({
    kopf: [{ text: 'Nr.' }, { text: 'Bezeichnung' }, { text: 'Anzahl', ausricht: 'r' }, { text: 'Einheit' }, { text: 'Einzelpreis', ausricht: 'r' }, { text: 'Gesamt', ausricht: 'r' }],
    breiten: [28, 0, 52, 46, 68, 74],
    zeilen,
  })
}

function aussenanlagen(s: Satz, p: Protokoll): void {
  if (!p.aussenanlagen.length) return
  s.h1('Außenanlagen')
  if (p.aussenBeschreibung) s.absatz(p.aussenBeschreibung, { groesse: 10, nach: 8 })
  positionsTabelle(s, p.aussenanlagen, 'Außenanlagen insgesamt', p.aussenSumme)
}

function aufwuchs(s: Satz, p: Protokoll): void {
  if (!p.aufwuchs.length) return
  s.h1('Aufwuchs')
  if (p.aufwuchsBeschreibung) s.absatz(p.aufwuchsBeschreibung, { groesse: 10, nach: 8 })
  positionsTabelle(s, p.aufwuchs, 'Aufwuchs insgesamt', p.aufwuchsSumme)
}

function beseitigung(s: Satz, p: Protokoll): void {
  if (!p.beseitigung.length && !p.bauAbzuege.length) return
  s.h1('Beseitigungskosten und Abzüge')
  for (const b of p.beseitigung) {
    s.h2(b.abschnitt === 'bau' ? 'Zu entfernende Aufbauten (Bau)' : 'Zu entfernende Außenanlagen und Aufwuchs')
    const zeilen: Zeile[] = b.posten.map((x) => ({
      zellen: [
        { text: String(x.nr) },
        { text: x.text },
        r(x.anzahl === undefined ? '' : zahl(x.anzahl, 3)),
        { text: x.einheit ?? '' },
        r(x.einzelpreis === undefined ? '' : euro(x.einzelpreis)),
        r(x.faktor === undefined ? '' : prozent(x.faktor * 100)),
        r(euro(x.summe)),
      ],
    }))
    zeilen.push({ art: 'summe', zellen: [{ text: 'Summe', spanne: 6 }, r(euro(b.summe))] })
    s.tabelle({
      kopf: [{ text: 'Nr.' }, { text: 'Gegenstand' }, { text: 'Menge', ausricht: 'r' }, { text: 'Einheit' }, { text: 'Einzelpreis', ausricht: 'r' }, { text: 'Faktor', ausricht: 'r' }, { text: 'Summe', ausricht: 'r' }],
      breiten: [28, 0, 46, 54, 62, 46, 66],
      zeilen,
    })
    if (b.hinweis) s.absatz(b.hinweis, { groesse: 9, farbe: FARBE.text2, nach: 3 })
    if (b.begruendung) s.absatz(`Begründung bei Faktor über 100 %: ${b.begruendung}`, { groesse: 9, farbe: FARBE.text2, nach: 6 })
  }
  if (p.bauAbzuege.length) {
    s.h2('Weitere Abzüge Bau')
    s.tabelle({ breiten: [0, 130, 78], zeilen: p.bauAbzuege.map((x) => ({ zellen: [{ text: x.text }, r(x.rechnung ?? ''), r(euro(x.betrag))] })) })
  }
}

// ------------------------------------------------------------------------------------------- Bestätigung, Skizzen

function bestaetigung(s: Satz, p: Protokoll, o: InhaltOptionen): void {
  // Nur wer etwas bewertet hat oder namentlich im Protokoll steht, bestätigt (ein leeres WEP bekommt keinen Unterschriftsblock)
  const inhaltBau = p.bauteile.length > 0 || Boolean(p.abwasser.grube || p.abwasser.kanal) || p.beseitigung.some((b) => b.abschnitt === 'bau')
  const inhaltGruen = p.aussenanlagen.length > 0 || p.aufwuchs.length > 0 || p.beseitigung.some((b) => b.abschnitt === 'gruen')
  const personen = [
    o.rolle !== 'gruen' && (inhaltBau || p.wertermittler.bau) && { rolle: 'Wertermittler Baulichkeiten', name: p.wertermittler.bau },
    o.rolle !== 'bau' && (inhaltGruen || p.wertermittler.gruen) && { rolle: 'Wertermittler Außenanlagen und Aufwuchs', name: p.wertermittler.gruen },
  ].filter((x): x is { rolle: string; name: string | undefined } => Boolean(x))
  if (!personen.length) return
  s.platz(60 + personen.length * 78)
  s.h1('Bestätigung')
  const ort = p.wertermittler.datum ? `Berlin, den ${p.wertermittler.datum}` : 'Berlin, den'
  for (const pe of personen) {
    const box = s.reserviere(74)
    const unten = box.y + 56
    const x2 = box.x + 250
    s.seite.ops.push({ t: 'text', x: box.x, y: unten - 3, s: ort, groesse: 10, fett: false, kursiv: false, unterstrichen: false, farbe: FARBE.text })
    s.seite.ops.push({ t: 'linie', x1: x2, y1: unten, x2: box.x + BREITE, y2: unten, breite: 0.75, farbe: FARBE.rand })
    s.seite.ops.push({ t: 'text', x: x2, y: unten + 12, s: `${pe.name ? `${pe.name}, ` : ''}${pe.rolle}`, groesse: 9, fett: false, kursiv: false, unterstrichen: false, farbe: FARBE.text2 })
    if (o.mitUnterschrift) {
      const rahmen = { x: x2, y: unten - 46, w: box.x + BREITE - x2, h: 44 }
      s.haken(rahmen, (k) => {
        if (!k.unterschrift) return
        const sch = Math.min(rahmen.h, rahmen.w / (k.unterschrift.width / k.unterschrift.height))
        const b = sch * (k.unterschrift.width / k.unterschrift.height)
        k.seite.drawImage(k.unterschrift, { x: rahmen.x + (rahmen.w - b) / 2, y: k.seite.getHeight() - (rahmen.y + rahmen.h) + (rahmen.h - sch) / 2 + 2, width: b, height: sch })
      })
    }
  }
}

function skizzen(s: Satz, p: Protokoll, o: InhaltOptionen): void {
  const bau = o.skizzen?.grundriss
  if (o.rolle !== 'gruen' && bau && (bau.daten.teile.length || bau.parzelle)) {
    zeichnung(s, 'Skizze Baulichkeiten', 'Grundriss mit Maßen, Maßstab wie in der Skizze Außenanlagen und Aufwuchs.', SKIZZEN_VERHAELTNIS, (k, rect) =>
      zeichneGrundriss(k.lib, k.seite, k.schriften, bau.daten as GrundrissDaten, bau.bauteile, rect, bau.parzelle as ParzellenLage | undefined),
    )
  }
  const gruen = o.skizzen?.gruen
  if (o.rolle !== 'bau' && gruen?.elemente.length) {
    zeichnung(s, 'Skizze Außenanlagen und Aufwuchs', undefined, (gruen.hoehe ?? 600) / (gruen.breite ?? 800), (k, rect) => zeichneGruenSkizze(k.lib, k.seite, k.schriften, gruen as SkizzeDaten, rect))
  }
  void p
}

function zeichnung(s: Satz, titel: string, hinweis: string | undefined, verhaeltnis: number, zeichne: (k: Parameters<Parameters<Satz['haken']>[1]>[0], rect: { x: number; y: number; w: number; h: number }) => unknown): void {
  const rect = s.skizzenSeite(titel, hinweis, verhaeltnis)
  s.seite.ops.push({ t: 'fuellung', x: rect.x, y: rect.y, w: rect.w, h: rect.h, farbe: '#ffffff' })
  s.seite.ops.push({ t: 'kasten', x: rect.x, y: rect.y, w: rect.w, h: rect.h, breite: 0.75, farbe: FARBE.rand })
  s.haken(rect, (k) => void zeichne(k, rect))
}

/** Setzt das ganze Protokoll auf Seiten. */
export function setzeProtokoll(s: Satz, p: Protokoll, o: InhaltOptionen): void {
  deckblatt(s, p)
  baulichkeiten(s, p)
  maengel(s, p)
  abwasser(s, p)
  aussenanlagen(s, p)
  aufwuchs(s, p)
  beseitigung(s, p)
  bestaetigung(s, p, o)
  skizzen(s, p, o)
}

export { RAENDER }
