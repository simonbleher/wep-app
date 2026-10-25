// Regel-Hinweise des Bau-Teils. Nur Warnungen und Infos, nie Sperren („Nichts sperren, nur warnen“).
// Jede Regel nennt ihre Quelle (Seite der Richtlinie, gedruckte Seitenzahl).
import type { Hinweis, Bauteil, Wep } from '../model'
import { GEWAECHSHAUS, GRUBE_MAX_ALTER_TANK, GRUBE_NICHT_GELEERT_ABZUG, MAENGEL_GRUPPEN, MINDERUNG_MIN, VORPLATZ_HOECHST, ZULAESSIGE_FLAECHE_M2, KANAL_HOECHSTWERT, BESEITIGUNG_INVENTAR_JE_M3, BESEITIGUNG_MAX_FAKTOR } from './tabellen'
import { assistentLuecke } from './assistent'
import { alterInJahren, berechneBau, grubeMaxAlter, mangelProzent, nachweisVorhanden, tabellenEnde, typFuer, wertjahrVon, type BauErgebnis, type BauOptionen } from './rechnen'

export interface BauHinweis extends Hinweis {
  /** Bauteil, auf das sich der Hinweis bezieht (fehlt = ganzes WEP). */
  bauteilId?: string
  /** Bereich der Oberfläche */
  bereich?: 'bauteile' | 'maengel' | 'abwasser' | 'beseitigung' | 'index'
}

const warn = (text: string, regel: string, extra: Partial<BauHinweis> = {}): BauHinweis => ({ schwere: 'warnung', text, regel, ...extra })
const info = (text: string, regel: string, extra: Partial<BauHinweis> = {}): BauHinweis => ({ schwere: 'info', text, regel, ...extra })
const m2 = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} m²`

const nenne = (b: Bauteil) => (b.bezeichnung ? `${b.kuerzel} (${b.bezeichnung})` : b.kuerzel)

/** Hinweise zu einem Bauteil. */
export function hinweiseBauteil(b: Bauteil, erg: BauErgebnis): BauHinweis[] {
  const h: BauHinweis[] = []
  const id = { bauteilId: b.id, bereich: 'bauteile' as const }
  const n = nenne(b)
  const wj = erg.wertjahr

  if (b.nichtBewerten) {
    h.push(
      warn(`${n} wird nicht bewertet (widerrechtlich errichtet oder nicht mehr nutzbar) und ist zu entfernen.`, 'Richtlinie S. 3 Nr. 4', {
        ...id,
        beseitigung: { gegenstand: `Rückbau ${n} s. Skizze Bau`, einheit: b.art === 'vorplatz' ? 'm²' : 'm³', menge: b.art === 'vorplatz' ? b.flaeche : (b.kubaturM3 ?? 0) },
      }),
    )
    return h
  }
  if (b.id === erg.schuppen?.bauteil.id && erg.schuppen.nichtBewertetWegenLaube) {
    h.push(
      info(
        `${n} wird nicht bewertet: Schuppen und Unterstände zählen nicht, solange es eine Laube gibt. Ist er in Wahrheit die Laube, bitte als Laube eintragen. Zu entfernende Teile gehören in die Beseitigungskosten.`,
        'Richtlinie',
        id,
      ),
    )
    return h
  }
  if (!(b.flaeche > 0) && b.art !== 'vorplatz') h.push(warn(`${n}: Fläche fehlt – ohne Fläche kein Wert.`, 'Richtlinie S. 3 Nr. 2', id))
  if (!b.baujahr) h.push(warn(`${n}: Baujahr fehlt. Das Jahr der Errichtung weist der scheidende Unterpächter nach, sonst schätzt es der Wertermittler (Quelle vermerken).`, 'Richtlinie S. 9', id))
  else if (b.baujahr > wj) h.push(warn(`${n}: Baujahr liegt nach dem Jahr der Wertermittlung.`, 'Richtlinie S. 8', id))

  const hauptArt = b.art === 'laube' || b.art === 'anbau' || b.art === 'schuppen' || b.art === 'keller'
  if (hauptArt) {
    const typ = typFuer(b)
    if (typ === 'fehlt') {
      const luecke = assistentLuecke(b)
      h.push(warn(`${n}: Bauklasse fehlt, die NHK ist 0 €. ${luecke ?? ''}`.trim(), 'Richtlinie S. 5', id))
    }
    const e = [erg.laube, ...erg.anbauten, erg.schuppen].find((x) => x?.bauteil.id === b.id)
    if (e && e.spalte !== 5) {
      if (e.restnutzungsjahre === undefined) {
        h.push(warn(`${n}: Restnutzungsjahre fehlen – die Vorlage rechnet dann mit 0 Jahren, also 100 % Altersabzug.`, 'Richtlinie S. 8–10', id))
      } else if (e.restnutzungsjahre < 0) {
        h.push(warn(`${n}: Restnutzungsjahre dürfen nicht negativ sein.`, 'Richtlinie S. 10', id))
      } else {
        const spalte = e.spalte as 2 | 3 | 4
        if (e.restnutzungsjahre > tabellenEnde(spalte)) {
          h.push(
            warn(
              `${n}: Die Restnutzungstabelle endet für Bauklasse ${e.bauklasse} bei ${tabellenEnde(spalte)} Jahren; darüber rechnet die Vorlage mit 0 % Altersabzug.`,
              'Richtlinie S. 10',
              id,
            ),
          )
        }
        const alter = alterInJahren(b.baujahr, wj)
        if (alter !== undefined && alter >= tabellenEnde(spalte) && e.restnutzungsjahre > 20) {
          h.push(
            warn(
              `${n}: Bei wirtschaftlich abgeschriebenen Lauben ist der Erhaltungszustand festzustellen; auch bei mangelfreiem Zustand höchstens 20 Jahre Restnutzung, mit Begründung.`,
              'Richtlinie S. 8–9',
              id,
            ),
          )
        }
      }
      if (e.abgeschrieben) {
        h.push(info(`${n} ist wirtschaftlich abgeschrieben (Altersabzug 100 %) – Wert 0 €. Erhaltungszustand prüfen: Die Restnutzungsdauer kann bei regelmäßiger Instandhaltung verlängert werden.`, 'Richtlinie S. 8–9', id))
      }
      if (b.rnManuell && !b.rnBegruendung?.trim()) {
        h.push(info(`${n}: Die Restnutzungsdauer ist vom Wertermittler im Einzelnen zu begründen.`, 'Richtlinie S. 9', id))
      }
    }
    if (b.art === 'keller') {
      if (!b.genehmigt) h.push(warn(`${n}: Kellerräume sind nur zu bewerten, wenn Zustimmungen oder Genehmigungen vorliegen.`, 'Richtlinie S. 3 Nr. 3', { ...id, beseitigung: { gegenstand: 'Rückbau Keller s. - Skizze Bau', einheit: 'm³', menge: b.kubaturM3 ?? 0 } }))
      if (e && e.bauklasse && !e.bauklasse.startsWith('II.')) h.push(warn(`${n}: Für Keller ist grundsätzlich die Bauklasse II zu Grunde zu legen.`, 'Richtlinie S. 11 c)', id))
      const laubeRn = erg.laube?.restnutzungsjahre
      if (e && laubeRn !== undefined && e.restnutzungsjahre !== undefined && e.restnutzungsjahre > laubeRn) {
        h.push(warn(`${n}: Die Restnutzungsjahre dürfen die der Laube (${laubeRn}) nicht überschreiten.`, 'Richtlinie S. 11 c)', id))
      }
    }
  }

  if (b.art === 'gewaechshaus') {
    if (b.flaeche > GEWAECHSHAUS.maxFlaecheM2) h.push(warn(`Gewächshaus ${m2(b.flaeche)}: bewertet werden nur Gewächshäuser bis ${GEWAECHSHAUS.maxFlaecheM2} m² Grundfläche.`, 'Richtlinie S. 11 a)', id))
    if ((b.hoehe ?? 0) > GEWAECHSHAUS.maxFirsthoeheM) h.push(warn(`Gewächshaus: Firsthöhe über ${String(GEWAECHSHAUS.maxFirsthoeheM).replace('.', ',')} m.`, 'Richtlinie S. 11 a)', id))
    if ((b.nhk ?? GEWAECHSHAUS.nhk) > GEWAECHSHAUS.nhk) h.push(warn(`Gewächshaus: NHK höchstens ${GEWAECHSHAUS.nhk} € je m².`, 'Richtlinie S. 11 a)', id))
  }
  if (b.art === 'gewaechshaus' || (b.art === 'vorplatz' && b.vorplatzLage === 'angebaut')) {
    const j = b.minderungProJahr
    if (j === undefined) h.push(warn(`${n}: Alterswertminderung je Jahr fehlt (mindestens ${MINDERUNG_MIN} % jährlich, Regelwert 5 %).`, 'Richtlinie S. 11', id))
    else if (j < MINDERUNG_MIN) h.push(warn(`${n}: Bei sonstigen Anlagen sind Alterswertminderungen von mindestens ${MINDERUNG_MIN} % jährlich vorzunehmen.`, 'Richtlinie S. 11', id))
    if (erg.gewaechshaus?.bauteil.id === b.id && erg.gewaechshaus.abgeschrieben) h.push(info(`${n} ist abgeschrieben (über 99 % Altersabzug) – Wert 0 €.`, 'Richtlinie S. 11', id))
  }
  if (b.art === 'vorplatz') {
    const lage = b.vorplatzLage ?? 'integriert'
    if (lage === 'integriert' && !erg.laube) h.push(warn('Vorplatz „integriert“ braucht eine Laube: Mängel- und Altersabzug werden von der Laube übernommen.', 'Vorlage Baulichkeiten E64', id))
    const grenze = lage === 'integriert' ? VORPLATZ_HOECHST.integriert : b.vorplatzGuete === 'minderwertig' ? VORPLATZ_HOECHST.minderwertig : VORPLATZ_HOECHST.hochwertig
    if (erg.vorplatz && erg.vorplatz.nhk > grenze) h.push(warn(`Vorplatz: höchstens ${grenze} € je m².`, 'Richtlinie S. 11', id))
    if (lage === 'angebaut' && (b.vorplatzGuete ?? 'ohne') === 'ohne') h.push(warn('Vorplatz „angebaut“ ohne Güte wird mit 0 € bewertet.', 'Vorlage Baulichkeiten B67', id))
    const flaecheVp = erg.vorplatz
    if (b.flaeche > 0 && flaecheVp && flaecheVp.flaeche < b.flaeche) h.push(warn(`Vorplatz: ${m2(b.flaeche - flaecheVp.flaeche)} werden nicht berechnet, weil die Gesamtfläche ${m2(ZULAESSIGE_FLAECHE_M2)} überschritten würde.`, 'Richtlinie S. 11 d)', id))
  }
  const platzFehlt = erg.ueberzaehlig.some((x) => x.id === b.id)
  if (platzFehlt) h.push(warn(`${n}: Die Vorlage hat dafür keinen Platz (je ein Laube-, Gewächshaus-, Vorplatz- und Schuppen/Keller-Block, zwei Anbauten). Das Bauteil wird nicht exportiert.`, 'Vorlage Baulichkeiten', id))
  return h
}

/** Alle Hinweise des Bau-Teils (Bauteile, Fläche, Mängel, Abwasser, Beseitigung, Index). */
export function hinweiseBau(wep: Pick<Wep, 'bau' | 'formalien'>, optionen: BauOptionen = {}): BauHinweis[] {
  const bau = wep.bau
  if (!bau) return []
  const erg = berechneBau(wep, optionen)!
  const h: BauHinweis[] = []

  // Index
  if (!erg.index) h.push(warn(`Kein Baupreisindex für ${erg.wertjahr} bekannt – bitte im Profil oder am WEP eintragen. Ohne Index ist jeder Wert 0 €.`, 'Richtlinie S. 11', { bereich: 'index' }))
  else if (erg.index.ersatz) h.push(warn(`Für ${erg.wertjahr} liegt kein Baupreisindex vor; verwendet wird der Wert für ${erg.index.ersatzJahr} (${String(erg.index.wert).replace('.', ',')}). Bitte den Novemberwert des Vorjahres im Profil eintragen.`, 'Richtlinie S. 11', { bereich: 'index' }))

  // Fläche
  const lauben = bau.bauteile.filter((b) => b.art === 'laube')
  if (lauben.length > 1) h.push(warn('Mehr als eine Laube erfasst; die Vorlage hat nur einen Laube-Block.', 'Vorlage Baulichkeiten', { bereich: 'bauteile' }))
  const zulaessig = bau.zulaessigeFlaeche ?? ZULAESSIGE_FLAECHE_M2
  if (erg.laube && erg.laube.nichtBerechnet > 0) {
    h.push(warn(`Laube ${m2(erg.laube.bauteil.flaeche)} (Außenmaße) ist größer als ${m2(zulaessig)}: ${m2(erg.laube.nichtBerechnet)} werden nicht berechnet. Eine weitergehende Bewertung ist nur nach Maßgabe der Vertragslage zulässig; Lauben über 24 m² sind auf das vertraglich zulässige Maß zurückzubauen.`, 'Richtlinie S. 3 Nr. 2, S. 24', { bauteilId: erg.laube.bauteil.id, bereich: 'bauteile' }))
  }
  for (const a of erg.anbauten) {
    if (a.nichtBerechnet > 0) {
      h.push(warn(`Anbau ${nenne(a.bauteil)}: ${m2(a.nichtBerechnet)} werden nicht berechnet – Anbauten dürfen nur bewertet werden, wenn Laube und Anbauten zusammen ${m2(zulaessig)} nicht überschreiten.`, 'Richtlinie S. 3 Nr. 3', { bauteilId: a.bauteil.id, bereich: 'bauteile' }))
    }
  }
  const aussenmasse = bau.bauteile.some((b) => b.laenge || b.breite)
  if (aussenmasse) h.push(info('Maßgebend sind die Außenmaße; das Aufmaß der Laube beginnt ab Fußbodenoberkante.', 'Richtlinie S. 3 Nr. 2'))

  for (const b of bau.bauteile) h.push(...hinweiseBauteil(b, erg))

  // Mängel
  for (const b of bau.bauteile) {
    const gesamt = mangelProzent(b)
    if (gesamt > 100) h.push(warn(`${nenne(b)}: Der Mängelabzug beträgt insgesamt ${String(gesamt).replace('.', ',')} % – über 100 %.`, 'Richtlinie S. 6–8', { bauteilId: b.id, bereich: 'maengel' }))
    for (const m of b.maengel) {
      const g = MAENGEL_GRUPPEN.find((x) => x.id === m.gruppe)
      if (g && m.abzug > g.max && g.id !== 'unfertig') {
        h.push(warn(`${nenne(b)}, ${g.name}: Abzug ${String(m.abzug).replace('.', ',')} % liegt über dem Höchstwert von ${g.max} %.`, `Richtlinie ${g.seite}`, { bauteilId: b.id, bereich: 'maengel' }))
      }
      if (m.abzug > 0 && !m.begruendung.trim()) {
        h.push(info(`${nenne(b)}, ${g?.name ?? 'eigener Mangel'}: Abzug bitte begründen und genau bezeichnen.`, 'Richtlinie S. 4 Nr. 8, S. 8', { bauteilId: b.id, bereich: 'maengel' }))
      }
      if (m.abzug < 0) h.push(warn(`${nenne(b)}: Negativer Mängelabzug.`, 'Richtlinie S. 6–8', { bauteilId: b.id, bereich: 'maengel' }))
    }
  }

  // Abwasser
  const a = bau.abwasser
  if (a.art === 'grube') {
    const g = a.grube
    if (!g.genehmigtAm) h.push(warn('Abwassersammelgrube: Es werden nur genehmigte Anlagen bewertet – Genehmigungsdatum fehlt.', 'Richtlinie S. 13', { bereich: 'abwasser' }))
    if (!nachweisVorhanden(g)) h.push(warn('Abwassersammelgrube ohne gültigen Dichtheitsnachweis wird nicht bewertet (0 €).', 'Richtlinie S. 13', { bereich: 'abwasser' }))
    if (g.zuBeseitigen) {
      h.push(warn('Nicht betriebsfähige oder nicht zugelassene Abwassersammelanlage: mit Beseitigung beauflagen, nicht bewerten.', 'Richtlinie S. 14', { bereich: 'abwasser', beseitigung: { gegenstand: 'Abwassergrube entfernen und verfüllen', einheit: 'm³', menge: g.inhaltM3 ?? 0 } }))
    }
    if (g.nichtGeleert) h.push(info(`Nicht geleerte Grube: Bewertung um ${GRUBE_NICHT_GELEERT_ABZUG} € gesenkt; die erfolgte Abfuhr ist nachzuweisen.`, 'Richtlinie S. 14', { bereich: 'abwasser' }))
    const alter = alterInJahren(g.baujahr, erg.wertjahr)
    if (alter === undefined && !g.zuBeseitigen) h.push(warn('Abwassersammelgrube: Baujahr bzw. Sanierungsjahr fehlt – ohne Alter keine Alterswertminderung.', 'Richtlinie S. 13', { bereich: 'abwasser' }))
    if (alter !== undefined && alter > grubeMaxAlter(g.typ)) {
      h.push(info(`Alter ${alter} Jahre: gerechnet wird mit höchstens ${grubeMaxAlter(g.typ)} Jahren (Tanks und monolithische Betongruben mit gültigem Nachweis werden nach ${GRUBE_MAX_ALTER_TANK} Jahren nicht weiter abgeschrieben).`, 'Richtlinie S. 14', { bereich: 'abwasser' }))
    }
    if (g.grundwert !== undefined && g.grundwert > 470) h.push(warn('Grundwert über 470 € je m³.', 'Richtlinie S. 13', { bereich: 'abwasser' }))
    if (!g.zuBeseitigen && !(g.inhaltM3 && g.inhaltM3 > 0)) h.push(warn('Abwassersammelgrube: Inhalt in m³ fehlt.', 'Richtlinie S. 13', { bereich: 'abwasser' }))
  }
  if (a.art === 'kanal') {
    const k = a.kanal
    if (!(k.kosten && k.kosten > 74)) h.push(warn('Kanalisationsanschluss: Der Erstellungspreis fehlt (die Vorlage wertet erst ab 75 €).', 'Richtlinie S. 14', { bereich: 'abwasser' }))
    if ((k.kosten ?? 0) > KANAL_HOECHSTWERT) h.push(info(`Bewertet wird höchstens ${KANAL_HOECHSTWERT.toLocaleString('de-DE')} €.`, 'Richtlinie S. 14', { bereich: 'abwasser' }))
    if (alterInJahren(k.baujahr, erg.wertjahr) === undefined) h.push(warn('Kanalisationsanschluss: Baujahr fehlt – ohne Alter bewertet die Vorlage mit 0 €.', 'Vorlage Baulichkeiten E79', { bereich: 'abwasser' }))
  }
  const nb = bau.nichtBeraeumt
  if (nb.aktiv) {
    if ((nb.preis ?? 0) > BESEITIGUNG_INVENTAR_JE_M3) h.push(warn(`Entsorgung des Inventars höchstens ${BESEITIGUNG_INVENTAR_JE_M3} € je m³.`, 'Richtlinie S. 20', { bereich: 'abwasser' }))
    if (!(nb.m3 && nb.m3 > 0)) h.push(warn('Laube nicht beräumt: Menge in m³ fehlt.', 'Richtlinie S. 20', { bereich: 'abwasser' }))
    h.push(info('Laube nicht beräumt: zusätzlich ein Abzug von bis zu 10 % bei den Mängeln (Bausubstanz nicht prüfbar).', 'Richtlinie S. 8, S. 20', { bereich: 'maengel' }))
  }

  // Beseitigung
  for (const p of bau.beseitigung) {
    if (p.faktor > 1 && !p.begruendung?.trim()) h.push(warn(`„${p.gegenstand || 'Position'}“: Faktor über 100 % bitte begründen.`, 'Vorlage Beseitigungskosten, Richtlinie S. 19', { bereich: 'beseitigung' }))
    if (p.faktor > BESEITIGUNG_MAX_FAKTOR) h.push(warn(`„${p.gegenstand || 'Position'}“: Ein Zuschlag ist nur bis 300 % vorgesehen (Faktor 4).`, 'Richtlinie S. 19', { bereich: 'beseitigung' }))
  }
  if (bau.beseitigung.length > 11) h.push(warn('Die Vorlage hat 11 Zeilen für Beseitigungskosten Bau; weitere werden nicht exportiert.', 'Vorlage Beseitigungskosten', { bereich: 'beseitigung' }))
  if (bau.beschreibung && !/wasser|wc|toilette|strom|elektr/i.test(bau.beschreibung)) {
    h.push(info('In der Baubeschreibung sind Wasseranschluss, WC/Trockentoilette und Elektrizitätsanschluss zu vermerken.', 'Richtlinie S. 24', { bereich: 'bauteile' }))
  }
  return h
}

export { wertjahrVon }
