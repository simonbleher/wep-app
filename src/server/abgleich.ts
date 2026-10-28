// Server-Modus (v2): Abgleich der WEPs zwischen IndexedDB und Server. Reine Logik (Server-Zugriff und lokaler Speicher
// werden übergeben) – dadurch gegen die echte Server-Logik testbar (src/server/abgleich.test.ts).
//
// Regeln:
// - Gearbeitet wird immer lokal. Was lokal geändert ist (lokalGeaendertAm > letzterSyncAm), wartet auf den Upload.
// - Gespeichert wird mit der Revision des letzten Abgleichs (`serverRev`). Hat sich das WEP auf dem Server inzwischen
//   geändert, gibt es einen Konflikt wie in v1: Die neuere Änderung gilt, die andere Fassung bleibt sichtbar
//   („auf zwei Geräten geändert“, KonfliktInfo), bis entschieden ist. Nichts geht still verloren.
// - Nur auf dem Server geändert → herunterladen. Neu auf dem Server (z. B. abgegeben an mich) → herunterladen.
// - Löschen = Papierkorb, auf dem Server wie lokal. Wurde ein WEP nach dem Löschen anderswo noch geändert, gibt es den
//   Konflikt „gelöscht/geändert“; das WEP bleibt bis zur Entscheidung erhalten.
// - Darf ich ein WEP nicht (mehr) bearbeiten (gesperrt), bleibt der Stand des Servers; eine lokale Änderung bleibt als
//   „andere Fassung“ sichtbar.
// - „Endgültig löschen“ entfernt das WEP nur auf diesem Gerät; auf dem Server bleibt es im Papierkorb
//   (Aufbewahrungsregeln des BV, docs/PLAN-V2.md).
import type { Wep } from '@/model'
import { metaMit, papierkorbMeta } from '@/sync/papierkorb'
import type { KonfliktInfo, LokalSpeicher, SyncErgebnis, SyncMeta } from '@/sync/types'
import { wartetAufUpload } from '@/sync/engine'
import type { Zustand } from './rechte'

export interface ServerKopf {
  id: string
  rev: number
  zustand: Zustand
  geaendertAm: string
  geaendertVon: string
  geloeschtAm?: string
}

export interface ServerStand {
  kopf: ServerKopf
  wep: Wep
}

/** Antwort des Servers mit Fehlerstatus; bei 409/403 mit dem Stand des Servers. */
export class AbgleichFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly stand?: ServerStand,
  ) {
    super(message)
  }
}

export interface ServerZugriff {
  liste(): Promise<ServerKopf[]>
  lade(id: string): Promise<ServerStand>
  /** Speichert; wirft AbgleichFehler (409 mit Stand, wenn sich die Revision geändert hat). */
  speichere(wep: Wep, basisRev: number): Promise<ServerKopf>
  loesche(id: string, basisRev: number): Promise<ServerKopf>
  stelleWiederHer(id: string): Promise<ServerKopf>
}

export interface ServerAbgleichOptionen {
  server: ServerZugriff
  lokal: LokalSpeicher
  /** Name/Kennung für Konfliktmeldungen (wer hat die andere Fassung geschrieben). */
  jetzt?: () => string
}

const leeresErgebnis = (): SyncErgebnis => ({
  hochgeladen: [],
  heruntergeladen: [],
  konflikte: [],
  fehler: [],
  geloescht: [],
  wiederhergestellt: [],
  bereinigt: [],
  umnummeriert: [],
})

const text = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function serverAbgleich(opt: ServerAbgleichOptionen): Promise<SyncErgebnis> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const { server, lokal } = opt
  const erg = leeresErgebnis()
  const [koepfe, weps, korb, metas] = await Promise.all([server.liste(), lokal.alleWeps(), lokal.alleImPapierkorb(), lokal.alleMeta()])
  const kopfVon = new Map(koepfe.map((k) => [k.id, k]))
  const metaVon = new Map(metas.map((m) => [m.id, m]))
  const lokaleIds = new Set([...weps.map((w) => w.id), ...korb.map((e) => e.id)])

  /** Lokaler Stand = Server-Stand (nichts wartet). */
  const abgeglichen = (m: SyncMeta | undefined, id: string, rev: number, felder: Partial<SyncMeta> = {}): SyncMeta => {
    const zeit = jetzt()
    return metaMit(m, id, zeit, { lokalGeaendertAm: zeit, letzterSyncAm: zeit, serverRev: rev, ...felder })
  }

  /** Die Fassung des Servers übernehmen; die lokale bleibt als andere Fassung sichtbar (Konflikt). */
  async function serverGewinnt(m: SyncMeta | undefined, lokalWep: Wep, stand: ServerStand, grund: 'konflikt' | 'gesperrt') {
    const konflikt: KonfliktInfo = {
      art: 'zwei-geraete',
      erkanntAm: jetzt(),
      geraet: stand.kopf.geaendertVon,
      fassung: lokalWep,
      fassungGeaendertAm: m?.lokalGeaendertAm ?? jetzt(),
      kopien: [],
    }
    await lokal.schreibe({ id: lokalWep.id, wep: stand.wep, meta: abgeglichen(m, lokalWep.id, stand.kopf.rev, { konflikt }) })
    erg.konflikte.push({
      wepId: lokalWep.id,
      text:
        grund === 'gesperrt'
          ? 'Das WEP ist für dich gesperrt; deine Änderung ist nicht übernommen und bleibt als andere Fassung sichtbar.'
          : 'Auf dem Server inzwischen geändert; die neuere Fassung gilt, die andere bleibt sichtbar.',
    })
  }

  /** Lokale Änderung hochladen; bei einem Konflikt entscheidet die neuere Änderung. */
  async function hochladen(w: Wep, m: SyncMeta | undefined, basisRev: number) {
    try {
      const kopf = await server.speichere(w, basisRev)
      // Während des Uploads lokal weiter geändert? Dann wartet die neuere Änderung weiter.
      const aktuell = (await lokal.alleMeta()).find((x) => x.id === w.id)
      const nochGleich = !aktuell || aktuell.lokalGeaendertAm === m?.lokalGeaendertAm
      await lokal.setzeMeta(
        metaMit(aktuell ?? m, w.id, jetzt(), {
          serverRev: kopf.rev,
          letzterSyncAm: nochGleich ? (aktuell?.lokalGeaendertAm ?? jetzt()) : m?.lokalGeaendertAm,
          serverGeloescht: undefined,
        }),
      )
      erg.hochgeladen.push(w.id)
    } catch (e) {
      if (!(e instanceof AbgleichFehler) || !e.stand) throw e
      const stand = e.stand
      if (e.status === 403) return serverGewinnt(m, w, stand, 'gesperrt')
      if (stand.kopf.geloeschtAm) return loeschKonflikt(w, m, stand, 'anderes-geraet')
      const lokalNeuer = (m?.lokalGeaendertAm ?? '') > stand.kopf.geaendertAm
      if (!lokalNeuer) return serverGewinnt(m, w, stand, 'konflikt')
      // Lokal ist neuer: über den Stand des Servers speichern, dessen Fassung bleibt sichtbar
      const kopf = await server.speichere(w, stand.kopf.rev)
      const konflikt: KonfliktInfo = {
        art: 'zwei-geraete',
        erkanntAm: jetzt(),
        geraet: stand.kopf.geaendertVon,
        fassung: stand.wep,
        fassungGeaendertAm: stand.kopf.geaendertAm,
        kopien: [],
      }
      await lokal.setzeMeta(metaMit(m, w.id, jetzt(), { serverRev: kopf.rev, letzterSyncAm: m?.lokalGeaendertAm, konflikt }))
      erg.hochgeladen.push(w.id)
      erg.konflikte.push({ wepId: w.id, text: 'Auch auf dem Server geändert; deine neuere Fassung gilt, die andere bleibt sichtbar.' })
    }
  }

  /** Auf dem Server gelöscht, hier noch geändert (oder umgekehrt): nicht still löschen, sondern fragen. */
  async function loeschKonflikt(w: Wep, m: SyncMeta | undefined, stand: ServerStand | undefined, wo: 'hier' | 'anderes-geraet') {
    if (m?.konflikt?.art === 'geloescht-geaendert') return
    const konflikt: KonfliktInfo = { art: 'geloescht-geaendert', erkanntAm: jetzt(), geraet: stand?.kopf.geaendertVon ?? '', geloeschtWo: wo, kopien: [] }
    await lokal.schreibe({ id: w.id, wep: w, papierkorb: null, meta: metaMit(m, w.id, jetzt(), { konflikt, geloescht: false, geloeschtAm: undefined, serverRev: stand?.kopf.rev ?? m?.serverRev }) })
    erg.konflikte.push({ wepId: w.id, text: wo === 'hier' ? 'Hier gelöscht, auf dem Server aber noch geändert.' : 'Auf dem Server gelöscht, hier aber noch geändert.' })
  }

  // 1. Aktive WEPs dieses Geräts
  for (const w of weps) {
    const m = metaVon.get(w.id)
    const s = kopfVon.get(w.id)
    try {
      if (!s) {
        if (m?.serverRev === undefined) await hochladen(w, m, 0)
        else if (!wartetAufUpload(m)) {
          // Auf dem Server nicht mehr sichtbar (kein Zugriff mehr): hier entfernen
          await lokal.schreibe({ id: w.id, wep: null, meta: null })
          erg.bereinigt.push(w.id)
        } else erg.fehler.push({ wepId: w.id, text: 'Das WEP ist auf dem Server nicht mehr für dich sichtbar; deine Änderung bleibt nur auf diesem Gerät.' })
        continue
      }
      if (s.geloeschtAm) {
        if (m?.wiederhergestellt && m.serverRev !== undefined) {
          const kopf = await server.stelleWiederHer(w.id)
          await lokal.setzeMeta(metaMit(m, w.id, jetzt(), { wiederhergestellt: undefined, serverRev: kopf.rev, serverGeloescht: undefined }))
          erg.wiederhergestellt.push(w.id)
          await hochladen(w, { ...m, serverRev: kopf.rev }, kopf.rev)
        } else if (m?.serverRev === s.rev && !m.konflikt && m.serverRev !== undefined) {
          // Lösch-Konflikt ist entschieden: „behalten“ → auf dem Server zurückholen und hochladen
          const kopf = await server.stelleWiederHer(w.id)
          erg.wiederhergestellt.push(w.id)
          await hochladen(w, { ...m, serverRev: kopf.rev }, kopf.rev)
        } else if (!wartetAufUpload(m)) {
          await lokal.schreibe({
            id: w.id,
            wep: null,
            papierkorb: { id: w.id, wep: w, geloeschtAm: s.geloeschtAm, geloeschtVon: s.geaendertVon },
            meta: { ...papierkorbMeta(m, w.id, s.geloeschtAm), serverRev: s.rev, serverGeloescht: true },
            ereignis: 'geloescht',
          })
          erg.geloescht.push(w.id)
        } else await loeschKonflikt(w, m, { kopf: s, wep: w }, 'anderes-geraet')
        continue
      }
      if (m?.serverRev === s.rev) {
        if (wartetAufUpload(m)) await hochladen(w, m, s.rev)
        continue
      }
      // Auf dem Server geändert
      if (m && m.serverRev !== undefined && !wartetAufUpload(m)) {
        const stand = await server.lade(w.id)
        await lokal.schreibe({ id: w.id, wep: stand.wep, meta: abgeglichen(m, w.id, stand.kopf.rev) })
        erg.heruntergeladen.push(w.id)
      } else await hochladen(w, m, m?.serverRev ?? 0)
    } catch (e) {
      erg.fehler.push({ wepId: w.id, text: text(e) })
    }
  }

  // 2. Papierkorb dieses Geräts
  for (const e of korb) {
    const m = metaVon.get(e.id)
    const s = kopfVon.get(e.id)
    try {
      if (!s || m?.serverRev === undefined) continue // nie auf dem Server gewesen
      if (s.geloeschtAm) {
        if (!m.serverGeloescht) await lokal.setzeMeta(metaMit(m, e.id, jetzt(), { serverGeloescht: true, serverRev: s.rev }))
        continue
      }
      if (s.rev === m.serverRev) {
        const kopf = await server.loesche(e.id, s.rev)
        await lokal.setzeMeta(metaMit(m, e.id, jetzt(), { serverGeloescht: true, serverRev: kopf.rev }))
      } else {
        // Nach dem Löschen hier wurde es auf dem Server noch geändert: zurückholen und fragen
        const stand = await server.lade(e.id)
        await loeschKonflikt(stand.wep, { ...m, lokalGeaendertAm: m.lokalGeaendertAm }, stand, 'hier')
      }
    } catch (err) {
      if (err instanceof AbgleichFehler && err.status === 403) {
        erg.fehler.push({ wepId: e.id, text: 'Löschen ist auf dem Server nicht erlaubt (nicht dein WEP oder schon abgegeben).' })
      } else erg.fehler.push({ wepId: e.id, text: text(err) })
    }
  }

  // 3. Endgültig gelöscht: hier vergessen; der Server behält es im Papierkorb (vorher dorthin legen, falls noch nicht)
  for (const m of metas) {
    if (!m.endgueltig || lokaleIds.has(m.id)) continue
    const s = kopfVon.get(m.id)
    try {
      if (s && !s.geloeschtAm && s.rev === m.serverRev) await server.loesche(m.id, s.rev)
      await lokal.schreibe({ id: m.id, meta: null })
      erg.bereinigt.push(m.id)
    } catch (e) {
      erg.fehler.push({ wepId: m.id, text: text(e) })
    }
  }

  // 4. Neu auf dem Server (angelegt auf einem anderen Gerät oder an mich abgegeben)
  for (const s of koepfe) {
    if (lokaleIds.has(s.id) || s.geloeschtAm || metaVon.get(s.id)?.endgueltig) continue
    try {
      const stand = await server.lade(s.id)
      await lokal.schreibe({ id: s.id, wep: stand.wep, meta: abgeglichen(undefined, s.id, stand.kopf.rev), ereignis: 'geaendert' })
      erg.heruntergeladen.push(s.id)
    } catch (e) {
      erg.fehler.push({ wepId: s.id, text: text(e) })
    }
  }
  return erg
}

/** Änderungen, die noch auf den Server warten (WEPs und Löschungen). */
export function wartendeServerAenderungen(weps: Wep[], korbIds: string[], metas: SyncMeta[]): number {
  const metaVon = new Map(metas.map((m) => [m.id, m]))
  return (
    weps.filter((w) => wartetAufUpload(metaVon.get(w.id))).length +
    korbIds.filter((id) => {
      const m = metaVon.get(id)
      return m?.serverRev !== undefined && !m.serverGeloescht
    }).length
  )
}
