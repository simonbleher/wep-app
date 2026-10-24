// Bau-Teil aus der Bau-Excel in das WEP übernehmen: Der Bau-Wertermittler füllt Baulichkeiten, Mängel und Beseitigung
// (Abschnitt 1) aus; der Grün-Wertermittler soll sie nicht noch einmal eintippen.
//
// Regeln: nichts wird überschrieben und nichts doppelt angelegt. Was im WEP schon steht (Bauteil mit gleichem Kürzel,
// Beschreibung, Beseitigungszeile mit gleichem Gegenstand/Menge/Einheit), bleibt; der Nutzer wählt, welche Gruppen dazukommen.
import { MANGEL_EIGEN, kuerzelFuer, wertjahrVon } from '@/bau'
import type { BauTeil, BauTeilBauteil } from '@/export/bauTeilLesen'
import { normalisiere } from '@/katalog/util'
import { neueBauDaten, type BauDaten, type Bauteil, type BeseitigungsPosition, type Wep } from '@/model'

export type BauListe = 'bauteile' | 'beschreibung' | 'beseitigung' | 'nichtBeraeumt' | 'abwasser' | 'index'
export const BAU_LISTEN: readonly BauListe[] = ['bauteile', 'beschreibung', 'beseitigung', 'nichtBeraeumt', 'abwasser', 'index']

export interface BauListenAbgleich {
  liste: BauListe
  name: string
  /** Neue Einträge zur Anzeige. */
  neu: { text: string; detail: string }[]
  /** Schon im WEP vorhanden. */
  gleich: number
}

const zahlText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
const euro = (n: number) => (n > 0 ? `${zahlText(n)} €` : 'ohne Preis')
const ART_NAME: Record<Bauteil['art'], string> = { laube: 'Laube', anbau: 'Anbau', schuppen: 'Schuppen', gewaechshaus: 'Gewächshaus', vorplatz: 'Vorplatz', keller: 'Keller' }

const kuerzelVon = (b: BauTeilBauteil, andere: readonly { art: Bauteil['art']; kuerzel: string }[]) => b.kuerzel || kuerzelFuer(b.art, andere as Bauteil[])
const beSchluessel = (g: string, m: number, e: string) => `${normalisiere(g)}|${m}|${normalisiere(e)}`

function fehlendeBauteile(wep: Wep, teil: BauTeil): BauTeilBauteil[] {
  const vorhanden = wep.bau?.bauteile ?? []
  return teil.bauteile.filter((b) => !vorhanden.some((v) => v.art === b.art && normalisiere(v.kuerzel) === normalisiere(kuerzelVon(b, vorhanden))))
}

function fehlendeBeseitigung(wep: Wep, teil: BauTeil) {
  const rest = new Map<string, number>()
  for (const p of wep.bau?.beseitigung ?? []) {
    const k = beSchluessel(p.gegenstand, p.menge, p.einheit)
    rest.set(k, (rest.get(k) ?? 0) + 1)
  }
  return teil.beseitigung.filter((b) => {
    const k = beSchluessel(b.gegenstand, b.menge, b.einheit)
    const n = rest.get(k) ?? 0
    if (n > 0) {
      rest.set(k, n - 1)
      return false
    }
    return true
  })
}

export function pruefeBau(wep: Wep, teil: BauTeil): BauListenAbgleich[] {
  const bt = fehlendeBauteile(wep, teil)
  const be = fehlendeBeseitigung(wep, teil)
  const liste: BauListenAbgleich[] = [
    {
      liste: 'bauteile',
      name: 'Baulichkeiten',
      neu: bt.map((b) => ({
        text: `${ART_NAME[b.art]} ${b.kuerzel}`.trim(),
        detail: [b.typ, b.baujahr ? `Baujahr ${b.baujahr}` : '', b.flaeche > 0 ? `${zahlText(b.flaeche)} m²` : '', b.maengel.length ? `Mängel ${zahlText(b.maengel.reduce((s, m) => s + m.abzug, 0))} %` : ''].filter(Boolean).join(' · '),
      })),
      gleich: teil.bauteile.length - bt.length,
    },
    {
      liste: 'beschreibung',
      name: 'Baubeschreibung',
      neu: teil.beschreibung && !wep.bau?.beschreibung.trim() ? [{ text: teil.beschreibung.split('\n')[0], detail: `${teil.beschreibung.split('\n').length} Zeilen` }] : [],
      gleich: teil.beschreibung && wep.bau?.beschreibung.trim() ? 1 : 0,
    },
    {
      liste: 'beseitigung',
      name: 'Beseitigungskosten (Bau)',
      neu: be.map((b) => ({ text: b.gegenstand, detail: `${zahlText(b.menge)} ${b.einheit} · ${euro(b.einzelpreis)}${b.faktor !== 1 ? ` · Faktor ${zahlText(b.faktor)}` : ''}` })),
      gleich: teil.beseitigung.length - be.length,
    },
    {
      liste: 'nichtBeraeumt',
      name: 'Laube nicht beräumt',
      neu: teil.nichtBeraeumt && !wep.bau?.nichtBeraeumt.aktiv ? [{ text: 'Entsorgung des Inventars', detail: `${zahlText(teil.nichtBeraeumt.m3)} m³ · ${zahlText(teil.nichtBeraeumt.preis)} €/m³` }] : [],
      gleich: teil.nichtBeraeumt && wep.bau?.nichtBeraeumt.aktiv ? 1 : 0,
    },
    {
      liste: 'abwasser',
      name: 'Abwasser',
      neu: teil.abwasser && (wep.bau?.abwasser.art ?? 'keine') === 'keine' ? [abwasserZeile(teil.abwasser)] : [],
      gleich: teil.abwasser && (wep.bau?.abwasser.art ?? 'keine') !== 'keine' ? 1 : 0,
    },
    {
      liste: 'index',
      name: 'Baupreisindex',
      neu: teil.index && !wep.bau?.index ? [{ text: `${zahlText(teil.index.wert)} für ${teil.index.jahr}`, detail: 'laut Bau-Excel' }] : [],
      gleich: teil.index && wep.bau?.index ? 1 : 0,
    },
  ]
  return liste
}

function abwasserZeile(a: NonNullable<BauTeil['abwasser']>): { text: string; detail: string } {
  if (a.art === 'kanal') return { text: 'Kanalisationsanschluss', detail: [a.kanal.baujahr ? `Baujahr ${a.kanal.baujahr}` : '', a.kanal.kosten ? `${zahlText(a.kanal.kosten)} €` : ''].filter(Boolean).join(' · ') }
  const g = a.grube
  return { text: 'Abwassersammelgrube', detail: [g.inhaltM3 ? `${zahlText(g.inhaltM3)} m³` : '', g.baujahr ? `Baujahr ${g.baujahr}` : '', g.genehmigungNr ?? ''].filter(Boolean).join(' · ') }
}

export const offeneBauZeilen = (ab: readonly BauListenAbgleich[]): number => ab.reduce((s, l) => s + l.neu.length, 0)

let zaehler = 0
const neueId = (vorsatz: string) => `${vorsatz}-${Date.now()}-${(zaehler++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Baujahr aus dem Alter laut Bau-Excel – wie die App das Alter rechnet (Wertjahr − Baujahr + 1). */
const baujahrAusAlter = (alter: number | undefined, wertjahr: number): number | undefined => (alter && alter > 0 ? wertjahr - alter + 1 : undefined)

function neuesBauteil(b: BauTeilBauteil, bisher: readonly Bauteil[], wertjahr: number): Bauteil {
  return {
    id: neueId('bt'),
    art: b.art,
    kuerzel: kuerzelVon(b, bisher),
    flaeche: b.flaeche,
    ...(b.flaeche > 0 ? { flaecheManuell: true } : {}),
    ...(b.typ ? { typ: b.typ, typManuell: true } : {}), // der Typ stammt aus der Bau-Excel, nicht aus dem Assistenten
    ...(b.minderungProJahr ? { minderungProJahr: b.minderungProJahr } : {}),
    ...(b.nhk ? { nhk: b.nhk } : {}),
    ...(b.vorplatzLage ? { vorplatzLage: b.vorplatzLage } : {}),
    ...(b.vorplatzGuete ? { vorplatzGuete: b.vorplatzGuete } : {}),
    ...(b.baujahr || baujahrAusAlter(b.alter, wertjahr) ? { baujahr: b.baujahr ?? baujahrAusAlter(b.alter, wertjahr) } : {}),
    ...(b.baujahrQuelle ? { baujahrQuelle: b.baujahrQuelle } : {}),
    ...(b.restnutzungsjahre !== undefined ? { restnutzungsjahre: b.restnutzungsjahre, rnManuell: true } : {}),
    maengel: b.maengel.map((m) => ({
      gruppe: m.gruppe,
      maengel: m.gruppe === MANGEL_EIGEN ? ['laut Bau-Excel'] : [],
      abzug: m.abzug,
      begruendung: '',
    })),
  }
}

/** Hängt die gewählten Gruppen an; vorhandene Einträge bleiben unverändert. */
export function uebernimmBau(wep: Wep, teil: BauTeil, listen: ReadonlySet<BauListe>): Wep {
  const ab = new Map(pruefeBau(wep, teil).map((l) => [l.liste, l]))
  const neu = (l: BauListe) => listen.has(l) && (ab.get(l)?.neu.length ?? 0) > 0
  if (!BAU_LISTEN.some(neu)) return wep
  const bau: BauDaten = wep.bau ?? neueBauDaten()
  const wertjahr = wertjahrVon(wep)
  let bauteile = bau.bauteile
  if (neu('bauteile')) for (const b of fehlendeBauteile(wep, teil)) bauteile = [...bauteile, neuesBauteil(b, bauteile, wertjahr)]
  const beseitigung: BeseitigungsPosition[] = neu('beseitigung')
    ? [...bau.beseitigung, ...fehlendeBeseitigung(wep, teil).map((b): BeseitigungsPosition => ({ id: neueId('bes'), ...b }))]
    : bau.beseitigung
  return {
    ...wep,
    bau: {
      ...bau,
      bauteile,
      beseitigung,
      ...(neu('beschreibung') ? { beschreibung: teil.beschreibung, beschreibungManuell: true } : {}),
      ...(neu('abwasser') && teil.abwasser ? { abwasser: abwasserMitBaujahr(teil.abwasser, teil.grubeAlter, wertjahr) } : {}),
      ...(neu('index') && teil.index ? { index: { jahr: teil.index.jahr, wert: teil.index.wert, quelle: 'Bau-Excel', manuell: true } } : {}),
      ...(neu('nichtBeraeumt') && teil.nichtBeraeumt ? { nichtBeraeumt: { aktiv: true, m3: teil.nichtBeraeumt.m3, preis: teil.nichtBeraeumt.preis } } : {}),
    },
  }
}

function abwasserMitBaujahr(a: NonNullable<BauTeil['abwasser']>, alter: number | undefined, wertjahr: number): NonNullable<BauTeil['abwasser']> {
  const baujahr = a.art === 'grube' ? baujahrAusAlter(alter, wertjahr) : undefined
  return baujahr ? { ...a, grube: { ...a.grube, baujahr } } : a
}
