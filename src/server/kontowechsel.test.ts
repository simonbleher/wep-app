// @vitest-environment node
// Sicherheitsprüfung v2, Fund M7 (docs/SICHERHEITSPRUEFUNG-V2.md): Die lokale Ablage (IndexedDB „wep-db-v2“) gehört nicht
// zu einem Konto. Meldet sich auf demselben Gerät eine andere Person an, sieht sie die noch nicht abgeglichenen WEPs der
// vorigen Person – und der nächste Abgleich lädt sie als ihre eigenen hoch. Offener Fund: `it.fails` beschreibt das sichere
// Verhalten. Nur erfundene Daten.
import { describe, expect, it } from 'vitest'
import { neuerWep, type Wep } from '@/model'
import { FakeLokal, Uhr } from '@/sync/testHilfen'
import { testDb } from '../../functions/_lib/__tests__/sqliteDb'
import type { Konto } from '../../functions/_lib/v2/konten'
import { ladeWep, lesbareWeps, setzePapierkorb, speichereWep, type Ergebnis } from '../../functions/_lib/v2/weps'
import { AbgleichFehler, serverAbgleich, type ServerKopf, type ServerStand, type ServerZugriff } from './abgleich'

function konto(db: ReturnType<typeof testDb>, id: string): Konto {
  const zeit = '2026-10-28T08:00:00.000Z'
  db.roh.prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES (?, 'google', ?, ?, ?, 'freigegeben', 'bau', ?, ?)").run(id, id, `${id}@example.org`, id, zeit, zeit)
  return { id, anbieter: 'google', email: `${id}@example.org`, name: id, status: 'freigegeben', rollen: ['bau'], mailBenachrichtigung: true, erstelltAm: zeit, geaendertAm: zeit }
}

function zugriff(db: ReturnType<typeof testDb>, k: Konto): ServerZugriff {
  const e = <T,>(x: Ergebnis<T>): T => {
    if (x.ok) return x.wert
    throw new AbgleichFehler(x.fehler, x.status, x.stand as ServerStand | undefined)
  }
  return {
    liste: async () => (await lesbareWeps(db, k)) as ServerKopf[],
    lade: async (id) => e(await ladeWep(db, k, id)) as ServerStand,
    speichere: async (wep: Wep, basisRev: number) => e(await speichereWep(db, k, wep.id, { wep, basisRev })) as ServerKopf,
    loesche: async (id, basisRev) => e(await setzePapierkorb(db, k, id, true, basisRev)) as ServerKopf,
    stelleWiederHer: async (id) => e(await setzePapierkorb(db, k, id, false, undefined)) as ServerKopf,
    fuehreZusammen: async () => {
      throw new Error('nicht benötigt')
    },
  }
}

describe('Fund M7: lokale Daten beim Kontowechsel auf demselben Gerät', () => {
  it.fails('ein nicht abgeglichenes WEP der vorigen Person wird nicht unter dem neuen Konto hochgeladen', async () => {
    const db = testDb()
    const uhr = new Uhr()
    const erika = konto(db, 'bau-erika')
    const max = konto(db, 'bau-max')
    const geraet = new FakeLokal()
    // Erika erfasst offline, meldet sich ab; Max meldet sich auf demselben Gerät an
    const w = neuerWep('w-offline')
    w.formalien.unterpaechter = 'Erika Musterfrau'
    await geraet.speichereWep(w, uhr.vor(1))
    void erika
    const erg = await serverAbgleich({ server: zugriff(db, max), lokal: geraet, jetzt: uhr.jetzt })
    expect(erg.hochgeladen).not.toContain('w-offline')
  })
})
