// D1-Ersatz für die Tests: SQLite aus Node (node:sqlite) mit allen Migrationen aus migrations/.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Db, DbAnweisung } from '../v2/db'

const MIGRATIONEN = join(__dirname, '../../../migrations')

export function testDb(): Db & { roh: DatabaseSync } {
  const roh = new DatabaseSync(':memory:')
  roh.exec('PRAGMA foreign_keys = ON')
  for (const datei of readdirSync(MIGRATIONEN).filter((d) => d.endsWith('.sql')).sort()) roh.exec(readFileSync(join(MIGRATIONEN, datei), 'utf8'))
  const anweisung = (sql: string, werte: unknown[] = []): DbAnweisung => {
    const w = werte.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x)) as (string | number | null)[]
    return {
      bind: (...neu) => anweisung(sql, neu),
      first: async <T,>() => ((roh.prepare(sql).get(...w) as T | undefined) ?? null),
      all: async <T,>() => ({ results: roh.prepare(sql).all(...w) as T[] }),
      run: async () => ({ meta: { changes: Number(roh.prepare(sql).run(...w).changes) } }),
    }
  }
  return {
    roh,
    prepare: (sql) => anweisung(sql),
    batch: async (liste) => {
      roh.exec('BEGIN')
      try {
        const erg = []
        for (const a of liste) erg.push(await a.run())
        roh.exec('COMMIT')
        return erg
      } catch (e) {
        roh.exec('ROLLBACK')
        throw e
      }
    },
  }
}
