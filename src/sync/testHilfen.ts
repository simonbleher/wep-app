// Hilfen für die Sync-Tests: ein Speicher im Arbeitsspeicher (wie IndexedDB, aber ohne Browser),
// eine steuerbare Uhr und ein „Gerät“, das gegen ein gemeinsames FakeDrive abgleicht.
import { neuerWep, type Wep } from '@/model'
import { synchronisiere } from './engine'
import { FakeDrive } from './fakeDrive'
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
  /** false = offline: sync() wirft wie im Browser. */
  online = true

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
