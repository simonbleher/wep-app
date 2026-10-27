// Microsoft-Anmeldung der BV-Kontrollseite (nur Browser): MSAL mit derselben App-Registrierung wie die App, aber nur
// openid/profile/email – die Seite braucht kein OneDrive, nur ein ID-Token, das der Server prüft. Rücksprung nach /bv
// (in Azure als Umleitungs-URI „Single-Page-Webanwendung“ eintragen, siehe docs/BV-ZUGANG.md).
// Zwischenspeicher nur für die Sitzung (sessionStorage): Die Wertermittler-App im selben Browser (localStorage) soll das
// BV-Konto nicht für ihr OneDrive-Konto halten. Beim nächsten Öffnen meldet `stillAnmelden` ohne Klick wieder an.
import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import { anmeldeFehlerText } from '@/konto'

const SCOPES = ['openid', 'profile', 'email']
/** ID-Token so lange vor Ablauf erneuern. */
const PUFFER_S = 300

let pcaPromise: Promise<PublicClientApplication> | undefined
let rueckkehrFehler: string | undefined

function pca(): Promise<PublicClientApplication> {
  const clientId = import.meta.env.VITE_MS_CLIENT_ID
  if (!clientId) return Promise.reject(new Error('VITE_MS_CLIENT_ID ist nicht gesetzt'))
  pcaPromise ??= (async () => {
    const p = new PublicClientApplication({
      auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: `${window.location.origin}/bv` },
      cache: { cacheLocation: 'sessionStorage' },
    })
    await p.initialize()
    try {
      const r = await p.handleRedirectPromise()
      if (r?.account) p.setActiveAccount(r.account)
    } catch (e) {
      rueckkehrFehler = anmeldeFehlerText(e)
    }
    return p
  })()
  return pcaPromise
}

/** Fehler von der Rückkehr aus dem Microsoft-Login (einmal abholen). */
export function holeRueckkehrFehler(): string | undefined {
  const f = rueckkehrFehler
  rueckkehrFehler = undefined
  return f
}

async function konto(): Promise<AccountInfo | null> {
  const p = await pca()
  const k = p.getActiveAccount() ?? p.getAllAccounts()[0] ?? null
  if (k) p.setActiveAccount(k)
  return k
}

/** ID-Token des angemeldeten Kontos (bei Bedarf erneuert), sonst `undefined`. */
export async function idToken(): Promise<string | undefined> {
  const p = await pca()
  const k = await konto()
  if (!k) return undefined
  const exp = Number((k.idTokenClaims as { exp?: number } | undefined)?.exp ?? 0)
  const r = await p.acquireTokenSilent({ scopes: SCOPES, account: k, forceRefresh: exp - PUFFER_S < Date.now() / 1000 })
  return r.idToken || undefined
}

export async function istAngemeldet(): Promise<boolean> {
  return (await konto()) !== null
}

/** Ohne Klick wieder anmelden (bestehende Microsoft-Sitzung im Browser); `false`, wenn das nicht geht. */
export async function stillAnmelden(email: string | undefined): Promise<boolean> {
  if (!email) return false
  const p = await pca()
  try {
    const r = await p.ssoSilent({ scopes: SCOPES, loginHint: email })
    if (r.account) p.setActiveAccount(r.account)
    return Boolean(r.account)
  } catch {
    return false
  }
}

export async function anmelden(): Promise<void> {
  await (await pca()).loginRedirect({ scopes: SCOPES, prompt: 'select_account' })
}

export async function abmelden(): Promise<void> {
  const p = await pca()
  await p.logoutRedirect({ account: (await konto()) ?? undefined, postLogoutRedirectUri: `${window.location.origin}/bv` })
}
