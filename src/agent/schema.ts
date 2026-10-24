/**
 * `window.wep.schema()`: JSON-Schema (Draft 2020-12) aller Rückgaben und des Skizzen-Vorschlags, mit Beschreibung je Feld.
 *
 * Das Dokument bündelt vier Schemas unter `$defs`: `lesen` (Rückgabe von `lesen()`), `vorschlag` (Eingabe von
 * `skizze.vorschlagen`), `vorschlagErgebnis` (dessen Rückgabe) und `status` (Rückgabe von `skizze.status()`).
 * Prüfen lässt sich z. B. mit `{ $ref: '#/$defs/lesen', $defs: schema().$defs }`. Ein Test hält Schema und Code zusammen.
 */
import { LINIENARTEN } from '../skizze/stile'
import { SYMBOL_ARTEN } from '../skizze/types'
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
    'Verweis auf eine Position des WEP: Beschriftung (Name/Art) und Zuordnung folgen ihr. Ohne „beschriftung“ wird der Kurzname der Position als Beschriftung verwendet.',
    {
      liste: text('Welche Liste: aufwuchs, aussenanlagen oder beseitigung.', { enum: [...BEZUGS_LISTEN] }),
      id: text('Kennung der Position aus lesen() (gruen.aufwuchs[].id usw.).'),
    },
  )

const kennung = text('Nur in lesen(): Kennung des vorhandenen Elements. Im Vorschlag optional und ignoriert (die App vergibt neue Kennungen).')

const stilEigenschaften = (): Record<string, Schema> => ({
  stil: text('Kurzname einer Vorgabe aus lesen().stile.vorgaben (z. B. „wiese“, „weg“, „kompost“); die Einzelangaben darunter überschreiben ihn.'),
  fuellung: { ...farbe('Füllfarbe.'), type: ['string', 'null'], description: 'Füllfarbe als „#RRGGBB“; null oder weglassen = keine Füllung.' },
  linie: farbe('Linienfarbe; weglassen = dunkelgrau.'),
  linienart: text('Linienart des Rahmens.', { enum: [...LINIENARTEN] }),
  beschriftung: text('Beschriftung in der Form.'),
  bezug: bezug(),
})

function elementDefs(): Record<string, Schema> {
  return {
    elementSymbol: objekt(
      'Piktogramm der App (Baum, Hecke, Weg, Kompost, Mängelhinweis …). x/y = Mittelpunkt; breite/hoehe weggelassen = Standardgröße (lesen().stile.elementtypen).',
      {
        typ: text('Art des Symbols.', { enum: [...SYMBOL_ARTEN] }),
        id: kennung,
        x: zahl('Mittelpunkt, Meter von links.'),
        y: zahl('Mittelpunkt, Meter von oben.'),
        breite: zahl('Breite in Metern (Hecke/Weg: die lange Seite waagerecht oder senkrecht – längere Seite = Richtung).', { exclusiveMinimum: 0, maximum: 500 }),
        hoehe: zahl('Höhe in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        beschriftung: text('Beschriftung (bei Baum die Art, bei Entfernen „<Name> entfernen“, beim Mängelhinweis der Hinweistext).', { maxLength: 120 }),
        bezug: bezug(),
        ziel: { ...punkt(), description: 'Nur Mängelhinweis: Punkt (Meter), auf den ein roter Pfeil vom Hinweisfeld zeigt.' },
      },
      ['typ', 'x', 'y'],
    ),
    elementRechteck: objekt(
      'Rechteck, wahlweise mit Füllung und Linienart. x/y = Mittelpunkt.',
      {
        typ: { const: 'rechteck', description: 'Rechteck.' },
        id: kennung,
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
        id: kennung,
        x: zahl('Mittelpunkt, Meter von links.'),
        y: zahl('Mittelpunkt, Meter von oben.'),
        breite: zahl('Waagerechter Durchmesser in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        hoehe: zahl('Senkrechter Durchmesser in Metern.', { exclusiveMinimum: 0, maximum: 500 }),
        ...stilEigenschaften(),
      },
      ['typ', 'x', 'y', 'breite', 'hoehe'],
    ),
    elementVieleck: objekt(
      'Geschlossenes Vieleck (z. B. schräge Wiese), wahlweise gefüllt. Eckpunkte absolut in Metern.',
      {
        typ: { const: 'vieleck', description: 'Vieleck.' },
        id: kennung,
        punkte: liste(punkt(), 'Eckpunkte in Reihenfolge um die Form, mindestens 3.', { minItems: 3, maxItems: 200 }),
        ...stilEigenschaften(),
      },
      ['typ', 'punkte'],
    ),
    elementLinie: objekt(
      'Linie von „von“ nach „nach“, wahlweise farbig, gestrichelt oder mit Pfeilspitze am Ende (z. B. Pfeil zu einem Mangel).',
      {
        typ: { const: 'linie', description: 'Linie.' },
        id: kennung,
        von: punkt(),
        nach: { ...punkt(), description: 'Ende der Linie (hier sitzt die Pfeilspitze).' },
        farbe: farbe('Linienfarbe; weglassen = dunkelgrau.'),
        linienart: text('Linienart.', { enum: [...LINIENARTEN] }),
        pfeil: wahr('Pfeilspitze am Ende („nach“).'),
      },
      ['typ', 'von', 'nach'],
    ),
    elementMassangabe: objekt(
      'Maßlinie mit Endstrichen und Text.',
      {
        typ: { const: 'massangabe', description: 'Maßlinie.' },
        id: kennung,
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
        id: kennung,
        x: zahl('Mittelpunkt, Meter von links.'),
        y: zahl('Mittelpunkt, Meter von oben.'),
        inhalt: text('Der Text.', { minLength: 1, maxLength: 120 }),
      },
      ['typ', 'x', 'y', 'inhalt'],
    ),
    element: {
      description: `Ein Skizzenelement im Format ${SKIZZE_FORMAT}. Längen in Metern auf der Parzelle (Ursprung links oben, x nach rechts, y nach unten); x/y sind Mittelpunkte. Typen: ${[...SYMBOL_ARTEN, ...FORM_TYPEN].join(', ')}.`,
      oneOf: ['elementSymbol', 'elementRechteck', 'elementEllipse', 'elementVieleck', 'elementLinie', 'elementMassangabe', 'elementText'].map((n) => ref(n)),
    },
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
          elemente: liste(ref('element'), 'Die neuen Elemente in Zeichenreihenfolge (hinten zuerst; Flächen zuerst, Beschriftungen und Hinweise zuletzt).', { minItems: 1, maxItems: 400 }),
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
