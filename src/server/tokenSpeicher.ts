// Server-Modus in der Android- und Windows-App (Paket 8): Das Sitzungs-Token (Bearer) liegt sicher im Gerät, nie im
// localStorage – Android: verschlüsselte Preferences (Keystore), Windows: Anmeldeinformationsverwaltung. Für die
// laufende App hält `TokenHalter` es zusätzlich im Arbeitsspeicher, damit jeder Aufruf es ohne Umweg bekommt.
import type { WepNativePlugin } from '@/android/native'
import type { WepWindowsApi } from '@/windows/api'

export interface TokenSpeicher {
  lese(): Promise<string | null>
  speichere(token: string): Promise<void>
  loesche(): Promise<void>
}

export function androidTokenSpeicher(p: Pick<WepNativePlugin, 'leseServerToken' | 'speichereServerToken' | 'loescheServerToken'>): TokenSpeicher {
  return {
    lese: async () => (await p.leseServerToken()).token || null,
    speichere: (token) => p.speichereServerToken({ token }),
    loesche: () => p.loescheServerToken(),
  }
}

export function windowsTokenSpeicher(api: Pick<WepWindowsApi, 'serverTokenLesen' | 'serverTokenSpeichern' | 'serverTokenLoeschen'>): TokenSpeicher {
  return {
    lese: async () => (await api.serverTokenLesen()) || null,
    speichere: (token) => api.serverTokenSpeichern(token),
    loesche: () => api.serverTokenLoeschen(),
  }
}

/** Für Tests: Speicher im Arbeitsspeicher, der Inhalt ist von außen sichtbar. */
export function testTokenSpeicher(start: string | null = null): TokenSpeicher & { wert: string | null } {
  const s = {
    wert: start,
    lese: async () => s.wert,
    speichere: async (token: string) => {
      s.wert = token
    },
    loesche: async () => {
      s.wert = null
    },
  }
  return s
}

export interface TokenHalter {
  /** Token für den nächsten Aufruf (null = nicht angemeldet). */
  aktuell(): string | null
  /** Beim Start: gespeichertes Token laden. Ein defekter Speicher gilt als „nicht angemeldet“. */
  lade(): Promise<string | null>
  /** Nach der Anmeldung: erst sicher speichern, dann benutzen. */
  setze(token: string): Promise<void>
  /** Abmelden oder Sitzung auf dem Server widerrufen: aus Speicher und Arbeitsspeicher entfernen. */
  vergiss(): Promise<void>
}

export function erstelleTokenHalter(speicher: TokenSpeicher): TokenHalter {
  let token: string | null = null
  return {
    aktuell: () => token,
    async lade() {
      try {
        token = await speicher.lese()
      } catch (e) {
        console.warn('Token-Speicher:', e)
        token = null
      }
      return token
    },
    async setze(t) {
      await speicher.speichere(t)
      token = t
    },
    async vergiss() {
      token = null
      try {
        await speicher.loesche()
      } catch (e) {
        console.warn('Token-Speicher:', e)
      }
    },
  }
}
