// Abgleich-Logik zwischen lokalem Speicher und OneDrive-App-Ordner.
//
// Reine Logik ohne Browser-APIs – dadurch mit gemocktem Graph-Client testbar.
//
// Dateien (im App-Ordner):
//   daten/<Vorgangs-Nr>.json               aktives WEP
//   daten/papierkorb/<Vorgangs-Nr>.json    gelöschtes WEP (mit Löschzeitpunkt, 30 Tage)
//   daten/<Vorgangs-Nr>.konflikt-<Zeit>.json   unterlegene Fassung eines Konflikts
//
// Regeln (ein Nutzer, mehrere Geräte):
// - Nur lokal geändert  → hochladen; nur in OneDrive geändert → herunterladen.
// - Beides geändert (Konflikt) → die neuere Änderung (geaendertAm) gilt, die ältere
//   liegt als Konflikt-Kopie in OneDrive und im Meta des WEP (KonfliktInfo). Das WEP zeigt
//   „auf zwei Geräten geändert“, bis der Nutzer entschieden hat (src/sync/papierkorb.ts).
// - Löschen gilt überall: Die Datei wird per Graph-Move nach daten/papierkorb/ verschoben
//   und dort mit dem Löschzeitpunkt versehen. Andere Geräte legen das WEP beim Abgleich in
//   ihren lokalen Papierkorb. Alles ist idempotent und lässt sich nach einem Abbruch
//   einfach wiederholen.
// - Wurde ein WEP nach dem Löschzeitpunkt noch geändert (auf dem einen oder dem anderen
//   Gerät), wird nicht still gelöscht, sondern ein Konflikt gemeldet; das WEP bleibt bis zur
//   Entscheidung erhalten.
// - Wiederherstellen holt die Datei aus daten/papierkorb/ zurück; nach 30 Tagen (oder
//   „Endgültig löschen“) werden die Dateien samt Konflikt-Kopien entfernt.
// - Die „Offline-Warteschlange“ ergibt sich aus den Metadaten in IndexedDB:
//   Jedes WEP mit lokalGeaendertAm > letzterSyncAm wartet auf den Upload.
import { naechsteVorgangsNr, type Wep } from '@/model'
import { EIGENE_DATEI, PAPIERKORB_ORDNER, PROFIL_DATEI } from './ordner'
import { istAbgelaufen, metaMit } from './papierkorb'
import type {
  GraphClient,
  KonfliktInfo,
  LokalSpeicher,
  PapierkorbEintrag,
  RemoteDatei,
  SyncDatei,
  SyncErgebnis,
  SyncMeta,
} from './types'

export const KONFLIKT_MARKE = '.konflikt-'

export function dateiName(wepId: string): string {
  return `${wepId}.json`
}

/** Liefert die WEP-id zu einem Dateinamen oder null für fremde/Konflikt-/Profil-Dateien. */
export function wepIdAusName(name: string): string | null {
  if (!name.endsWith('.json') || name.includes(KONFLIKT_MARKE) || name === PROFIL_DATEI || name === EIGENE_DATEI) {
    return null
  }
  return name.slice(0, -'.json'.length)
}

/** Liefert die WEP-id zu einer Konflikt-Kopie („<id>.konflikt-<Zeit>.json“), sonst null. */
export function konfliktIdAusName(name: string): string | null {
  const i = name.indexOf(KONFLIKT_MARKE)
  return name.endsWith('.json') && i > 0 ? name.slice(0, i) : null
}

export function konfliktName(wepId: string, zeit: string): string {
  return `${wepId}${KONFLIKT_MARKE}${zeit.replace(/[:.]/g, '-')}.json`
}

export interface Loeschstempel {
  geloeschtAm: string
  geloeschtVon?: string
}

export function verpacke(wep: Wep, geaendertAm: string, geraet: string, stempel?: Loeschstempel): string {
  const datei: SyncDatei = { format: 'wep-sync/1', geaendertAm, geraet, wep, ...stempel }
  return JSON.stringify(datei, null, 2)
}

export function entpacke(inhalt: string): SyncDatei {
  const daten = JSON.parse(inhalt) as Partial<SyncDatei>
  if (daten.format !== 'wep-sync/1' || !daten.wep || !daten.geaendertAm) {
    throw new Error('Unbekanntes Dateiformat')
  }
  return daten as SyncDatei
}

/** Hat das WEP lokale Änderungen, die noch nicht in OneDrive sind? */
export function wartetAufUpload(meta: SyncMeta | undefined): boolean {
  if (!meta) return true
  return !meta.letzterSyncAm || meta.lokalGeaendertAm > meta.letzterSyncAm
}

export interface SyncOptionen {
  /** Ordner daten/ */
  client: GraphClient
  /** Ordner daten/papierkorb/ */
  papierkorb: GraphClient
  lokal: LokalSpeicher
  geraet: string
  /** Für Tests überschreibbar. */
  jetzt?: () => string
  /**
   * Wird vor dem Umnummerieren eines WEP aufgerufen (Fotos unter die neue Nummer kopieren).
   * Muss idempotent sein; ein Fehler bricht das Umnummerieren ab.
   */
  vorUmnummerieren?: (von: string, nach: string) => Promise<void>
}

function neuerKonflikt(alt: KonfliktInfo | undefined, neu: Omit<KonfliktInfo, 'kopien'>, kopie?: string): KonfliktInfo {
  return { ...neu, kopien: [...new Set([...(alt?.kopien ?? []), ...(kopie ? [kopie] : [])])] }
}

export async function synchronisiere(opt: SyncOptionen): Promise<SyncErgebnis> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const ergebnis: SyncErgebnis = {
    hochgeladen: [],
    heruntergeladen: [],
    konflikte: [],
    fehler: [],
    geloescht: [],
    wiederhergestellt: [],
    bereinigt: [],
    umnummeriert: [],
  }
  const { client, papierkorb, lokal: speicher } = opt

  const [remoteListe, korbListe, weps, korb, metas] = await Promise.all([
    client.liste(),
    papierkorb.liste(),
    speicher.alleWeps(),
    speicher.alleImPapierkorb(),
    speicher.alleMeta(),
  ])

  const ra = new Map<string, RemoteDatei>()
  const rp = new Map<string, RemoteDatei>()
  const kopien = new Map<string, string[]>()
  for (const d of remoteListe) {
    const id = wepIdAusName(d.name)
    if (id) ra.set(id, d)
    const kid = konfliktIdAusName(d.name)
    if (kid) kopien.set(kid, [...(kopien.get(kid) ?? []), d.name])
  }
  for (const d of korbListe) {
    const id = wepIdAusName(d.name)
    if (id) rp.set(id, d)
  }
  const lokal = new Map(weps.map((w) => [w.id, w]))
  const papier = new Map(korb.map((e) => [e.id, e]))
  const meta = new Map(metas.map((m) => [m.id, m]))

  // Entschiedene Konflikte: Kopien in OneDrive entfernen
  for (const m of metas) {
    if (!m.aufraeumen?.length) continue
    try {
      for (const name of m.aufraeumen) await client.loesche(name)
      const neu = metaMit(m, m.id, jetzt(), { aufraeumen: undefined })
      await speicher.setzeMeta(neu)
      meta.set(m.id, neu)
    } catch (e) {
      ergebnis.fehler.push({ wepId: m.id, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const ids = new Set([
    ...ra.keys(),
    ...rp.keys(),
    ...lokal.keys(),
    ...papier.keys(),
    ...metas.filter((m) => m.geloescht || m.endgueltig).map((m) => m.id),
  ])

  // --- Bausteine ----------------------------------------------------------

  async function hochladen(wep: Wep, m: SyncMeta | undefined, extra: Partial<SyncMeta> = {}): Promise<void> {
    const geaendertAm = m?.lokalGeaendertAm ?? jetzt()
    const datei = await client.schreibe(dateiName(wep.id), verpacke(wep, geaendertAm, opt.geraet))
    await speicher.setzeMeta(
      metaMit(m, wep.id, geaendertAm, {
        lokalGeaendertAm: geaendertAm,
        letzterSyncAm: jetzt(),
        remoteETag: datei.eTag,
        geloescht: false,
        geloeschtAm: undefined,
        papierkorbETag: undefined,
        wiederhergestellt: undefined,
        ...extra,
      }),
    )
    ergebnis.hochgeladen.push(wep.id)
  }

  /** Übernimmt die Fassung aus OneDrive als aktives WEP (auch aus dem Papierkorb heraus). */
  async function uebernehme(
    id: string,
    datei: SyncDatei,
    r: RemoteDatei,
    m: SyncMeta | undefined,
    extra: Partial<SyncMeta> = {},
    zaehlen = true,
  ): Promise<void> {
    await speicher.schreibe({
      id,
      wep: datei.wep,
      papierkorb: null,
      meta: metaMit(m, id, datei.geaendertAm, {
        lokalGeaendertAm: datei.geaendertAm,
        letzterSyncAm: jetzt(),
        remoteETag: r.eTag,
        geloescht: false,
        geloeschtAm: undefined,
        papierkorbETag: undefined,
        wiederhergestellt: undefined,
        endgueltig: undefined,
        ...extra,
      }),
    })
    if (zaehlen) ergebnis.heruntergeladen.push(id)
  }

  async function herunterladen(id: string, r: RemoteDatei, m: SyncMeta | undefined): Promise<void> {
    await uebernehme(id, entpacke(await client.lade(r.name)), r, m)
  }

  /** Papierkorb-Datei lesen; ohne Stempel (Abbruch beim Löschen) gilt die Änderungszeit der Datei. */
  async function leseKorb(p: RemoteDatei): Promise<{ datei: SyncDatei; geloeschtAm: string }> {
    const datei = entpacke(await papierkorb.lade(p.name))
    return { datei, geloeschtAm: datei.geloeschtAm ?? p.geaendertAm }
  }

  /** Löscht in OneDrive: Graph-Move nach daten/papierkorb/ und Löschzeitpunkt eintragen. */
  async function verschiebeInKorb(t: PapierkorbEintrag, geaendertAm: string): Promise<RemoteDatei> {
    const name = dateiName(t.id)
    const r = await client.verschiebe(name, PAPIERKORB_ORDNER)
    // Es lag schon eine (veraltete) Fassung im Papierkorb: die neue ersetzt sie
    if (r === 'vorhanden') await client.loesche(name)
    return stempele(t, geaendertAm)
  }

  function stempele(t: PapierkorbEintrag, geaendertAm: string): Promise<RemoteDatei> {
    return papierkorb.schreibe(
      dateiName(t.id),
      verpacke(t.wep, geaendertAm, opt.geraet, {
        geloeschtAm: t.geloeschtAm,
        geloeschtVon: t.geloeschtVon ?? opt.geraet,
      }),
    )
  }

  /** Holt die Datei aus dem Papierkorb nach daten/ zurück und lädt die hiesige Fassung hoch. */
  async function stelleRemoteWiederHer(w: Wep, m: SyncMeta | undefined, extra: Partial<SyncMeta> = {}): Promise<void> {
    await papierkorb.verschiebe(dateiName(w.id), 'daten')
    await hochladen(w, m, extra)
  }

  // --- Ein WEP abgleichen -------------------------------------------------

  async function verarbeite(id: string): Promise<void> {
    const r = ra.get(id)
    const p = rp.get(id)
    const w = lokal.get(id)
    let t = papier.get(id)
    let m = meta.get(id)

    // Zwei lokale Fassungen sollte es nie geben: das aktive WEP gewinnt.
    if (w && t) {
      await speicher.schreibe({ id, papierkorb: null })
      t = undefined
    }
    // 30 Tage um: wie „Endgültig löschen“ (Marke, dann Dateien in OneDrive entfernen)
    if (t && istAbgelaufen(t.geloeschtAm, jetzt())) {
      m = metaMit(m, id, jetzt(), { geloescht: true, geloeschtAm: t.geloeschtAm, endgueltig: true })
      await speicher.schreibe({ id, papierkorb: null, meta: m })
      t = undefined
    }

    // Endgültig gelöscht: Dateien in OneDrive entfernen
    if (!w && !t && m?.endgueltig) {
      await entferneEndgueltig(id, m, r, p)
      return
    }

    // Marke aus der Beta („auf diesem Gerät gelöscht“, Inhalt nur noch in OneDrive): in den
    // Papierkorb überführen. Der Inhalt kommt aus OneDrive.
    if (!w && !t && m?.geloescht && !m.endgueltig) {
      if (r) {
        const fremd = entpacke(await client.lade(r.name))
        t = { id, wep: fremd.wep, geloeschtAm: m.geloeschtAm ?? jetzt(), geloeschtVon: opt.geraet }
      } else if (!p) {
        await speicher.schreibe({ id, meta: null }) // nirgends mehr etwas übrig
        return
      }
    }

    if (t) return verarbeiteKorb(id, t, m, r, p)
    if (w) return verarbeiteAktiv(id, w, m, r, p)

    // Nur in OneDrive
    if (r) return herunterladen(id, r, m)
    if (p) return spiegleKorb(id, m, p)
  }

  async function entferneEndgueltig(id: string, m: SyncMeta, r?: RemoteDatei, p?: RemoteDatei): Promise<void> {
    if (r) {
      const fremd = entpacke(await client.lade(r.name))
      // Auf einem anderen Gerät nach dem Löschen noch geändert: nicht stillschweigend löschen
      if (m.remoteETag !== r.eTag && fremd.geaendertAm > (m.geloeschtAm ?? '')) {
        await uebernehme(id, fremd, r, m, {
          konflikt: neuerKonflikt(m.konflikt, {
            art: 'geloescht-geaendert',
            erkanntAm: jetzt(),
            geraet: fremd.geraet,
            geloeschtWo: 'hier',
          }),
        })
        ergebnis.konflikte.push({
          wepId: id,
          text: `WEP ${id} wurde hier endgültig gelöscht, aber auf ${fremd.geraet} danach noch geändert. Es bleibt erhalten – bitte entscheiden.`,
        })
        return
      }
      await client.loesche(r.name)
    }
    if (p) await papierkorb.loesche(p.name)
    for (const name of kopien.get(id) ?? []) await client.loesche(name)
    await speicher.schreibe({ id, meta: null })
    ergebnis.bereinigt.push(id)
  }

  /** Gelöscht auf diesem Gerät (Eintrag im lokalen Papierkorb). */
  async function verarbeiteKorb(
    id: string,
    t: PapierkorbEintrag,
    m: SyncMeta | undefined,
    r?: RemoteDatei,
    p?: RemoteDatei,
  ): Promise<void> {
    const korbMeta = (felder: Partial<SyncMeta>) =>
      metaMit(m, id, t.geloeschtAm, { geloescht: true, geloeschtAm: t.geloeschtAm, letzterSyncAm: jetzt(), ...felder })

    // Datei in daten/ UND im Papierkorb: uneindeutig (Nummer doppelt vergeben?) – nichts anfassen
    if (r && p) return

    if (r) {
      const fremd = entpacke(await client.lade(r.name))
      if (m?.papierkorbETag) {
        // Die Löschung war schon in OneDrive, jetzt liegt die Datei wieder in daten/:
        // auf einem anderen Gerät wiederhergestellt.
        await uebernehme(id, fremd, r, m, {}, false)
        ergebnis.wiederhergestellt.push(id)
        return
      }
      if (m?.remoteETag !== r.eTag && fremd.geaendertAm > t.geloeschtAm) {
        // Nach dem Löschzeitpunkt auf einem anderen Gerät noch geändert → Konflikt, WEP bleibt
        await uebernehme(id, fremd, r, m, {
          konflikt: neuerKonflikt(m?.konflikt, {
            art: 'geloescht-geaendert',
            erkanntAm: jetzt(),
            geraet: fremd.geraet,
            geloeschtWo: 'hier',
          }),
        })
        ergebnis.konflikte.push({
          wepId: id,
          text: `WEP ${id} wurde hier gelöscht, aber auf ${fremd.geraet} danach noch geändert. Es bleibt erhalten – bitte entscheiden.`,
        })
        return
      }
      // Unverändert (oder nur vor dem Löschen geändert): Löschung nach OneDrive übertragen.
      // Im Papierkorb landet die jüngere Fassung (die aus OneDrive kann neuer sein).
      const lokalZeit = m?.lokalGeaendertAm ?? t.geloeschtAm
      const eintrag = fremd.geaendertAm > lokalZeit ? { ...t, wep: fremd.wep } : t
      const datei = await verschiebeInKorb(eintrag, fremd.geaendertAm > lokalZeit ? fremd.geaendertAm : lokalZeit)
      await speicher.schreibe({
        id,
        papierkorb: eintrag,
        meta: korbMeta({ papierkorbETag: datei.eTag, remoteETag: undefined }),
      })
      return
    }

    if (p) {
      if (m?.papierkorbETag === p.eTag) return // schon abgeglichen
      const { datei } = await leseKorb(p)
      let eTag = p.eTag
      if (!datei.geloeschtAm) eTag = (await stempele(t, m?.lokalGeaendertAm ?? t.geloeschtAm)).eTag // Abbruch beim Löschen heilen
      await speicher.setzeMeta(korbMeta({ papierkorbETag: eTag }))
      return
    }

    // Weder in daten/ noch im Papierkorb von OneDrive
    if (m?.papierkorbETag || (m?.remoteETag && m.letzterSyncAm)) {
      // Dort war es schon und ist jetzt weg: auf einem anderen Gerät endgültig gelöscht
      await speicher.schreibe({ id, papierkorb: null, meta: null })
      ergebnis.bereinigt.push(id)
      return
    }
    // Noch nie in OneDrive (z. B. ohne Konto gelöscht): Papierkorb dorthin übertragen
    const datei = await stempele(t, m?.lokalGeaendertAm ?? t.geloeschtAm)
    await speicher.schreibe({ id, papierkorb: t, meta: korbMeta({ papierkorbETag: datei.eTag }) })
  }

  /** Nur in OneDrive-Papierkorb (von einem anderen Gerät gelöscht): lokal spiegeln. */
  async function spiegleKorb(id: string, m: SyncMeta | undefined, p: RemoteDatei): Promise<void> {
    const { datei, geloeschtAm } = await leseKorb(p)
    if (istAbgelaufen(geloeschtAm, jetzt())) {
      // Aufbewahrungsfrist um: endgültig löschen
      await papierkorb.loesche(p.name)
      for (const name of kopien.get(id) ?? []) await client.loesche(name)
      if (m) await speicher.schreibe({ id, meta: null })
      ergebnis.bereinigt.push(id)
      return
    }
    await speicher.schreibe({
      id,
      papierkorb: { id, wep: datei.wep, geloeschtAm, geloeschtVon: datei.geloeschtVon },
      meta: metaMit(m, id, datei.geaendertAm, {
        lokalGeaendertAm: datei.geaendertAm,
        letzterSyncAm: jetzt(),
        geloescht: true,
        geloeschtAm,
        papierkorbETag: p.eTag,
        remoteETag: undefined,
      }),
    })
  }

  /** Aktives WEP auf diesem Gerät. */
  async function verarbeiteAktiv(
    id: string,
    w: Wep,
    m: SyncMeta | undefined,
    r?: RemoteDatei,
    p?: RemoteDatei,
  ): Promise<void> {
    if (r) return gleicheAb(id, w, m, r)

    if (p) {
      // Nur im Papierkorb von OneDrive
      if (!m?.letzterSyncAm) {
        // Neues WEP mit einer Nummer, die dort noch einem gelöschten WEP gehört: das gelöschte
        // bleibt unangetastet, das neue bekommt die nächste freie Nummer.
        await nummerNeuVergeben(id, w)
        return
      }
      if (m.wiederhergestellt) {
        await stelleRemoteWiederHer(w, m) // hier wiederhergestellt: zurückholen
        return
      }
      const { datei, geloeschtAm } = await leseKorb(p)
      const geaendertDanach = wartetAufUpload(m) && m.lokalGeaendertAm > geloeschtAm
      if (geaendertDanach) {
        // Hier nach dem Löschzeitpunkt noch geändert → nicht löschen, Konflikt melden
        const anderes = datei.geloeschtVon ?? datei.geraet
        await stelleRemoteWiederHer(w, m, {
          konflikt: neuerKonflikt(m.konflikt, {
            art: 'geloescht-geaendert',
            erkanntAm: jetzt(),
            geraet: anderes,
            geloeschtWo: 'anderes-geraet',
          }),
        })
        ergebnis.konflikte.push({
          wepId: id,
          text: `WEP ${id} wurde auf ${anderes} gelöscht, aber hier danach noch geändert. Es bleibt erhalten – bitte entscheiden.`,
        })
        return
      }
      // Auf einem anderen Gerät gelöscht, hier unverändert: in den lokalen Papierkorb
      // (mit der jüngeren der beiden Fassungen)
      const neuer = datei.geaendertAm > m.lokalGeaendertAm ? datei.wep : w
      await speicher.schreibe({
        id,
        wep: null,
        ereignis: 'geloescht',
        papierkorb: { id, wep: neuer, geloeschtAm, geloeschtVon: datei.geloeschtVon },
        meta: metaMit(m, id, jetzt(), {
          geloescht: true,
          geloeschtAm,
          papierkorbETag: p.eTag,
          letzterSyncAm: jetzt(),
          wiederhergestellt: undefined,
        }),
      })
      ergebnis.geloescht.push(id)
      return
    }

    // Weder in daten/ noch im Papierkorb von OneDrive
    if (m?.wiederhergestellt) {
      await hochladen(w, m) // Papierkorb-Datei ist inzwischen weg: neu hochladen
      return
    }
    if (m?.remoteETag && m.letzterSyncAm) {
      // Es war in OneDrive und ist jetzt überall weg: anderswo endgültig gelöscht
      if (!wartetAufUpload(m)) {
        const am = jetzt()
        await speicher.schreibe({
          id,
          wep: null,
          ereignis: 'geloescht',
          papierkorb: { id, wep: w, geloeschtAm: am },
          meta: metaMit(m, id, am, {
            geloescht: true,
            geloeschtAm: am,
            remoteETag: undefined,
            papierkorbETag: undefined,
          }),
        })
        ergebnis.geloescht.push(id)
        return
      }
      await hochladen(w, m, {
        konflikt: neuerKonflikt(m.konflikt, {
          art: 'geloescht-geaendert',
          erkanntAm: jetzt(),
          geraet: 'einem anderen Gerät',
          geloeschtWo: 'anderes-geraet',
        }),
      })
      ergebnis.konflikte.push({
        wepId: id,
        text: `WEP ${id} wurde auf einem anderen Gerät endgültig gelöscht, aber hier danach noch geändert. Es bleibt erhalten – bitte entscheiden.`,
      })
      return
    }
    await hochladen(w, m) // neu
  }

  async function nummerNeuVergeben(id: string, w: Wep): Promise<void> {
    const bekannt = [...lokal.keys(), ...papier.keys(), ...ra.keys(), ...rp.keys()].map((i) => ({ id: i }))
    const jahr = Number.parseInt(id.slice(0, 4), 10)
    const nr = naechsteVorgangsNr(bekannt, Number.isFinite(jahr) ? jahr : undefined)
    const neu: Wep = { ...w, id: nr, formalien: { ...w.formalien, vorgangsNr: nr } }
    const zeit = jetzt()
    await opt.vorUmnummerieren?.(id, nr)
    await speicher.schreibe({ id, wep: null, meta: null })
    await speicher.schreibe({ id: nr, wep: neu, meta: metaMit(undefined, nr, zeit) })
    lokal.set(nr, neu)
    await hochladen(neu, metaMit(undefined, nr, zeit))
    ergebnis.umnummeriert.push({ von: id, nach: nr })
    ergebnis.konflikte.push({
      wepId: id,
      text: `Die Nummer ${id} gehört in OneDrive noch einem gelöschten WEP. Das neue WEP heißt jetzt ${nr}.`,
    })
  }

  /** Aktives WEP, Datei in daten/ vorhanden: hochladen, herunterladen oder Konflikt. */
  async function gleicheAb(id: string, w: Wep, m: SyncMeta | undefined, r: RemoteDatei): Promise<void> {
    const lokalGeaendert = wartetAufUpload(m)
    const remoteGeaendert = !m?.remoteETag || m.remoteETag !== r.eTag

    if (!lokalGeaendert && !remoteGeaendert) return
    if (lokalGeaendert && !remoteGeaendert) return hochladen(w, m)
    if (!lokalGeaendert && remoteGeaendert) return herunterladen(id, r, m)

    // Beide Seiten geändert → Konflikt
    const fremd = entpacke(await client.lade(r.name))
    const lokalZeit = m?.lokalGeaendertAm ?? jetzt()
    if (JSON.stringify(fremd.wep) === JSON.stringify(w)) {
      // Inhaltlich gleich (z. B. erster Abgleich eines schon vorhandenen WEP)
      await speicher.setzeMeta(
        metaMit(m, id, lokalZeit, {
          lokalGeaendertAm: lokalZeit,
          letzterSyncAm: jetzt(),
          remoteETag: r.eTag,
          geloescht: false,
          wiederhergestellt: undefined,
        }),
      )
      return
    }
    if (lokalZeit >= fremd.geaendertAm) {
      // Lokal ist neuer: OneDrive-Fassung sichern, dann lokale hochladen
      const kopie = konfliktName(id, fremd.geaendertAm)
      await client.schreibe(kopie, verpacke(fremd.wep, fremd.geaendertAm, fremd.geraet))
      await hochladen(w, m, {
        konflikt: neuerKonflikt(
          m?.konflikt,
          {
            art: 'zwei-geraete',
            erkanntAm: jetzt(),
            geraet: fremd.geraet,
            fassung: fremd.wep,
            fassungGeaendertAm: fremd.geaendertAm,
          },
          kopie,
        ),
      })
      ergebnis.konflikte.push({
        wepId: id,
        text: `WEP ${id} wurde auf zwei Geräten geändert. Die Fassung von diesem Gerät ist neuer und gilt vorerst; die ältere liegt als Konflikt-Kopie in OneDrive.`,
      })
    } else {
      // OneDrive ist neuer: lokale Fassung als Kopie sichern, dann übernehmen
      const kopie = konfliktName(id, lokalZeit)
      await client.schreibe(kopie, verpacke(w, lokalZeit, opt.geraet))
      await uebernehme(id, fremd, r, m, {
        konflikt: neuerKonflikt(
          m?.konflikt,
          {
            art: 'zwei-geraete',
            erkanntAm: jetzt(),
            geraet: opt.geraet,
            fassung: w,
            fassungGeaendertAm: lokalZeit,
          },
          kopie,
        ),
      })
      ergebnis.konflikte.push({
        wepId: id,
        text: `WEP ${id} wurde auf zwei Geräten geändert. Die Fassung aus OneDrive (${fremd.geraet}) ist neuer und gilt vorerst; die Fassung von diesem Gerät liegt als Konflikt-Kopie in OneDrive.`,
      })
    }
  }

  for (const id of [...ids].sort()) {
    try {
      await verarbeite(id)
    } catch (e) {
      ergebnis.fehler.push({
        wepId: id,
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return ergebnis
}
