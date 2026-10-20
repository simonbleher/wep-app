// Nachbildung des OneDrive-App-Ordners für Tests: ein Baum aus Ordnern und Dateien,
// auf den man pro Ordner einen GraphClient setzen kann (wie erstelleGraphClient).
import type { GraphClient, RemoteDatei } from './types'

interface Eintrag {
  inhalt: string | Blob
  eTag: string
  geaendertAm: string
}

export class FakeDrive {
  /** Schlüssel: 'datei.json' (App-Ordner) oder 'daten/datei.json'. */
  dateien = new Map<string, Eintrag>()
  aufrufe: string[] = []
  private zaehler = 0

  /** Legt eine Datei direkt ab (Ausgangszustand eines Tests). */
  lege(pfad: string, inhalt: string | Blob = '{}'): void {
    this.dateien.set(pfad, this.neu(inhalt))
  }

  /** Namen im App-Ordner bzw. in einem Unterordner, sortiert. */
  namen(ordner = ''): string[] {
    const prefix = ordner ? `${ordner}/` : ''
    return [...this.dateien.keys()]
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      .map((k) => k.slice(prefix.length))
      .sort()
  }

  /** Inhalt einer Datei als Text (Test-Abkürzung). */
  text(pfad: string): string {
    const d = this.dateien.get(pfad)
    if (!d || typeof d.inhalt !== 'string') throw new Error(`keine Textdatei: ${pfad}`)
    return d.inhalt
  }

  client(ordner = ''): GraphClient {
    const voll = (name: string) => (ordner ? `${ordner}/${name}` : name)
    return {
      liste: async (): Promise<RemoteDatei[]> => {
        this.aufrufe.push(`liste ${ordner}`)
        return this.namen(ordner).map((name) => {
          const d = this.dateien.get(voll(name)) as Eintrag
          return { name, eTag: d.eTag, geaendertAm: d.geaendertAm }
        })
      },
      lade: async (name) => {
        this.aufrufe.push(`lade ${voll(name)}`)
        const d = this.dateien.get(voll(name))
        if (!d || typeof d.inhalt !== 'string') throw new Error(`404 ${voll(name)}`)
        return d.inhalt
      },
      ladeBlob: async (name) => {
        this.aufrufe.push(`ladeBlob ${voll(name)}`)
        const d = this.dateien.get(voll(name))
        if (!d) throw new Error(`404 ${voll(name)}`)
        return typeof d.inhalt === 'string' ? new Blob([d.inhalt]) : d.inhalt
      },
      schreibe: async (name, inhalt) => {
        this.aufrufe.push(`schreibe ${voll(name)}`)
        const d = this.neu(inhalt)
        this.dateien.set(voll(name), d)
        return { name, eTag: d.eTag, geaendertAm: d.geaendertAm }
      },
      loesche: async (name) => {
        this.aufrufe.push(`loesche ${voll(name)}`)
        this.dateien.delete(voll(name))
      },
      verschiebe: async (name, zielOrdner) => {
        this.aufrufe.push(`verschiebe ${voll(name)} -> ${zielOrdner}`)
        const d = this.dateien.get(voll(name))
        if (!d) throw new Error(`404 ${voll(name)}`)
        const ziel = `${zielOrdner}/${name}`
        if (this.dateien.has(ziel)) return 'vorhanden'
        this.dateien.delete(voll(name))
        this.dateien.set(ziel, d)
        return 'verschoben'
      },
    }
  }

  private neu(inhalt: string | Blob): Eintrag {
    const n = ++this.zaehler
    return {
      inhalt,
      eTag: `etag-${n}`,
      geaendertAm: new Date(Date.UTC(2026, 9, 20, 12, 0, n)).toISOString(),
    }
  }
}
