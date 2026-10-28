// Schnittstelle der D1-Datenbank, soweit v2 sie nutzt. In Cloudflare ist es die Bindung WEP_DB, in den Tests eine
// SQLite-Datenbank aus Node (functions/_lib/__tests__/sqliteDb.ts) mit denselben Migrationen (migrations/).

export interface DbAnweisung {
  bind(...werte: unknown[]): DbAnweisung
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes?: number } }>
}

export interface Db {
  prepare(sql: string): DbAnweisung
  batch(anweisungen: DbAnweisung[]): Promise<unknown[]>
}

export const jetztIso = (jetzt = Date.now()) => new Date(jetzt).toISOString()
