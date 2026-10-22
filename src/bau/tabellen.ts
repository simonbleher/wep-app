// Tabellen der Bewertungsrichtlinie (BewRL, LV Berlin, gültig ab 01.01.2023) und der WEP-Vorlage des BV Pankow
// für den Bau-Teil. Jede Tabelle nennt ihre Quelle mit Seitenzahl (gedruckte Seitenzahl der Richtlinie).
// Nicht von Hand ändern, ohne gegen die Quelle zu prüfen: `src/bau/__tests__/tabellen.test.ts` vergleicht
// diese Tabellen mit der Vorlage (Blatt Tabelle1).

export type Material = 'stein' | 'blockhaus' | 'holz'

/**
 * Bauklasse und Normalherstellungskosten 2015 (NHK) nach Material und Wanddicke.
 * Quelle: Richtlinie S. 5 („Bewertungstabelle“); Texte, Reihenfolge und Spalte im Altersabzug aus der
 * Vorlage, Blatt „Tabelle1“, Bereich `uwe` (J54:N75). `typ` ist der Text, den die Vorlage in Baulichkeiten!G12
 * erwartet (Achtung: teils mit Leerzeichen am Ende, genau so schlägt ihn die Vorlage nach).
 * `spalte`: Spalte der Restnutzungstabelle (2 = Bauklasse I, 3 = II + III, 4 = IV).
 * `von`/`bis`: Wanddicke in cm (einschließlich); `bis: null` = nach oben offen.
 */
export interface NhkEintrag {
  typ: string
  bauklasse: string
  nhk: number
  spalte: 2 | 3 | 4
  material: Material
  von: number
  bis: number | null
}

export const NHK_TABELLE: readonly NhkEintrag[] = [
  { typ: 'Blockhaus 3,01 - 4,99 cm', bauklasse: 'IV.2', nhk: 325, spalte: 4, material: 'blockhaus', von: 3.01, bis: 4.99 },
  { typ: 'Blockhaus 6,00 - 7,49 cm', bauklasse: 'III.1', nhk: 420, spalte: 3, material: 'blockhaus', von: 6.0, bis: 7.49 },
  { typ: 'Blockhaus 7,50 - 8,99 cm', bauklasse: 'III.2', nhk: 555, spalte: 3, material: 'blockhaus', von: 7.5, bis: 8.99 },
  { typ: 'Blockhaus ab 5,00 cm', bauklasse: 'IV.3', nhk: 420, spalte: 4, material: 'blockhaus', von: 5.0, bis: 5.99 },
  { typ: 'Blockhaus ab 9,0 cm ', bauklasse: 'III.3', nhk: 672, spalte: 3, material: 'blockhaus', von: 9.0, bis: null },
  { typ: 'Blockhaus bis 3,00 cm ', bauklasse: 'IV.1', nhk: 265, spalte: 4, material: 'blockhaus', von: 0, bis: 3.0 },
  { typ: 'Doppelt Holz 10,01 - 14,99 cm', bauklasse: 'III.1', nhk: 420, spalte: 3, material: 'holz', von: 10.01, bis: 14.99 },
  { typ: 'Doppelt Holz 15,00 - 19,99 cm ', bauklasse: 'III.2', nhk: 555, spalte: 3, material: 'holz', von: 15.0, bis: 19.99 },
  { typ: 'Doppelt Holz ab 20,00 cm', bauklasse: 'III.3', nhk: 672, spalte: 3, material: 'holz', von: 20.0, bis: null },
  { typ: 'Doppelwand 4,01 - 8,00 cm ', bauklasse: 'IV.2', nhk: 325, spalte: 4, material: 'holz', von: 4.01, bis: 8.0 },
  { typ: 'Doppelwand 8,01 - 10,00 cm', bauklasse: 'IV.3', nhk: 420, spalte: 4, material: 'holz', von: 8.01, bis: 10.0 },
  { typ: 'Doppelwand bis 4,00 cm', bauklasse: 'IV.1', nhk: 265, spalte: 4, material: 'holz', von: 0, bis: 4.0 },
  { typ: 'Stein 10,00 - 12,00 cm', bauklasse: 'II.1', nhk: 350, spalte: 3, material: 'stein', von: 10.0, bis: 12.0 },
  { typ: 'Stein 12,01 - 17,49 cm', bauklasse: 'II.3', nhk: 490, spalte: 3, material: 'stein', von: 12.01, bis: 17.49 },
  { typ: 'Stein 17,50 - 23,99 cm ', bauklasse: 'I.1', nhk: 515, spalte: 2, material: 'stein', von: 17.5, bis: 23.99 },
  { typ: 'Stein 24,00 - 35,99 cm', bauklasse: 'I.2', nhk: 595, spalte: 2, material: 'stein', von: 24.0, bis: 35.99 },
  { typ: 'Stein ab 36,00 cm', bauklasse: 'I.3', nhk: 704, spalte: 2, material: 'stein', von: 36.0, bis: null },
]

/** Vorlage-Eintrag „fehlt“ (keine Bauklasse): NHK 0, Spalte 5 (Abzug 0). */
export const TYP_FEHLT = 'fehlt'

/**
 * Restnutzungsjahre → Abschreibung (Abzug) in %, je Spalte [Bauklasse I, II + III, IV].
 * Quelle: Richtlinie S. 10 („Restnutzungsjahre der Baulichkeiten“), identisch mit der Vorlage, Blatt „Tabelle1“,
 * Bereich `nelke` (B3:E83). Index = Restnutzungsjahre (0–80). `null` = Zelle in der Tabelle leer (Bauklasse
 * IV endet bei 40 Jahren, II + III bei 60, I bei 80); die Excel-Formel (SVERWEIS) liefert dort 0.
 */
export const RESTNUTZUNG: readonly (readonly [number | null, number | null, number | null])[] = [
  [100, 100, 100], // 0
  [98, 98, 98], // 1
  [96, 96, 96], // 2
  [94, 94, 94], // 3
  [92, 92, 92], // 4
  [90, 90, 90], // 5
  [89.8, 89, 86.2], // 6
  [89.6, 88, 82.4], // 7
  [89.3, 87, 78.6], // 8
  [88.9, 86, 74.8], // 9
  [88.5, 85, 71], // 10
  [88.2, 82.2, 67.6], // 11
  [86.4, 79.4, 64.2], // 12
  [84.6, 76.6, 60.8], // 13
  [82.8, 73.8, 57.4], // 14
  [81, 71, 54], // 15
  [79, 68.8, 51.2], // 16
  [77, 66.6, 48.4], // 17
  [75, 64.4, 45.6], // 18
  [73, 62.2, 42.8], // 19
  [71, 60, 40], // 20
  [69.2, 57.8, 37.8], // 21
  [67.4, 55.6, 35.6], // 22
  [65.6, 53.4, 33.4], // 23
  [63.8, 51.2, 31.2], // 24
  [62, 49, 29], // 25
  [60.4, 47.2, 27.4], // 26
  [58.8, 45.4, 25.8], // 27
  [57.2, 43.6, 24.2], // 28
  [55.6, 41.8, 22.6], // 29
  [54, 40, 21], // 30
  [52.6, 38.4, 20.1], // 31
  [51.2, 36.8, 19.2], // 32
  [49.8, 35.2, 18.3], // 33
  [48.4, 33.6, 17.4], // 34
  [47, 32, 16.5], // 35
  [45.6, 30.8, 15.2], // 36
  [44.2, 29.6, 13.9], // 37
  [42.8, 28.4, 12.6], // 38
  [41.4, 27.2, 11.3], // 39
  [40, 26, 10], // 40
  [38.8, 25, null], // 41
  [37.6, 24, null], // 42
  [36.4, 23, null], // 43
  [35.2, 22, null], // 44
  [34, 21, null], // 45
  [33, 20.4, null], // 46
  [32, 19.8, null], // 47
  [31, 19.2, null], // 48
  [30, 18.6, null], // 49
  [29, 18, null], // 50
  [28.2, 17.5, null], // 51
  [27.4, 17, null], // 52
  [26.6, 16.5, null], // 53
  [25.8, 16, null], // 54
  [25, 15.5, null], // 55
  [24.2, 14.4, null], // 56
  [23.4, 13.3, null], // 57
  [22.6, 12.2, null], // 58
  [21.8, 11.1, null], // 59
  [21, 10, null], // 60
  [20.3, null, null], // 61
  [19.6, null, null], // 62
  [18.9, null, null], // 63
  [18.2, null, null], // 64
  [17.5, null, null], // 65
  [17.3, null, null], // 66
  [17.1, null, null], // 67
  [16.9, null, null], // 68
  [16.7, null, null], // 69
  [16.5, null, null], // 70
  [16.3, null, null], // 71
  [16.1, null, null], // 72
  [15.9, null, null], // 73
  [15.7, null, null], // 74
  [15.5, null, null], // 75
  [14.4, null, null], // 76
  [13.3, null, null], // 77
  [12.2, null, null], // 78
  [11.1, null, null], // 79
  [10, null, null], // 80
]

// ---------------------------------------------------------------------------
// Mängeltabelle (Richtlinie S. 6–8)
// ---------------------------------------------------------------------------

export interface MangelGruppe {
  id: string
  name: string
  /** Höchstabzug in % der NHK (Richtlinie S. 6–8). */
  max: number
  /** Zelle „Abzug konkret“ im Blatt „Mängelliste“ der Vorlage. */
  zelle: string
  seite: string
  maengel: readonly string[]
}

export const MAENGEL_GRUPPEN: readonly MangelGruppe[] = [
  {
    id: 'dach', name: 'Dach', max: 20, zelle: 'F5', seite: 'S. 6',
    maengel: [
      'Sparren – Abstand nicht fachgerecht, größer als 60–80 cm', 'Sparren – Risse durch Belastung', 'Dach nicht horizontal',
      'Regenrinne oder Fallrohr nicht fachgerecht', 'Fallrohr ohne Ableitung von der Laube', 'Dachoberfläche beschädigt',
      'Dachoberfläche nicht fachgerecht', 'keine Traufkante', 'Ortgang fehlerhaft oder fehlt', 'Dachfenster / Dachluke fehlerhaft',
      'muffiger Geruch unter dem Dach', 'Feuchtigkeit in der Dachkonstruktion', 'Schornstein fehlerhaft',
      'Schornstein ohne Kehrbescheinigung', 'Moose und Flechten', 'unzulässige Höhe der Laube (nur Vorlage)',
    ],
  },
  {
    id: 'decken', name: 'Decken', max: 10, zelle: 'F13', seite: 'S. 6',
    maengel: ['Decke hängt durch', 'Risse', 'Feuchtigkeitsflecken', 'loser Putz / Hohlstellen', 'Verkleidung defekt', 'Anstrich'],
  },
  {
    id: 'waende', name: 'Wände', max: 13, zelle: 'F16', seite: 'S. 6',
    maengel: [
      'Rohmauerwerk', 'Hohlstellen im Putz', 'Risse', 'defekte Verkleidung', 'Feuchtigkeitsflecken', 'Horizontalsperre defekt',
      'Wände nicht lotrecht', 'keine fachgerechte Ausführung', 'offene Fugen',
    ],
  },
  {
    id: 'fussboden', name: 'Fußboden', max: 10, zelle: 'F21', seite: 'S. 7',
    maengel: ['Hohlstellen im Estrich', 'Risse', 'Dielung gibt nach', 'Fußboden nicht waagerecht', 'Feuchtigkeitsflecken', 'Belag verschlissen'],
  },
  {
    id: 'fundament', name: 'Fundament', max: 20, zelle: 'F24', seite: 'S. 7',
    maengel: [
      'Fundamenttiefe nicht erkennbar', 'Setzungen', 'Brüche', 'kein Spritzwassersockel (mindestens 25 cm)', 'Spritzwassersockel fehlerhaft',
      'nicht maßgerecht', 'keine fachgerechte Ausführung (Festigkeit)',
    ],
  },
  {
    id: 'ausbauAussen', name: 'Ausbau außen', max: 5, zelle: 'F28', seite: 'S. 7',
    maengel: ['Anstrich fehlerhaft', 'Verkleidung fehlerhaft', 'Regenrinne fehlerhaft', 'Fallrohre fehlerhaft'],
  },
  {
    id: 'ausbauInnen', name: 'Ausbau innen', max: 7, zelle: 'F30', seite: 'S. 7',
    maengel: [
      'Rückflussverhinderer fehlt', 'Anstrich, Tapeten, Verkleidung fehlerhaft', 'Fußbodenbelag fehlerhaft', 'Treppen, Leitern fehlerhaft',
      'Fliesen fehlerhaft', 'Wasseranschluss fehlerhaft (nur bei vorhandener Abwassersammelanlage)',
    ],
  },
  {
    id: 'bauelemente', name: 'Bauelemente', max: 5, zelle: 'F34', seite: 'S. 7–8',
    maengel: [
      'Fenster – Anstrich defekt', 'Fenster – Glasdichtung fehlerhaft (Kitt)', 'Fenster klemmt', 'Fenster undicht',
      'Fensterläden nicht ordnungsgemäß', 'Fensterläden – Anstrich defekt', 'Tür nicht für Außenbereich geeignet', 'Tür klemmt',
      'Tür undicht', 'Tür – Anstrich defekt', 'Einbruchschäden',
    ],
  },
  { id: 'schaedlinge', name: 'Schädlinge', max: 10, zelle: 'F40', seite: 'S. 8', maengel: ['Schimmel', 'Marder, Ratten …', 'Hausschwamm', 'Taubenkot'] },
  { id: 'sonderabfall', name: 'Sonderabfall bei Weiternutzung', max: 10, zelle: 'F42', seite: 'S. 8', maengel: ['Asbest', 'Dachpappe'] },
  { id: 'beraeumt', name: 'Laube nicht beräumt', max: 10, zelle: 'F43', seite: 'S. 8', maengel: [] },
  { id: 'unfertig', name: 'Nicht fertiggestellt (je nach Zustand)', max: 100, zelle: 'F44', seite: 'S. 8', maengel: [] },
]

export const MANGEL_EIGEN = 'eigen'

// ---------------------------------------------------------------------------
// Sonstige bauliche Anlagen (Richtlinie S. 11)
// ---------------------------------------------------------------------------

/** Gewächshaus: höchstens 12 m², Firsthöhe höchstens 2,20 m, NHK 160 €/m² (S. 11 a). */
export const GEWAECHSHAUS = { maxFlaecheM2: 12, maxFirsthoeheM: 2.2, nhk: 160, seite: 'S. 11' } as const

/** Zulässige Gesamtfläche der Laube mit Anbauten und überdachtem Vorplatz (S. 3 Nr. 2 und 3, S. 11 d). */
export const ZULAESSIGE_FLAECHE_M2 = 24

/** Alterswertminderung je Jahr in % für sonstige Anlagen; mindestens 3 % (S. 11). Lebenserwartung nach der Vorlage (Kommentar G40). */
export const MINDERUNG_PRO_JAHR = [
  { prozent: 3, jahre: 33 },
  { prozent: 4, jahre: 25 },
  { prozent: 5, jahre: 20 }, // Regelwert
  { prozent: 7, jahre: 15 },
  { prozent: 10, jahre: 10 },
] as const
export const MINDERUNG_MIN = 3
export const MINDERUNG_REGEL = 5

/** Überdachter Laubenvorplatz, Höchstwerte €/m² (Richtlinie S. 11). */
export const VORPLATZ_HOECHST = { integriert: 275, hochwertig: 175, minderwertig: 80 } as const
/** Regelwerte „integriert“ nach Bauklasse der Laube laut Kommentar der Vorlage (Baulichkeiten!E63): I 275, II/III 225, IV 175. */
export const VORPLATZ_INTEGRIERT_REGEL = { I: 275, 'II/III': 225, IV: 175 } as const

// ---------------------------------------------------------------------------
// Abwasser (Richtlinie S. 13–14)
// ---------------------------------------------------------------------------

export const GRUBEN_TYPEN = [
  { id: 'schachtringe', text: 'Schachtringe', grundwert: 180 },
  { id: 'saniert', text: 'durch Fachfirma saniert (ab Sanierungsdatum)', grundwert: 370 },
  { id: 'kunststoff', text: 'einwandige Kunststoffgrube (DIBt)', grundwert: 470 },
  { id: 'beton', text: 'monolithische Betongrube', grundwert: 470 },
  { id: 'tank', text: 'Abwassersammeltank', grundwert: 470 },
] as const

/** Alterswertminderung der Grube: 3 % je Jahr, von den Höchstwerten ausgehend (S. 13). */
export const GRUBE_MINDERUNG_PRO_JAHR = 3
/** Tanks und monolithische Betongruben mit gültigem Dichtheitsnachweis: nach 16 Jahren nicht weiter abschreiben (S. 14; Kommentar Vorlage F74). */
export const GRUBE_MAX_ALTER_TANK = 16
/** Abzug bei nicht geleerter Grube (S. 14); in der Vorlage Baulichkeiten!K77 mit Minuszeichen. */
export const GRUBE_NICHT_GELEERT_ABZUG = 150
export const KANAL_HOECHSTWERT = 2200

// ---------------------------------------------------------------------------
// Beseitigungskosten (Richtlinie S. 19–20)
// ---------------------------------------------------------------------------

/** Höchstwerte je m³ des umbauten Raumes nach Bauklasse (S. 19). */
export const BESEITIGUNG_JE_M3 = { I: 180, II: 180, III: 150, IV: 120 } as const
export const BESEITIGUNG_VORPLATZ_JE_M2 = 100
export const BESEITIGUNG_SONDERABFALL_JE_M3 = 1000
export const BESEITIGUNG_SCHORNSTEIN = 250
export const BESEITIGUNG_GAUBE = 1500
export const BESEITIGUNG_INVENTAR_JE_M3 = 100
export const BESEITIGUNG_GRUBE_JE_M3 = 250
export const BESEITIGUNG_GRUBE_ABFUHR = 150
export const BESEITIGUNG_UNRAT_JE_M3 = 200
/** Zuschlag für besondere Erschwernisse bis zu 300 % (S. 19), also Faktor bis 4. */
export const BESEITIGUNG_MAX_FAKTOR = 4

/** Textbausteine der Vorlage (Blatt „Beseitigungskosten“, M11:M25) für Abschnitt 1 (Bau). */
export const BESEITIGUNG_TEXTBAUSTEINE: readonly { text: string; einheit?: string; preis?: number; seite?: string }[] = [
  { text: 'Rückbau Anbau1 s. - Skizze Bau', einheit: 'm³' },
  { text: 'Rückbau Keller s. - Skizze Bau', einheit: 'm³' },
  { text: 'Rückbau LVP komplett Ü1 ohne Bodenplatte  s. -Skizze Bau', einheit: 'm²', preis: BESEITIGUNG_VORPLATZ_JE_M2, seite: 'S. 19' },
  { text: 'Schornsteinmauerwerk fachgerecht entsorgen.', einheit: 'Stück', preis: BESEITIGUNG_SCHORNSTEIN, seite: 'S. 19' },
  { text: 'Sondermüll mit Nachweis entfernen', einheit: 'm³', preis: BESEITIGUNG_SONDERABFALL_JE_M3, seite: 'S. 19' },
  { text: 'Well-/Ebenasbest ist Sondermüll, es ist enstsprechend der GefStoffV i.V.m. der TRGS 519 zu demontieren und zu entsorgen.', einheit: 'm³', preis: BESEITIGUNG_SONDERABFALL_JE_M3, seite: 'S. 19' },
  { text: 'bitumenhaltige Stoffe sind enstsprechend der GefStoffV i.V.m. der TRGS 519 zu demontieren und zu entsorgen.', einheit: 'm³', preis: BESEITIGUNG_SONDERABFALL_JE_M3, seite: 'S. 19' },
  { text: 'Entsorgung Sonderbaustoffe mit Nachweis', einheit: 'm³', preis: BESEITIGUNG_SONDERABFALL_JE_M3, seite: 'S. 19' },
  { text: 'Entsorgung mit Nachweis', einheit: 'm³' },
  { text: 'Entsorgung unterschiedlicher Gegenstände', einheit: 'm³', preis: BESEITIGUNG_INVENTAR_JE_M3, seite: 'S. 20' },
  { text: 'nicht genutzte Baustoffe entfernen', einheit: 'm³', preis: BESEITIGUNG_UNRAT_JE_M3, seite: 'S. 20' },
  { text: 'Unrat aus Baulichkeiten entfernen', einheit: 'm³', preis: BESEITIGUNG_UNRAT_JE_M3, seite: 'S. 20' },
  { text: 'Sat.- Antenne entfernen', einheit: 'Stück' },
]
