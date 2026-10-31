/**
 * `window.wep.schema()`: JSON-Schema (Draft 2020-12) aller Rückgaben und des Skizzen-Vorschlags, mit Beschreibung je Feld.
 *
 * Das Dokument bündelt vier Schemas unter `$defs`: `lesen` (Rückgabe von `lesen()`), `vorschlag` (Eingabe von
 * `skizze.vorschlagen`), `vorschlagErgebnis` (dessen Rückgabe) und `status` (Rückgabe von `skizze.status()`).
 * Prüfen lässt sich z. B. mit `{ $ref: '#/$defs/lesen', $defs: schema().$defs }`. Ein Test hält Schema und Code zusammen.
 */
import { LINIENARTEN } from '../skizze/stile'
import { SYMBOL_ARTEN } from '../skizze/types'
import { EINHEITEN_BESEITIGUNG, EINHEITEN_POSITION, POSITIONEN_FORMAT, POSITIONEN_LISTEN, ZUSTAENDE } from './positionen'
import { BEZUGS_LISTEN, FORM_TYPEN, MODI, SCHNITTSTELLE_VERSION, SKIZZE_FORMAT } from './format'

type Schema = Record<string, unknown>

const text = (description: string, extra: Schema = {}): Schema => ({ type: 'string', description, ...extra })
const zahl = (description: string, extra: Schema = {}): Schema => ({ type: 'number', description, ...extra })
const ganz = (description: string, extra: Schema = {}): Schema => ({ type: 'integer', description, ...extra })
const wahr = (description: string): Schema => ({ type: 'boolean', description })
const oderNull = (s: Schema): Schema => ({ ...s, type: [s.type as string, 'null'] })
const liste = (items: Schema, description: string, extra: Schema = {}): Schema => ({ type: 'array', description, items, ...extra })
const objekt = (description: string, properties: Record<string, Schema>, pflicht: string[] = Object.keys(properties)): Schema => ({
  type: 'object',
  description,
  properties,
  required: pflicht,
  additionalProperties: false,
})
const ref = (name: string, description?: string): Schema => ({ $ref: `#/$defs/${name}`, ...(description ? { description } : {}) })

const punkt = (): Schema =>
  objekt('Punkt in Metern auf der Parzelle (Ursprung links oben, x nach rechts, y nach unten).', {
    x: zahl('Meter von links.'),
    y: zahl('Meter von oben.'),
  })

const FARBE = '^#[0-9A-Fa-f]{6}$'
const farbe = (beschreibung: string): Schema => text(`${beschreibung} Als „#RRGGBB“, z. B. „#C5E0B4“.`, { pattern: FARBE })

const bezug = (): Schema =>
  objekt(
    'Verweis auf eine Position des WEP (z. B. der Kronenkreis eines Baums auf die Aufwuchs-Position „Apfel“). Nur an ein Element je Gegenstand setzen (die App zählt die Verweise gegen die Stückzahl); bei einem Text ohne „inhalt“ ist der Kurzname der Position der Text.',
    {
      liste: text('Welche Liste: aufwuchs, aussenanlagen oder beseitigung.', { enum: [...BEZUGS_LISTEN] }),
      id: text('Kennung der Position aus lesen() (gruen.aufwuchs[].id usw.).'),
    },
  )

const kennung = text('Nur in lesen(): Kennung des vorhandenen Elements. Im Vorschlag optional und ignoriert (die App vergibt neue Kennungen).')

const NAME = text('Sprechender Name des Elements, z. B. „Stamm“, „Krone“, „Weg“ – wird zum Formnamen im Excel (mit laufender Nummer).', { maxLength: 60 })
const LINIENBREITE = zahl('Linienstärke in pt des Excel-Blatts (0,25 bis 6; üblich 1, Maßlinien/Tor 2); weglassen = Standardstärke.', { minimum: 0.25, maximum: 6 })

const stilEigenschaften = (): Record<string, Schema> => ({
  stil: text('Kurzname einer Vorgabe aus lesen().stile.vorgaben (z. B. „wiese“, „weg“, „kompost“); die Einzelangaben darunter überschreiben ihn.'),
  fuellung: { ...farbe('Füllfarbe.'), type: ['string', 'null'], description: 'Füllfarbe als „#RRGGBB“; null oder weglassen = keine Füllung.' },
  linie: farbe('Linienfarbe, unabhängig von der Füllung; weglassen = dunkelgrau.'),
  linienart: text('Linienart des Rahmens.', { enum: [...LINIENARTEN] }),
  linienbreite: LINIENBREITE,
  beschriftung: text('Text in der Mitte der Form.', { maxLength: 120 }),
})

const gemeinsam = (): Record<string, Schema> => ({ id: kennung, name: NAME, bezug: bezug() })

function elementDefs(): Record<string, Schema> {
  return {
    elementSymbolLesen: objekt(
      'Nur in lesen(): ein Symbol, das der Nutzer mit dem Symbol-Werkzeug gesetzt hat (Baum, Hecke …). Im Vorschlag nicht erlaubt – dort besteht alles aus Grundformen.',
      {
        typ: { const: 'symbol', description: 'Symbol des Nutzers.' },
        art: text('Art des Symbols (baum, strauch, hecke …).', { enum: [...SYMBOL_ARTEN] }),
        id: kennung,
        x: zahl('Mittelpunkt, Meter von links.'),
        y: zahl('Mittelpunkt, Meter von oben.'),
        breite: zahl('Breite in Metern.'),
        hoehe: zahl('Höhe in Metern.'),
        beschriftung: text('Beschriftung.'),
        bezug: bezug(),
      },
      ['typ', 'art', 'x', 'y', 'breite', 'hoehe'],
    ),
    elementRechteck: objekt(
      'Rechteck, wahlweise gefüllt, mit eigener Linienfarbe, -stärke und -art. x/y = Mittelpunkt.',
      {
        typ: { const: 'rechteck', description: 'Rechteck (auch Quadrat).' },
        ...gemeinsam(),
        x: zahl('Mittelpunkt, Meter von links.'),
        y: zahl('Mittelpunkt, Meter von oben.'),
        breite: zahl('Breite in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        hoehe: zahl('Höhe in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        ...stilEigenschaften(),
      },
      ['typ', 'x', 'y', 'breite', 'hoehe'],
    ),
    elementEllipse: objekt(
      'Ellipse oder Kreis (breite = hoehe), wahlweise gefüllt. x/y = Mittelpunkt.',
      {
        typ: { const: 'ellipse', description: 'Ellipse/Kreis.' },
        ...gemeinsam(),
        x: zahl('Mittelpunkt, Meter von links.'),
        y: zahl('Mittelpunkt, Meter von oben.'),
        breite: zahl('Waagerechter Durchmesser in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        hoehe: zahl('Senkrechter Durchmesser in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        ...stilEigenschaften(),
      },
      ['typ', 'x', 'y', 'breite', 'hoehe'],
    ),
    elementVieleck: objekt(
      'Vieleck aus Eckpunkten (Dreieck = 3 Punkte, Stern, schräge Wiese …), wahlweise gefüllt; mit offen: true ein Linienzug (nie gefüllt). Punkte absolut in Metern.',
      {
        typ: { const: 'vieleck', description: 'Vieleck bzw. Linienzug.' },
        ...gemeinsam(),
        punkte: liste(punkt(), 'Punkte in Reihenfolge um die Form (geschlossen: mindestens 3, offen: mindestens 2).', { minItems: 2, maxItems: 200 }),
        offen: wahr('true: offener Linienzug statt geschlossener Fläche (keine Füllung).'),
        ...stilEigenschaften(),
      },
      ['typ', 'punkte'],
    ),
    elementBogen: objekt(
      'Kreis- oder Ellipsenbogen (Viertelbogen am Tor, Rundung …), nur Linie. x/y = Mittelpunkt des Kreises bzw. der Ellipse; die App macht daraus einen offenen Linienzug (beim Lesen kommt er als Vieleck mit offen: true zurück).',
      {
        typ: { const: 'bogen', description: 'Bogen.' },
        ...gemeinsam(),
        x: zahl('Mittelpunkt, Meter von links.'),
        y: zahl('Mittelpunkt, Meter von oben.'),
        breite: zahl('Waagerechter Durchmesser des vollen Kreises in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        hoehe: zahl('Senkrechter Durchmesser in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        startWinkel: zahl('Anfangswinkel in Grad: 0 = rechts, 90 = unten, 180 = links, 270 = oben (Uhrzeigersinn).', { minimum: -720, maximum: 720 }),
        endWinkel: zahl('Endwinkel in Grad; der Bogen umfasst 1° bis 360° (Beispiel Viertelbogen: 180 bis 270).', { minimum: -720, maximum: 720 }),
        stil: text('Kurzname einer Vorgabe; nur deren Linienfarbe zählt.'),
        linie: farbe('Linienfarbe; weglassen = dunkelgrau.'),
        linienart: text('Linienart.', { enum: [...LINIENARTEN] }),
        linienbreite: LINIENBREITE,
      },
      ['typ', 'x', 'y', 'breite', 'hoehe', 'startWinkel', 'endWinkel'],
    ),
    elementLinie: objekt(
      'Gerade Linie von „von“ nach „nach“ mit eigener Farbe, Stärke und Art, wahlweise mit Pfeilspitze am Ende (z. B. Pfeil zu einem Mangel, Maßstrich, Latte).',
      {
        typ: { const: 'linie', description: 'Linie.' },
        ...gemeinsam(),
        von: punkt(),
        nach: { ...punkt(), description: 'Ende der Linie (hier sitzt die Pfeilspitze).' },
        farbe: farbe('Linienfarbe; weglassen = dunkelgrau.'),
        linienart: text('Linienart.', { enum: [...LINIENARTEN] }),
        linienbreite: LINIENBREITE,
        pfeil: wahr('Pfeilspitze am Ende („nach“).'),
      },
      ['typ', 'von', 'nach'],
    ),
    elementMassangabe: objekt(
      'Maßlinie mit Endstrichen und Text.',
      {
        typ: { const: 'massangabe', description: 'Maßlinie.' },
        ...gemeinsam(),
        von: punkt(),
        nach: punkt(),
        beschriftung: text('Maßtext, z. B. „4,2 m“; weggelassen = die berechnete Länge.', { maxLength: 120 }),
        farbe: farbe('Farbe; weglassen = dunkelgrau (im Excel rot).'),
      },
      ['typ', 'von', 'nach'],
    ),
    elementText: objekt(
      'Freier Text. x/y = Mittelpunkt.',
      {
        typ: { const: 'text', description: 'Text.' },
        ...gemeinsam(),
        x: zahl('Mittelpunkt, Meter von links.'),
        y: zahl('Mittelpunkt, Meter von oben.'),
        inhalt: text('Der Text; weggelassen = Kurzname der Position aus „bezug“.', { minLength: 1, maxLength: 120 }),
        farbe: farbe('Schriftfarbe; weglassen = dunkelgrau.'),
        groesse: zahl('Schriftgröße in pt (5 bis 28, üblich 9).', { minimum: 5, maximum: 28 }),
      },
      ['typ', 'x', 'y'],
    ),
    vorschlagElement: {
      description: `Eine Grundform im Format ${SKIZZE_FORMAT}. Längen in Metern auf der Parzelle (Ursprung links oben, x nach rechts, y nach unten); x/y sind Mittelpunkte. Typen: ${FORM_TYPEN.join(', ')}. Alles ist aus diesen Formen zusammengesetzt (Baum = Stamm + Kronenkreise …); fertige Zusammenstellungen liefert window.wep.skizze.baustein(). Die Reihenfolge der Liste ist die Zeichenreihenfolge (was später kommt, liegt oben).`,
      oneOf: ['elementRechteck', 'elementEllipse', 'elementVieleck', 'elementBogen', 'elementLinie', 'elementMassangabe', 'elementText'].map((n) => ref(n)),
    },
    element: {
      description: `Ein vorhandenes Skizzenelement in lesen(): eine Grundform des Formats ${SKIZZE_FORMAT} oder ein Symbol des Nutzers (nur lesend).`,
      oneOf: ['elementSymbolLesen', 'elementRechteck', 'elementEllipse', 'elementVieleck', 'elementBogen', 'elementLinie', 'elementMassangabe', 'elementText'].map((n) => ref(n)),
    },
    bausteinParameter: objekt(
      'Parameter von window.wep.skizze.baustein(name, parameter).',
      {
        x: zahl('Mittelpunkt in Metern, von links.'),
        y: zahl('Mittelpunkt in Metern, von oben.'),
        breite: zahl('Breite in Metern; weggelassen = Standardgröße (lesen().stile.bausteine).', { exclusiveMinimum: 0, maximum: 500 }),
        hoehe: zahl('Höhe in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        beschriftung: text('Beschriftung (bei Baum die Art, bei entfernen „<Name> entfernen“, beim mangelhinweis der Hinweistext).', { maxLength: 120 }),
        ziel: { ...punkt(), description: 'Nur mangelhinweis: Punkt in Metern, auf den der rote Pfeil zeigt.' },
      },
      ['x', 'y'],
    ),
    bausteinErgebnis: objekt('Rückgabe von window.wep.skizze.baustein().', {
      ok: wahr('true: Grundformen liegen in „elemente“. false: siehe fehler.'),
      fehler: liste(objekt('Ein Fehler.', { pfad: text('Parameter.'), meldung: text('Beschreibung.') }), 'Fehler (leer bei ok = true).'),
      elemente: liste(ref('vorschlagElement'), 'Die Grundformen des Bausteins in Zeichenreihenfolge; direkt in „elemente“ des Vorschlags übernehmbar. Den „bezug“ auf eine Position nur an das erste Element setzen.'),
    }),
  }
}

const positionSchema = (): Schema =>
  objekt('Eine Position der Liste.', {
    id: text('Kennung der Position (für „bezug“ im Skizzen-Vorschlag).'),
    nr: ganz('Laufende Nummer in der Liste (1 = erste Zeile).', { minimum: 1 }),
    bezeichnung: text('Vollständige Bezeichnung wie in der Liste, z. B. „Apfel, Halbstamm, 5–30 J.“.'),
    art: text('Kurzname für die Skizze (Text vor dem ersten Komma bzw. der ersten Klammer), z. B. „Apfel“.'),
    menge: zahl('Menge (Anzahl bzw. m, m², …).'),
    einheit: text('Einheit der Menge, z. B. „Stück“, „m“, „m²“.'),
    zustand: oderNull(text('Zustand: sehr gut, gut, mittel oder schlecht; null = nicht angegeben.')),
    einzelpreis: zahl('Einzelpreis in Euro.'),
    hoeheM: oderNull(zahl('Höhe in Metern, soweit aus der Bezeichnung lesbar; sonst null.')),
    invasiv: wahr('Art steht auf der Unionsliste invasiver Arten (zu entfernen).'),
    problempflanze: wahr('Art gilt als Problempflanze (Richtlinie oder Praxis, z. B. zu hohes Nadelgehölz).'),
    hinweise: liste(
      objekt('Regelhinweis zur Position.', {
        schwere: text('info oder warnung.', { enum: ['info', 'warnung'] }),
        text: text('Hinweistext.'),
      }),
      'Regelhinweise (Höchstwerte, Warnungen), wie sie die App an der Position zeigt.',
    ),
  })

const FORMALIEN_FELDER: [string, 'text' | 'zahl', string][] = [
  ['kleingartenanlage', 'text', 'Kleingartenanlage'],
  ['parzelle', 'text', 'Parzellennummer'],
  ['weg', 'text', 'Weg'],
  ['unterpaechter', 'text', 'Unterpächter'],
  ['auftraggeber', 'text', 'Auftraggeber'],
  ['vertretenDurchRA', 'text', 'Vertreten durch Rechtsanwalt'],
  ['anwesendVerein', 'text', 'Anwesend für den Verein'],
  ['anwesendUnterpaechter', 'text', 'Anwesend für den Unterpächter'],
  ['anwesendAuftraggeber', 'text', 'Anwesend für den Auftraggeber'],
  ['wertermittlerBaulichkeiten', 'text', 'Wertermittler Baulichkeiten'],
  ['wertermittlerAussenAufwuchs', 'text', 'Wertermittler Außenanlagen und Aufwuchs'],
  ['wertermittlungAm', 'text', 'Datum der Wertermittlung (ISO, JJJJ-MM-TT; leer = nicht gesetzt)'],
  ['protokollerstellungAm', 'text', 'Datum der Protokollerstellung (ISO; leer = nicht gesetzt)'],
  ['parzellenflaecheM2', 'zahl', 'Parzellenfläche laut Vertrag in m² (0 = nicht gesetzt)'],
  ['vorgangsNr', 'text', 'Vorgangs-Nr., z. B. „2026-001“'],
]

function lesenSchema(): Schema {
  const formalien = objekt(
    'Formalien des WEP (Kopf des Protokolls). Enthält personenbezogene Angaben (Unterpächter, Anwesende); sie bleiben im Browser – die Schnittstelle sendet nichts.',
    Object.fromEntries(FORMALIEN_FELDER.map(([k, t, d]) => [k, t === 'text' ? text(d) : zahl(d)])),
    FORMALIEN_FELDER.map(([k]) => k),
  )
  return {
    ...objekt(
      'Rückgabe von window.wep.lesen(): vollständiger, nur lesender Auszug aus dem geöffneten WEP.',
      {
        schemaVersion: { const: SCHNITTSTELLE_VERSION, description: 'Version dieser Schnittstelle.' },
        skizzeFormat: { const: SKIZZE_FORMAT, description: 'Format der Skizzenelemente (skizzeGruen.elemente und Vorschlag).' },
        wepId: text('Vorgangs-Nr. des WEP.'),
        formalien,
        rolle: text('Welche Teile dieses WEP bearbeitet werden: gruen, bau oder beides. Nur mit Grün-Teil gibt es eine Grün-Skizze.', { enum: ['gruen', 'bau', 'beides'] }),
        parzelle: objekt('Die Parzelle in Metern (Ursprung links oben).', {
          vorhanden: wahr('Es gibt eine berechenbare Parzelle.'),
          form: oderNull(text('rechteck oder frei; null = keine Parzelle.', { enum: ['rechteck', 'frei', null] })),
          ecken: liste(punkt(), 'Ecken der Parzelle in m (leer ohne Parzelle).'),
          flaecheM2: oderNull(zahl('Berechnete Fläche in m².')),
          vertragsflaecheM2: oderNull(zahl('Fläche laut Vertrag (Formalien) in m².')),
          flaechenHinweis: oderNull(text('Hinweis, wenn berechnete Fläche und Vertragsfläche deutlich abweichen.')),
          breiteM: oderNull(zahl('Breite des umgebenden Rechtecks in m.')),
          hoeheM: oderNull(zahl('Höhe des umgebenden Rechtecks in m.')),
          hinweis: oderNull(text('Hinweis, solange keine Parzelle angelegt oder berechenbar ist (dann gilt eine Zeichenfläche von 20 × 15 m).')),
        }),
        bau: objekt('Bau-Teil des WEP (nur lesend; Maße in Metern).', {
          vorhanden: wahr('Es gibt Bauteile oder einen Grundriss.'),
          bauteile: liste(
            objekt('Ein Bauteil.', {
              id: text('Kennung.'),
              kuerzel: text('Kürzel in der Vorlage: L (Laube), A1/A2 (Anbau), S/U (Schuppen), GWH (Gewächshaus), Ü1 (Vorplatz) …'),
              art: text('Art: laube, anbau, schuppen, gewaechshaus, vorplatz, keller.'),
              bezeichnung: oderNull(text('Freitext-Bezeichnung.')),
              laengeM: oderNull(zahl('Länge in m.')),
              breiteM: oderNull(zahl('Breite in m.')),
              hoeheM: oderNull(zahl('Höhe in m.')),
              flaecheM2: zahl('Grundfläche in m².'),
              baujahr: oderNull(ganz('Baujahr.')),
              nichtBewerten: wahr('Widerrechtlich oder nicht nutzbar: nicht bewertet.'),
            }),
            'Bauteile mit Kürzel und Maßen.',
          ),
          grundriss: liste(
            objekt('Ein Teil des Grundrisses.', {
              kuerzel: text('Kürzel (aus dem verknüpften Bauteil).'),
              bauteilId: oderNull(text('Kennung des verknüpften Bauteils.')),
              punkte: liste(punkt(), 'Eckpunkte in m auf der Parzelle.'),
              flaecheM2: zahl('Fläche in m².'),
              gestrichelt: wahr('Keller/Hauswasser (gestrichelt gezeichnet).'),
              dachform: oderNull(text('flach, pult, sattel, walm, zelt, krueppelwalm oder mansard.', { enum: ['flach', 'pult', 'sattel', 'walm', 'zelt', 'krueppelwalm', 'mansard', null] })),
              traufhoeheM: oderNull(zahl('Wandhöhe/Traufhöhe in m.')),
              firsthoeheM: oderNull(zahl('Firsthöhe (Pult: hohe Wand, Zelt: Spitze) in m.')),
            }),
            'Grundriss-Teile (Bauteile mit Lage in Metern).',
          ),
        }),
        grundlage: objekt('Die Bau-Skizze unter dem Grün (gesperrte Grundlage der Grün-Skizze). Nur lesend – ein Vorschlag ändert sie nie.', {
          vorhanden: wahr('Die Grün-Skizze hat eine Grundlage.'),
          quelle: oderNull(text('Herkunft: bau, excel oder parzelle.', { enum: ['bau', 'excel', 'parzelle', null] })),
          gesperrt: wahr('Gegen Verschieben gesperrt.'),
          elemente: liste(
            objekt('Eine Form der Grundlage in Metern.', {
              art: text('grundstueck, bauteil, linie oder text.', { enum: ['grundstueck', 'bauteil', 'linie', 'text'] }),
              beschriftung: oderNull(text('Beschriftung (Kürzel des Bauteils, Maßtext …).')),
              punkte: liste(punkt(), 'Eckpunkte (Grundstück, Bauteil), Anfang und Ende (Linie) oder Ankerpunkt (Text).'),
              gestrichelt: wahr('Gestrichelt gezeichnet (Keller).'),
            }),
            'Grundstück und Bauteile der Grundlage (ohne Zaunpfosten).',
          ),
          pfostenAnzahl: ganz('Anzahl der Zaunpfosten der Grundlage (nicht einzeln aufgeführt).', { minimum: 0 }),
        }),
        gruen: objekt('Grün-Teil: die erfassten Positionen.', {
          aussenanlagen: liste(positionSchema(), 'Außenanlagen (Wege, Zäune, Kompost, Beeteinfassungen …).'),
          aufwuchs: liste(positionSchema(), 'Aufwuchs (Bäume, Sträucher, Hecken, Stauden …) mit Art, Menge, Einheit, Höhe und Hinweisen.'),
          beseitigung: liste(
            objekt('Eine Beseitigungsposition.', {
              id: text('Kennung.'),
              nr: ganz('Laufende Nummer.', { minimum: 1 }),
              gegenstand: text('Was zu beseitigen ist.'),
              menge: zahl('Menge.'),
              einheit: text('Einheit.'),
              einzelpreis: zahl('Einzelpreis in Euro.'),
            }),
            'Beseitigungskosten Außenanlagen/Aufwuchs.',
          ),
        }),
        skizzeGruen: objekt('Die vorhandene Grün-Skizze (ohne Grundlage) im Format des Vorschlags.', {
          mitParzelle: wahr('Die Skizze liegt auf der Parzelle; sonst gilt eine Zeichenfläche von 20 × 15 m.'),
          flaecheM: objekt('Größe der Zeichenfläche in Metern.', { breite: zahl('Breite in m.'), hoehe: zahl('Höhe in m.') }),
          elemente: liste(ref('element'), 'Vorhandene Elemente in Zeichenreihenfolge (hinten zuerst).'),
        }),
        stile: objekt('Was ein Vorschlag verwenden darf.', {
          bausteine: liste(
            objekt('Ein Baustein.', { name: text('Name für baustein(name, …).'), beschreibung: text('Woraus der Baustein besteht.'), standardgroesseM: objekt('Standardgröße in m.', { breite: zahl('Breite.'), hoehe: zahl('Höhe.') }) }),
            'Fertige Zeichnungen aus Grundformen: window.wep.skizze.baustein(name, { x, y, … }).',
          ),
          elementtypen: liste(
            objekt('Ein Elementtyp.', {
              typ: text('Wert für „typ“.'),
              beschreibung: text('Kurzbeschreibung.'),
              standardgroesseM: oderNull(objekt('Standardgröße in m, wenn breite/hoehe fehlen.', { breite: zahl('Breite.'), hoehe: zahl('Höhe.') }) as Schema),
            }),
            'Alle Elementtypen.',
          ),
          vorgaben: liste(
            objekt('Eine Farbvorgabe für gefüllte Formen.', {
              id: text('Kurzname für „stil“.'),
              name: text('Anzeigename.'),
              fuellung: oderNull(text('Füllfarbe oder null (keine Füllung).')),
              linie: text('Linienfarbe.'),
              linienart: text('Linienart.', { enum: [...LINIENARTEN] }),
            }),
            'Vorgaben nach dem Skill parzellen-skizze (Wiese #C5E0B4, Weg #EDE4D3, Kompost #D9C3A5/#8B5A2B, Flieder #B4A7D6/#7030A0, Hinweis #C00000 …).',
          ),
          fuellfarben: liste(objekt('Farbe.', { name: text('Name.'), wert: text('„#RRGGBB“.') }), 'Farben der Füllfarben-Auswahl.'),
          linienfarben: liste(objekt('Farbe.', { name: text('Name.'), wert: text('„#RRGGBB“.') }), 'Farben der Linienfarben-Auswahl.'),
          linienarten: liste(text('Linienart.', { enum: [...LINIENARTEN] }), 'Erlaubte Linienarten.'),
          bezugslisten: liste(text('Liste.', { enum: [...BEZUGS_LISTEN] }), 'Listen, auf die sich „bezug“ beziehen darf.'),
          modi: liste(text('Modus.', { enum: [...MODI] }), 'Modi des Vorschlags.'),
        }),
      },
    ),
  }
}

export function schema(): Schema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://wep-app.local/schnittstelle/1',
    title: 'WEP-Schnittstelle (window.wep)',
    description:
      'Schemas der Rückgaben von window.wep.lesen(), skizze.vorschlagen() und skizze.status() sowie des Skizzen-Vorschlags (Eingabe von skizze.vorschlagen). ' +
      'Koordinatensystem: Meter auf der Parzelle, Ursprung links oben, x nach rechts, y nach unten. Ablauf: docs/WEP-SCHNITTSTELLE.md.',
    schemaVersion: SCHNITTSTELLE_VERSION,
    skizzeFormat: SKIZZE_FORMAT,
    $defs: {
      lesen: lesenSchema(),
      ...elementDefs(),
      vorschlag: objekt(
        `Eingabe von window.wep.skizze.vorschlagen(): ein Skizzen-Vorschlag im Format ${SKIZZE_FORMAT}. Nichts wird gespeichert, bis der Nutzer „Übernehmen“ wählt.`,
        {
          format: { const: SKIZZE_FORMAT, description: `Muss „${SKIZZE_FORMAT}“ sein.` },
          modus: text('ergaenzen: zu den vorhandenen Elementen dazu (Standard). gruen-ersetzen: alle Grün-Elemente der Skizze ersetzen. Die Grundlage (Bau-Skizze) bleibt in beiden Modi unangetastet.', { enum: [...MODI] }),
          elemente: liste(ref('vorschlagElement'), 'Die neuen Grundformen in Zeichenreihenfolge (hinten zuerst; Flächen zuerst, Beschriftungen und Hinweise zuletzt).', { minItems: 1, maxItems: 400 }),
        },
        ['format', 'elemente'],
      ),
      vorschlagErgebnis: objekt('Rückgabe von skizze.vorschlagen().', {
        ok: wahr('true: der Vorschlag ist gültig und in der Skizze hervorgehoben. false: nichts wurde angezeigt (siehe fehler).'),
        fehler: liste(
          objekt('Ein Fehler im Vorschlag.', {
            pfad: text('Pfad im Vorschlag, z. B. „elemente[2].fuellung“; leer = der Vorschlag als Ganzes.'),
            meldung: text('Verständliche Beschreibung, was falsch ist und was erlaubt wäre.'),
          }),
          'Fehler (leer bei ok = true).',
        ),
        hinweise: liste(text('Hinweis, der nichts verhindert (Element außerhalb der Parzelle, Position ohne Element …).'), 'Hinweise.'),
        zusammenfassung: text('Kurzer deutscher Satz: was angezeigt wird bzw. warum nichts angezeigt wurde.'),
        anzahl: ganz('Anzahl der Elemente des Vorschlags (0 bei Fehlern).', { minimum: 0 }),
      }),
      positionenVorschlag: {
        type: 'object',
        description: `Eingabe von window.wep.positionen.vorschlagen(): Positionen aus Text, Format ${POSITIONEN_FORMAT}. Nichts wird gespeichert, bis der Nutzer „Übernehmen“ wählt. Bei „aufwuchs“ und „aussenanlagen“ sind die Einträge Katalog- oder Freitext-Positionen, bei „beseitigung“ Beseitigungspositionen.`,
        properties: {
          format: { const: POSITIONEN_FORMAT, description: `Muss „${POSITIONEN_FORMAT}“ sein.` },
          liste: text('Ziel: aufwuchs, aussenanlagen oder beseitigung (Beseitigungskosten Grün).', { enum: [...POSITIONEN_LISTEN] }),
          positionen: {
            type: 'array',
            description: 'Die neuen Positionen; sie werden an die Liste angehängt. Einträge siehe positionPosition (aufwuchs/aussenanlagen) bzw. positionBeseitigung (beseitigung).',
            minItems: 1,
            maxItems: 100,
            items: { oneOf: [ref('positionPosition'), ref('positionBeseitigung')] },
          },
        },
        required: ['format', 'liste', 'positionen'],
        additionalProperties: false,
      },
      positionPosition: objekt(
        'Position für Aufwuchs oder Außenanlagen. Katalog: „suche“ (Begriff wie in der App-Suche, z. B. „Apfel“) ODER „katalogId“ (aus katalogSuchen); hat der Eintrag mehrere Preisvarianten, ist „variante“ nötig. Freitext: weder „suche“ noch „katalogId“, dafür „bezeichnung“, „einheit“ und „einzelpreis“.',
        {
          suche: text('Suchbegriff im Katalog (tippfehlertolerant, auch Arten und Alltagsbegriffe), z. B. „Apfel“, „Liguster Hecke“, „Regentonne“.', { maxLength: 200 }),
          katalogId: text('Kennung der Katalog-Position (aus window.wep.positionen.katalogSuchen), z. B. „aw-hecke“.', { maxLength: 200 }),
          variante: { description: 'Preisvariante: Index (Zahl ab 0) oder Text der Merkmale (z. B. „Halbstamm 5–30“). Fehlt sie bei mehreren Varianten, meldet die Prüfung alle zur Auswahl mit Höchstwert.', oneOf: [{ type: 'integer', minimum: 0 }, { type: 'string', maxLength: 200 }] },
          bezeichnung: text('Bezeichnung wie in der Excel; weggelassen = die App bildet sie aus Katalog, Variante und Art („Apfel, Halbstamm, 5–30 J.“). Bei Freitext Pflicht.', { maxLength: 200 }),
          anzahl: zahl('Menge (> 0), Dezimalpunkt.', { exclusiveMinimum: 0, maximum: 1000000 }),
          einheit: text('Einheit; weggelassen = die des Katalogs. Bei Freitext Pflicht.', { enum: [...EINHEITEN_POSITION] }),
          zustand: text('Zustand; bestimmt den Preisvorschlag (Höchstwert × Stufe: sehr gut 100 %, gut 75 %, mittel 50 %, schlecht = 1 €). Weggelassen = gut.', { enum: [...ZUSTAENDE] }),
          einzelpreis: zahl('Einzelpreis in Euro; weggelassen = Preisvorschlag. Eine Angabe zählt als eigener Preis (überschreibt den Vorschlag). Bei Freitext ohne Höchstwert Pflicht (sonst 0 €).', { minimum: 0 }),
          alter: zahl('Nur Obstgehölze: Alter in vollen Jahren. Dann nennt „variante“ nur die Baumform (z. B. „Halbstamm“) und die App wählt die Altersstufe (BewRL S. 16: bis 4, 5 bis 30, darüber). Ohne „alter“ gilt wie bisher die gewählte Variante, mit Hinweis „Alter fehlt“.', { minimum: 0, maximum: 300 }),
        },
        ['anzahl'],
      ),
      positionBeseitigung: objekt(
        'Beseitigungsposition (Anlage 4, Außenanlagen/Aufwuchs). Ohne „vorlage“ sind gegenstand, menge, einheit und einzelpreis Pflicht. Mit "vorlage": "baum-faellen" bildet die App Gegenstand („Birke fällen inkl. Wurzelstock, StU 85 cm“), Einheit (Stück) und Einzelpreis aus Baumart und Maß (BewRL S. 20–21).',
        {
          gegenstand: text('Was zu beseitigen ist, z. B. „Blaufichte entfernen“. Bei „baum-faellen“ optional.', { maxLength: 200 }),
          menge: zahl('Menge (> 0).', { exclusiveMinimum: 0, maximum: 1000000 }),
          einheit: text('Einheit. Bei „baum-faellen“ optional (Stück).', { enum: [...EINHEITEN_BESEITIGUNG] }),
          einzelpreis: zahl('Einzelpreis in Euro. Bei „baum-faellen“ optional: weggelassen = Satz der Stufe nach Stammumfang; eine Angabe zählt als eigener Preis.', { minimum: 0 }),
          faktor: zahl('Faktor (Standard 1); über 1 braucht eine Begründung.', { exclusiveMinimum: 0 }),
          begruendung: text('Begründung bei Faktor über 1.', { maxLength: 200 }),
          vorlage: text('Vorlage: „baum-faellen“ = Baum fällen inkl. Wurzelstock, Satz nach Stammumfang in 1,30 m Höhe.', { enum: ['baum-faellen'] }),
          baumart: text('Nur „baum-faellen“: Baumart, z. B. „Birke“.', { maxLength: 200 }),
          stammumfang: zahl('Nur „baum-faellen“: Stammumfang in cm in 1,30 m Höhe. „bis 30 cm“ schließt 30 ein; über 140 cm gilt der letzte Satz. Fehlt das Maß (und der Durchmesser), gibt es keinen Vorschlag (0 €) und einen Hinweis.', { exclusiveMinimum: 0, maximum: 2000 }),
          durchmesser: zahl('Nur „baum-faellen“: Durchmesser in cm in 1,30 m Höhe statt „stammumfang“; Umfang = π × Durchmesser (auf 0,1 cm gerundet).', { exclusiveMinimum: 0, maximum: 700 }),
        },
        ['menge'],
      ),
      positionenErgebnis: objekt('Rückgabe von positionen.vorschlagen().', {
        ok: wahr('true: gültig und in der App oben in der Liste angezeigt. false: nichts wurde angezeigt (siehe fehler).'),
        fehler: liste(
          objekt('Ein Fehler.', { pfad: text('Pfad, z. B. „positionen[1].variante“.'), meldung: text('Verständliche Beschreibung, was falsch ist und was erlaubt wäre (bei Mehrdeutigkeit mit den Auswahlmöglichkeiten).') }),
          'Fehler (leer bei ok = true).',
        ),
        hinweise: liste(text('Regelhinweis (invasiv, Problempflanze, über Höchstwert, doppelt …); verhindert nichts.'), 'Hinweise.'),
        zusammenfassung: text('Kurzer deutscher Satz.'),
        anzahl: ganz('Anzahl der Positionen (0 bei Fehlern).', { minimum: 0 }),
        vorschau: liste(
          objekt(
            'Eine vorgeschlagene Position, wie die App sie anlegen würde.',
            {
              bezeichnung: text('Bezeichnung.'),
              menge: zahl('Menge.'),
              einheit: text('Einheit.'),
              zustand: oderNull(text('Zustand (null bei Beseitigung).')),
              einzelpreis: zahl('Einzelpreis in Euro.'),
              summe: zahl('Menge × Einzelpreis (× Faktor) in Euro.'),
              quelle: text('Katalog-Position, „Freitext“ oder „Beseitigung“.'),
              faktor: zahl('Faktor (nur Beseitigung).'),
            },
            ['bezeichnung', 'menge', 'einheit', 'zustand', 'einzelpreis', 'summe', 'quelle'],
          ),
          'Die Positionen mit berechnetem Preis – zum Berichten an den Nutzer.',
        ),
        summe: zahl('Summe aller Positionen in Euro.'),
      }),
      positionenStatus: objekt('Rückgabe von positionen.status().', {
        offen: wahr('Ein Vorschlag wartet auf die Entscheidung des Nutzers.'),
        zustand: text('kein-vorschlag · offen · uebernommen · verworfen · zurueckgenommen (der Nutzer hat „Rückgängig“ gewählt).', { enum: ['kein-vorschlag', 'offen', 'uebernommen', 'verworfen', 'zurueckgenommen'] }),
        nr: ganz('Laufende Nummer des letzten Vorschlags.', { minimum: 0 }),
        liste: oderNull(text('Liste des letzten Vorschlags.', { enum: [...POSITIONEN_LISTEN, null] })),
        anzahl: oderNull(ganz('Anzahl der Positionen des letzten Vorschlags.')),
        entschiedenAm: oderNull(text('Zeitpunkt (ISO) der Entscheidung.')),
      }),
      katalogTreffer: liste(
        objekt('Ein Treffer der Katalogsuche.', {
          katalogId: text('Kennung (für „katalogId“ im Vorschlag).'),
          bezeichnung: text('Bezeichnung der Katalog-Position.'),
          kategorie: text('Kategorie.'),
          einheit: text('Einheit der Position.'),
          bewrlSeite: ganz('Seite der BewRL.'),
          regeln: text('Regeltext der Richtlinie (kann leer sein).'),
          hoechstwert: oderNull(zahl('Höchstwert in Euro, wenn die Position keine Varianten hat.')),
          varianten: liste(
            objekt('Preisvariante.', { index: ganz('Wert für „variante“.', { minimum: 0 }), merkmale: text('z. B. „Halbstamm, 5–30 J.“'), hoechstwert: zahl('Höchstwert in Euro.') }),
            'Preisvarianten (leer, wenn die Position einen einzelnen Höchstwert hat).',
          ),
          eigene: wahr('Eigene Position des Nutzers (immer false; eigene Positionen findet „suche“ im Vorschlag).'),
        }),
        'Rückgabe von positionen.katalogSuchen().',
      ),
      status: objekt('Rückgabe von skizze.status().', {
        offen: wahr('Ein Vorschlag wartet auf die Entscheidung des Nutzers.'),
        zustand: text('kein-vorschlag · offen (wartet auf den Nutzer) · uebernommen · verworfen. Ein neuer Vorschlag ersetzt einen noch offenen.', { enum: ['kein-vorschlag', 'offen', 'uebernommen', 'verworfen'] }),
        nr: ganz('Laufende Nummer des letzten Vorschlags (0 = noch keiner).', { minimum: 0 }),
        anzahl: oderNull(ganz('Anzahl der Elemente des letzten Vorschlags.')),
        modus: oderNull(text('Modus des letzten Vorschlags.', { enum: [...MODI, null] })),
        entschiedenAm: oderNull(text('Zeitpunkt (ISO) der Entscheidung des Nutzers.')),
      }),
    },
  }
}
