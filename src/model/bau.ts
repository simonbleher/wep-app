// Datentypen des Bau-Teils (Beta 4, Paket 2). Rechnen und Regeln: src/bau/.
// Alle Zahlen sind Eingaben des Wertermittlers oder Vorschläge, die er überschreiben kann
// (`...Manuell`-Felder merken, was er selbst gesetzt hat). Nichts wird gesperrt.

import type { BeseitigungsPosition } from './types.js'

/** Art eines Bauteils (Kürzel in der Vorlage: L, A1/A2, S oder U, GWH, Ü1, Keller). */
export type BauteilArt = 'laube' | 'anbau' | 'schuppen' | 'gewaechshaus' | 'vorplatz' | 'keller'

/** Material für den Bauklasse-Assistenten (Richtlinie S. 4–5). */
export type BauMaterial = 'stein' | 'holz-doppelwandig' | 'holz-einwandig' | 'blockhaus' | 'blech'

/** Ein Mängelabzug in einer Gruppe der Mängeltabelle (Richtlinie S. 6–8). */
export interface MangelAbzug {
  /** Gruppe der Mängeltabelle (z. B. 'dach') oder 'eigen' für einen eigenen Posten. */
  gruppe: string
  /** Angekreuzte Mängel (Texte der Tabelle) oder Freitext bei eigenen Mängeln. */
  maengel: string[]
  /** Konkreter Abzug in Prozentpunkten (der Wertermittler setzt ihn; Höchstwert der Gruppe nur als Hinweis). */
  abzug: number
  /** Begründung, Richtlinie S. 4 und 8: Abzüge „rechnerisch darstellen und textlich erläutern“. */
  begruendung: string
}

export interface Bauteil {
  id: string
  art: BauteilArt
  /** Kürzel in der Vorlage, z. B. „L“, „A1“, „S“, „GWH“, „Ü1“. Wird aus der Art vergeben, ist änderbar. */
  kuerzel: string
  /** Freitext, z. B. „Anbau Süd“. */
  bezeichnung?: string
  /** Außenmaße in m (Richtlinie S. 3 Nr. 2); Keller: Innenmaße (S. 11 c). */
  laenge?: number
  breite?: number
  /** Höhe in m (Gewächshaus: Firsthöhe; sonst für die Kubatur). */
  hoehe?: number
  /** Grundfläche in m². Vorschlag Länge × Breite, überschreibbar. */
  flaeche: number
  flaecheManuell?: boolean
  /** Umbauter Raum in m³ (Beseitigungskosten). Vorschlag Fläche × Höhe, überschreibbar. */
  kubaturM3?: number
  /**
   * Fläche, Maße, Höhe und Kubatur kommen aus dem Grundriss („Skizze Bau“, Paket 3), solange ein Teil des Grundrisses
   * mit diesem Bauteil verknüpft ist. `false`: der Wertermittler hat sie von Hand gesetzt, der Grundriss überschreibt sie
   * nicht mehr (Schalter in der Bauteil-Maske).
   */
  ausGrundriss?: boolean

  baujahr?: number
  /** „lt. Bauschein“, „lt. Angabe“, „geschätzt“ (Vorlage D13). */
  baujahrQuelle?: string

  // Bauklasse (nicht für Gewächshaus und Vorplatz)
  material?: BauMaterial
  wanddickeCm?: number
  /** Typenlaube GL 10 bis GL 19 oder einfache Holzlaube bis 4 cm: immer Bauklasse IV.1 (Richtlinie S. 5). */
  typenlaube?: boolean
  /** Text der Vorlage (Baulichkeiten!G12 usw.), z. B. „Stein 17,50 - 23,99 cm “; leer = aus dem Assistenten. */
  typ?: string
  typManuell?: boolean

  /** Mängelabzüge (alle Bauteile; die Mängelliste der Vorlage gilt für die Laube). */
  maengel: MangelAbzug[]

  /** Restnutzungsjahre (vom Wertermittler festzulegen, Vorschlag aus dem Alter). */
  restnutzungsjahre?: number
  rnManuell?: boolean
  /** Begründung der Restnutzungsdauer (Richtlinie S. 9: „im Einzelnen zu begründen“). */
  rnBegruendung?: string

  // Nebenanlagen: Gewächshaus und angebauter Laubenvorplatz
  /** Alterswertminderung je Jahr in % (3, 4, 5, 7 oder 10; mindestens 3, Richtlinie S. 11). */
  minderungProJahr?: number
  /** Normalherstellungskosten €/m² (Gewächshaus: bis 160 €, Richtlinie S. 11). */
  nhk?: number

  // Überdachter Laubenvorplatz (Ü1)
  vorplatzLage?: 'integriert' | 'angebaut'
  vorplatzGuete?: 'hochwertig' | 'minderwertig' | 'ohne'

  /** Zustimmung/Genehmigung liegt vor (Keller, Richtlinie S. 3 Nr. 3). */
  genehmigt?: boolean
  /** Widerrechtlich errichtet oder bautechnisch nicht mehr nutzbar: nicht bewerten, entfernen (S. 3 Nr. 4). */
  nichtBewerten?: boolean
  notiz?: string
}

export type GrubenTyp = 'schachtringe' | 'saniert' | 'kunststoff' | 'beton' | 'tank'

/** Abwassersammelgrube (Richtlinie S. 13–14). */
export interface Grube {
  genehmigtAm?: string // ISO-Datum
  genehmigungNr?: string
  typ?: GrubenTyp
  /** Grundwert €/m³ (Vorschlag nach Typ: 180 / 370 / 470, überschreibbar). */
  grundwert?: number
  /** Inhalt in m³. */
  inhaltM3?: number
  /** Erstellt/saniert im Jahr; daraus das Alter. */
  baujahr?: number
  /** Dichtheitsnachweis vom (ISO-Datum); fehlt er: keine Bewertung (Richtlinie S. 13). */
  dichtheitAm?: string
  dichtheitFehlt?: boolean
  nichtGeleert?: boolean
  abfuhrBescheinigungAm?: string
  /** Nicht betriebsfähig/nicht zugelassen: nicht bewerten, mit Beseitigung beauflagen (S. 14). */
  zuBeseitigen?: boolean
}

/** Kanalisationsanschluss (Richtlinie S. 14). */
export interface Kanal {
  baujahr?: number
  /** Erstellungspreis in €, bewertet bis höchstens 2.200 €. */
  kosten?: number
}

export interface Abwasser {
  art: 'keine' | 'grube' | 'kanal'
  grube: Grube
  kanal: Kanal
}

/** Laube nicht beräumt: Entsorgung des Inventars (Richtlinie S. 20) und Abzug in der Mängeltabelle (S. 8). */
export interface NichtBeraeumt {
  aktiv: boolean
  m3?: number
  /** €/m³, bis 100 € (Richtlinie S. 20). */
  preis?: number
}

/** Ausstattung für die Baubeschreibung (Richtlinie S. 24: Vorhandensein oder Fehlen vermerken). */
export interface BauAusstattung {
  wasser?: 'vorhanden' | 'fehlt'
  wc?: 'wc' | 'trockentoilette' | 'fehlt'
  strom?: 'vorhanden' | 'fehlt'
}

/** Verwendeter Baupreisindex (2015 = 100), mit Quelle; das WEP merkt ihn sich. */
export interface BauIndex {
  /** Jahr der Wertermittlung, für das der Index gilt. */
  jahr: number
  wert: number
  quelle: string
  /** Vom Wertermittler gesetzt (nicht aus der Tabelle der App). */
  manuell?: boolean
}

export interface BauDaten {
  bauteile: Bauteil[]
  abwasser: Abwasser
  nichtBeraeumt: NichtBeraeumt
  ausstattung: BauAusstattung
  /** Baubeschreibung (Freitext). Solange `beschreibungManuell` nicht gesetzt ist, schlägt die App sie aus den Bauteilen vor. */
  beschreibung: string
  beschreibungManuell?: boolean
  /** Zulässige bebaute Gesamtfläche in m² (Standard 24; mehr nur nach Vertragslage, Richtlinie S. 3 Nr. 2). */
  zulaessigeFlaeche?: number
  /** Baupreisindex dieses WEP; fehlt = aus der Tabelle der App bzw. dem Profil. */
  index?: BauIndex
  /** Beseitigungskosten Bau (Anlage 4, Teil 1). */
  beseitigung: BeseitigungsPosition[]
}

export function neueBauDaten(): BauDaten {
  return {
    bauteile: [],
    abwasser: { art: 'keine', grube: {}, kanal: {} },
    nichtBeraeumt: { aktiv: false },
    ausstattung: {},
    beschreibung: '',
    beseitigung: [],
  }
}
