// Hilfen für die Sync-Tests: ein Speicher im Arbeitsspeicher (wie IndexedDB, aber ohne Browser),
// eine steuerbare Uhr und ein „Gerät“, das gegen ein gemeinsames FakeDrive abgleicht.
import { neuerWep, type Foto, type Wep } from '@/model'
import type { FotoAblage } from '@/fotos/ablage'
import { loescheFoto } from '@/fotos'
import { fotoKey, type FotoRecord } from '@/fotos/types'
import { synchronisiere } from './engine'
import { FakeDrive } from './fakeDrive'
import { merkeEndgueltigGeloeschte, synchronisiereFotos, type AufraeumListe, type FotoSyncErgebnis } from './fotos'
import * as regeln from './papierkorb'
import { metaMit, papierkorbMeta } from './papierkorb'
import type { LokaleAenderung, LokalSpeicher, PapierkorbEintrag, SyncErgebnis, SyncMeta } from './types'

/** Steuerbare Uhr (ISO-Zeiten). */
export class Uhr {
  private ms = Date.UTC(2026, 9, 20, 8, 0, 0)
  jetzt = (): string => new Date(this.ms).toISOString()
  /** Springt vor und liefert die neue Zeit. */
  vor(minuten: number): string {
    this.ms += minuten * 60_000
    return this.jetzt()
  }
  tage(n: number): string {
    return this.vor(n * 24 * 60)
  }
}

export class FakeLokal implements LokalSpeicher {
  weps = new Map<string, Wep>()
  meta = new Map<string, SyncMeta>()
  korb = new Map<string, PapierkorbEintrag>()
  /** Ereignisse für die Android-Warteschlange (Reihenfolge wie aufgetreten). */
  ereignisse: string[] = []

  async alleWeps() {
    return [...this.weps.values()]
  }
  async alleMeta() {
    return [...this.meta.values()]
  }
  async alleImPapierkorb() {
    return [...this.korb.values()]
  }
  async setzeMeta(meta: SyncMeta) {
    this.meta.set(meta.id, meta)
  }
  async schreibe(a: LokaleAenderung) {
    if (a.wep === null) this.weps.delete(a.id)
    else if (a.wep) this.weps.set(a.id, structuredClone(a.wep))
    if (a.papierkorb === null) this.korb.delete(a.id)
    else if (a.papierkorb) this.korb.set(a.id, structuredClone(a.papierkorb))
    if (a.meta === null) this.meta.delete(a.id)
    else if (a.meta) this.meta.set(a.id, structuredClone(a.meta))
    if (a.ereignis) this.ereignisse.push(`${a.ereignis} ${a.id}`)
  }
  async legeInPapierkorb(id: string, geloeschtAm: string, geloeschtVon: string) {
    const wep = this.weps.get(id)
    if (!wep) return undefined
    const eintrag: PapierkorbEintrag = { id, wep, geloeschtAm, geloeschtVon }
    this.korb.set(id, eintrag)
    this.weps.delete(id)
    this.meta.set(id, papierkorbMeta(this.meta.get(id), id, geloeschtAm))
    this.ereignisse.push(`geloescht ${id}`)
    return eintrag
  }
  async speichereWep(wep: Wep, jetzt: string) {
    if (this.korb.has(wep.id)) return false
    this.weps.set(wep.id, structuredClone(wep))
    this.meta.set(
      wep.id,
      metaMit(this.meta.get(wep.id), wep.id, jetzt, {
        lokalGeaendertAm: jetzt,
        geloescht: false,
        geloeschtAm: undefined,
        endgueltig: undefined,
      }),
    )
    this.ereignisse.push(`gespeichert ${wep.id}`)
    return true
  }
}

/** Foto-Ablage im Arbeitsspeicher (wie die IndexedDB-Stores „fotos“ und „fotoDaten“). */
export class FakeFotos implements FotoAblage {
  records = new Map<string, FotoRecord>()
  dateien = new Map<string, Blob>()
  /** Aufrufe zum Prüfen, was die Android-Warteschlange mitbekommen hätte. */
  ereignisse: string[] = []

  async alleRecords() {
    return [...this.records.values()]
  }
  async recordsVon(wepId: string) {
    return [...this.records.values()].filter((r) => r.wepId === wepId)
  }
  async ladeDatei(wepId: string, fotoId: string) {
    return this.dateien.get(fotoKey(wepId, fotoId))
  }
  async setzeRecord(r: FotoRecord) {
    this.records.set(r.key, r)
  }
  async speichere(r: FotoRecord, blob?: Blob) {
    this.records.set(r.key, r)
    if (blob) this.dateien.set(r.key, blob)
  }
  async entferne(wepId: string, fotoId: string) {
    this.records.delete(fotoKey(wepId, fotoId))
    this.dateien.delete(fotoKey(wepId, fotoId))
    this.ereignisse.push(`entfernt ${wepId}/${fotoId}`)
  }
  async markiereGeloescht(wepId: string, fotoId: string, zeit: string) {
    const r = this.records.get(fotoKey(wepId, fotoId))
    if (!r) return
    this.records.set(r.key, { ...r, geloescht: zeit, hatDatei: false, vorschau: undefined })
    this.dateien.delete(r.key)
  }
  hat(wepId: string, fotoId: string): boolean {
    return this.dateien.has(fotoKey(wepId, fotoId))
  }
  record(wepId: string, fotoId: string): FotoRecord | undefined {
    return this.records.get(fotoKey(wepId, fotoId))
  }
}

export function speicherListe(): AufraeumListe & { ids: string[] } {
  const l = { ids: [] as string[], lade: () => [...l.ids], speichere: (ids: string[]) => void (l.ids = [...ids]) }
  return l
}

export function wep(id: string, anlage: string): Wep {
  const w = neuerWep(id)
  w.formalien.kleingartenanlage = anlage
  return w
}

export function anlage(lokal: FakeLokal, id: string): string | undefined {
  return lokal.weps.get(id)?.formalien.kleingartenanlage
}

/** Ein Gerät mit eigenem lokalem Speicher, das gegen ein gemeinsames FakeDrive abgleicht. */
export class Geraet {
  lokal = new FakeLokal()
  fotos = new FakeFotos()
  aufraeumen = speicherListe()
  /** false = offline: sync() wirft wie im Browser. */
  online = true
  /** false = „nur WLAN“ und gerade Mobilfunk: Fotos werden nicht hochgeladen. */
  wlan = true

  constructor(
    readonly name: string,
    readonly drive: FakeDrive,
    readonly uhr: Uhr,
  ) {}

  /** Nutzer ändert/legt ein WEP an (speichereWep). */
  async bearbeite(w: Wep): Promise<boolean> {
    return this.lokal.speichereWep(w, this.uhr.vor(1))
  }

  loesche(id: string) {
    return regeln.loescheWep(this.lokal, id, { jetzt: this.uhr.vor(1), geraet: this.name })
  }
  stelleWiederHer(id: string) {
    return regeln.stelleWiederHer(this.lokal, id, { jetzt: this.uhr.vor(1), geraet: this.name })
  }
  loescheEndgueltig(id: string) {
    return regeln.loescheEndgueltig(this.lokal, id, this.uhr.vor(1))
  }
  raeumeAuf() {
    return regeln.raeumePapierkorbAuf(this.lokal, this.uhr.jetzt())
  }
  loeseKonflikt(id: string, wahl: regeln.KonfliktWahl) {
    return regeln.loeseKonflikt(this.lokal, id, wahl, { jetzt: this.uhr.vor(1), geraet: this.name })
  }

  /** Abgleich wie die App: erst Abgelaufenes aufräumen, dann synchronisieren. */
  async sync(): Promise<SyncErgebnis> {
    if (!this.online) throw new Error('Keine Internetverbindung')
    await this.raeumeAuf()
    return synchronisiere({
      client: this.drive.client('daten'),
      papierkorb: this.drive.client('daten/papierkorb'),
      lokal: this.lokal,
      geraet: this.name,
      jetzt: () => this.uhr.vor(1),
    })
  }

  /** Nutzer nimmt ein Foto auf: Datei lokal ablegen, dann Verweis im WEP speichern (wie fuegeFotosHinzu). */
  async neuesFoto(wepId: string, id: string, inhalt: string, positionId?: string, text?: string): Promise<Foto> {
    const zeit = this.uhr.vor(1)
    const foto: Foto = {
      id,
      ...(positionId ? { positionId } : {}),
      ...(text ? { text } : {}),
      aufgenommenAm: zeit,
      breite: 2000,
      hoehe: 1500,
      groesse: inhalt.length,
    }
    await this.fotos.speichere(
      { key: fotoKey(wepId, id), wepId, id, hatDatei: true, hochgeladen: false, erstelltAm: zeit },
      new Blob([inhalt]),
    )
    const w = structuredClone(this.lokal.weps.get(wepId)) as Wep
    await this.bearbeite({ ...w, fotos: [...(w.fotos ?? []), foto] })
    return foto
  }

  /** Nutzer löscht ein Foto (die echte Funktion aus src/fotos, mit der Ablage dieses Geräts). */
  async loescheFoto(wepId: string, id: string): Promise<void> {
    await loescheFoto({
      wepId,
      fotoId: id,
      aendere: async (fn) => void (await this.bearbeite(fn(structuredClone(this.lokal.weps.get(wepId)) as Wep))),
      werkzeuge: { ablage: this.fotos, jetzt: () => this.uhr.vor(1) },
    })
  }

  /** Wie die App: WEP-Abgleich, danach der Foto-Abgleich. */
  async syncMitFotos(): Promise<{ wep: SyncErgebnis; fotos: FotoSyncErgebnis }> {
    if (!this.online) throw new Error('Keine Internetverbindung')
    await this.raeumeAuf()
    await merkeEndgueltigGeloeschte(this.lokal, this.aufraeumen)
    const wepErgebnis = await synchronisiere({
      client: this.drive.client('daten'),
      papierkorb: this.drive.client('daten/papierkorb'),
      lokal: this.lokal,
      geraet: this.name,
      jetzt: () => this.uhr.vor(1),
      vorUmnummerieren: async (von, nach) => {
        for (const r of await this.fotos.recordsVon(von)) {
          await this.fotos.speichere(
            { ...r, key: fotoKey(nach, r.id), wepId: nach, hochgeladen: false },
            this.fotos.dateien.get(r.key),
          )
        }
      },
    })
    const fotos = await synchronisiereFotos({
      daten: (id) => this.drive.client(`daten/fotos/${id}`),
      papierkorb: (id) => this.drive.client(`daten/papierkorb/fotos/${id}`),
      lokal: this.lokal,
      fotos: this.fotos,
      aufraeumen: this.aufraeumen,
      uploadErlaubt: async () => this.wlan,
      wepErgebnis,
      jetzt: () => this.uhr.jetzt(),
    })
    return { wep: wepErgebnis, fotos }
  }

  /** Endgültig löschen wie die App (aktionen.ts): Marke + Fotos lokal weg, OneDrive beim nächsten Abgleich. */
  async loescheEndgueltigMitFotos(id: string): Promise<boolean> {
    const ok = await this.loescheEndgueltig(id)
    if (ok) {
      for (const r of await this.fotos.recordsVon(id)) await this.fotos.entferne(id, r.id)
      this.aufraeumen.speichere([...new Set([...this.aufraeumen.lade(), id])])
    }
    return ok
  }

  meta(id: string): SyncMeta | undefined {
    return this.lokal.meta.get(id)
  }
  hat(id: string): boolean {
    return this.lokal.weps.has(id)
  }
  imKorb(id: string): boolean {
    return this.lokal.korb.has(id)
  }
}
