// Web-Umsetzung des Konto-Dienstes: MSAL.js, Authorization Code + PKCE.
//
// Die Client-ID kommt aus der Umgebungsvariable VITE_MS_CLIENT_ID (.env.local),
// siehe docs/SYNC.md. Ohne Client-ID ist die Anmeldung nicht verfügbar.
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser'
import type { Konto, KontoDienst } from './types'
import { anmeldeFehlerText } from './fehler'

/** Nur diese eine Berechtigung: Lesen/Schreiben im eigenen App-Ordner. */
export const SCOPES = ['Files.ReadWrite.AppFolder']

function alsKonto(a: AccountInfo): Konto {
  return { name: a.name ?? '', benutzername: a.username }
}

export function erstelleWebKontoDienst(clientId: string | undefined): KontoDienst {
  const konfiguriert = typeof clientId === 'string' && clientId.trim().length > 0
  let appPromise: Promise<PublicClientApplication> | undefined
  let rueckkehrFehler: string | undefined

  function app(): Promise<PublicClientApplication> {
    if (!konfiguriert) throw new Error('VITE_MS_CLIENT_ID ist nicht gesetzt')
    if (!appPromise) {
      appPromise = (async () => {
        const pca = new PublicClientApplication({
          auth: {
            clientId: clientId as string,
            // „common“ = persönliche Microsoft-Konten und Geschäfts-/Schulkonten (Ziel 5). MSAL erneuert im Tenant des
            // jeweiligen Kontos; persönliche Konten bleiben, wie sie sind.
            authority: 'https://login.microsoftonline.com/common',
            redirectUri: window.location.origin + import.meta.env.BASE_URL,
          },
          cache: { cacheLocation: 'localStorage' },
        })
        await pca.initialize()
        // Rückkehr vom Login verarbeiten. Ein Fehler (z. B. fehlende Administratorzustimmung) wird gemerkt und beim
        // nächsten Blick auf das Konto gemeldet – die App selbst bleibt benutzbar (erneut anmelden, ohne Konto weiter).
        try {
          const antwort = await pca.handleRedirectPromise()
          if (antwort?.account) pca.setActiveAccount(antwort.account)
        } catch (e) {
          rueckkehrFehler = anmeldeFehlerText(e)
        }
        return pca
      })()
    }
    return appPromise
  }

  async function konto(): Promise<AccountInfo | null> {
    if (!konfiguriert) return null
    const pca = await app()
    if (rueckkehrFehler) {
      const f = rueckkehrFehler
      rueckkehrFehler = undefined
      throw new Error(f)
    }
    const k = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null
    if (k) pca.setActiveAccount(k)
    return k
  }

  return {
    verfuegbar: () => konfiguriert,

    async aktuellesKonto() {
      const k = await konto()
      return k ? alsKonto(k) : null
    },

    async anmelden() {
      const pca = await app()
      await pca.loginRedirect({ scopes: SCOPES })
    },

    async abmelden() {
      const pca = await app()
      const k = pca.getActiveAccount() ?? undefined
      await pca.logoutRedirect({ account: k })
    },

    /** Liefert ein Zugriffstoken; bei abgelaufener Anmeldung neue Anmeldung. */
    async zugriffstoken() {
      const pca = await app()
      const k = await konto()
      if (!k) throw new Error('Nicht mit OneDrive verbunden')
      try {
        const r = await pca.acquireTokenSilent({ scopes: SCOPES, account: k })
        return r.accessToken
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) {
          await pca.acquireTokenRedirect({ scopes: SCOPES, account: k })
        }
        throw e
      }
    },
  }
}
