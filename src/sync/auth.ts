// Anmeldung am privaten Microsoft-Konto (MSAL.js, Authorization Code + PKCE).
//
// Die Client-ID kommt aus der Umgebungsvariable VITE_MS_CLIENT_ID (.env.local),
// siehe docs/SYNC.md. Ohne Client-ID ist der Sync einfach deaktiviert.
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser'

/** Nur diese eine Berechtigung: Lesen/Schreiben im eigenen App-Ordner. */
export const SCOPES = ['Files.ReadWrite.AppFolder']

const CLIENT_ID: string | undefined = import.meta.env.VITE_MS_CLIENT_ID

export function syncKonfiguriert(): boolean {
  return typeof CLIENT_ID === 'string' && CLIENT_ID.trim().length > 0
}

let appPromise: Promise<PublicClientApplication> | undefined

function app(): Promise<PublicClientApplication> {
  if (!syncKonfiguriert()) throw new Error('VITE_MS_CLIENT_ID ist nicht gesetzt')
  if (!appPromise) {
    appPromise = (async () => {
      const pca = new PublicClientApplication({
        auth: {
          clientId: CLIENT_ID as string,
          // „consumers“ = nur persönliche Microsoft-Konten
          authority: 'https://login.microsoftonline.com/consumers',
          redirectUri: window.location.origin + import.meta.env.BASE_URL,
        },
        cache: { cacheLocation: 'localStorage' },
      })
      await pca.initialize()
      const antwort = await pca.handleRedirectPromise()
      if (antwort?.account) pca.setActiveAccount(antwort.account)
      return pca
    })()
  }
  return appPromise
}

/** Angemeldetes Konto oder null. Verarbeitet auch die Rückkehr vom Login. */
export async function aktuellesKonto(): Promise<AccountInfo | null> {
  if (!syncKonfiguriert()) return null
  const pca = await app()
  const konto = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null
  if (konto) pca.setActiveAccount(konto)
  return konto
}

/** Startet die Anmeldung (Weiterleitung zu Microsoft). */
export async function anmelden(): Promise<void> {
  const pca = await app()
  await pca.loginRedirect({ scopes: SCOPES })
}

export async function abmelden(): Promise<void> {
  const pca = await app()
  const konto = pca.getActiveAccount() ?? undefined
  await pca.logoutRedirect({ account: konto })
}

/** Liefert ein Zugriffstoken; bei abgelaufener Anmeldung neue Anmeldung. */
export async function zugriffstoken(): Promise<string> {
  const pca = await app()
  const konto = await aktuellesKonto()
  if (!konto) throw new Error('Nicht mit OneDrive verbunden')
  try {
    const r = await pca.acquireTokenSilent({ scopes: SCOPES, account: konto })
    return r.accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await pca.acquireTokenRedirect({ scopes: SCOPES, account: konto })
    }
    throw e
  }
}
