// Microsoft-Graph-Zugriff auf den App-Ordner im privaten OneDrive.
//
// Mit der Berechtigung Files.ReadWrite.AppFolder sieht die App nur ihren eigenen
// Ordner „Apps/<App-Name>“ – nicht das restliche OneDrive.
import type { GraphClient, RemoteDatei } from './types'

const BASIS = 'https://graph.microsoft.com/v1.0/me/drive/special/approot'

interface DriveItem {
  name: string
  eTag: string
  lastModifiedDateTime: string
  file?: unknown
}

function alsRemote(item: DriveItem): RemoteDatei {
  return { name: item.name, eTag: item.eTag, geaendertAm: item.lastModifiedDateTime }
}

/**
 * Erstellt einen Graph-Client. `token` liefert ein gültiges Zugriffstoken
 * (siehe auth.ts); `holen` ist austauschbar für Tests.
 */
export function erstelleGraphClient(
  token: () => Promise<string>,
  holen: typeof fetch = (...a) => fetch(...a),
): GraphClient {
  async function anfrage(url: string, init: RequestInit = {}): Promise<Response> {
    const antwort = await holen(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await token()}` },
    })
    if (!antwort.ok) {
      throw new Error(`OneDrive-Fehler ${antwort.status} bei ${init.method ?? 'GET'} ${url}`)
    }
    return antwort
  }

  return {
    async liste() {
      const dateien: RemoteDatei[] = []
      let url: string | undefined =
        `${BASIS}/children?$select=name,eTag,lastModifiedDateTime,file&$top=200`
      while (url) {
        const seite = (await (await anfrage(url)).json()) as {
          value: DriveItem[]
          '@odata.nextLink'?: string
        }
        for (const item of seite.value) if (item.file) dateien.push(alsRemote(item))
        url = seite['@odata.nextLink']
      }
      return dateien
    },

    async lade(name) {
      const antwort = await anfrage(`${BASIS}:/${encodeURIComponent(name)}:/content`)
      return antwort.text()
    },

    async schreibe(name, inhalt) {
      const antwort = await anfrage(`${BASIS}:/${encodeURIComponent(name)}:/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: inhalt,
      })
      return alsRemote((await antwort.json()) as DriveItem)
    },
  }
}
