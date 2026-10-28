// R2-Ersatz für die Tests (Speicher im Arbeitsspeicher).
import type { R2Ablage } from '../v2/dateien'

export function fakeR2(): R2Ablage & { daten: Map<string, { bytes: Uint8Array; typ?: string; zeit: Date }> } {
  const daten = new Map<string, { bytes: Uint8Array; typ?: string; zeit: Date }>()
  return {
    daten,
    async get(key) {
      const d = daten.get(key)
      return d ? { body: new Blob([d.bytes.slice().buffer]).stream(), size: d.bytes.byteLength, httpMetadata: { contentType: d.typ } } : null
    },
    async put(key, wert, opt) {
      daten.set(key, { bytes: new Uint8Array(wert), typ: opt?.httpMetadata?.contentType, zeit: new Date() })
    },
    async delete(key) {
      daten.delete(key)
    },
    async list({ prefix }) {
      return { objects: [...daten.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, d]) => ({ key, size: d.bytes.byteLength, uploaded: d.zeit })), truncated: false }
    },
  }
}
