// Microsoft-Graph-Zugriff auf den App-Ordner im privaten OneDrive.
//
// Mit der Berechtigung Files.ReadWrite.AppFolder sieht die App nur ihren eigenen
// Ordner „Apps/<App-Name>“ – nicht das restliche OneDrive. Darin gibt es
// daten/ (WEP-Dateien, profil.json), Exporte/ (fertige Excel-Dateien) und LIESMICH.txt.
import type { GraphClient, RemoteDatei } from './types'

const BASIS = 'https://graph.microsoft.com/v1.0/me/drive/special/approot'

interface DriveItem {
  id?: string
  name: string
  eTag: string
  lastModifiedDateTime: string
  file?: unknown
}

/** Fehler einer Graph-Anfrage mit HTTP-Status (404 = nicht vorhanden, 409 = Konflikt). */
export class GraphFehler extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function alsRemote(item: DriveItem): RemoteDatei {
  return { name: item.name, eTag: item.eTag, geaendertAm: item.lastModifiedDateTime }
}

/** Pfad im App-Ordner, jedes Segment einzeln kodiert. */
function pfad(...teile: string[]): string {
  return teile
    .filter((t) => t !== '')
    .flatMap((t) => t.split('/'))
    .map(encodeURIComponent)
    .join('/')
}

/**
 * Erstellt einen Graph-Client für einen Ordner im App-Ordner ('' = der App-Ordner
 * selbst). `token` liefert ein gültiges Zugriffstoken (siehe src/konto); `holen`
 * ist austauschbar für Tests.
 */
export function erstelleGraphClient(
  token: () => Promise<string>,
  holen: typeof fetch = (...a) => fetch(...a),
  ordner = '',
): GraphClient {
  async function anfrage(url: string, init: RequestInit = {}): Promise<Response> {
    const antwort = await holen(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await token()}` },
    })
    if (!antwort.ok) {
      throw new GraphFehler(
        antwort.status,
        `OneDrive-Fehler ${antwort.status} bei ${init.method ?? 'GET'} ${url}`,
      )
    }
    return antwort
  }

  const dateiUrl = (name: string) => `${BASIS}:/${pfad(ordner, name)}:`
  const kinderUrl = ordner ? `${BASIS}:/${pfad(ordner)}:/children` : `${BASIS}/children`

  /** Id des Ordners im App-Ordner; legt ihn an, wenn er fehlt. */
  async function ordnerId(name: string): Promise<string> {
    try {
      const r = await anfrage(`${BASIS}:/${pfad(name)}?$select=id`)
      return ((await r.json()) as DriveItem).id as string
    } catch (e) {
      if (!(e instanceof GraphFehler) || e.status !== 404) throw e
    }
    const r = await anfrage(`${BASIS}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    })
    return ((await r.json()) as DriveItem).id as string
  }

  return {
    async liste() {
      const dateien: RemoteDatei[] = []
      let url: string | undefined =
        `${kinderUrl}?$select=name,eTag,lastModifiedDateTime,file&$top=200`
      try {
        while (url) {
          const seite = (await (await anfrage(url)).json()) as {
            value: DriveItem[]
            '@odata.nextLink'?: string
          }
          for (const item of seite.value) if (item.file) dateien.push(alsRemote(item))
          url = seite['@odata.nextLink']
        }
      } catch (e) {
        if (e instanceof GraphFehler && e.status === 404 && ordner) return [] // Ordner fehlt noch
        throw e
      }
      return dateien
    },

    async lade(name) {
      const antwort = await anfrage(`${dateiUrl(name)}/content`)
      return antwort.text()
    },

    async schreibe(name, inhalt, typ = 'application/json') {
      const antwort = await anfrage(`${dateiUrl(name)}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': typ },
        body: inhalt,
      })
      return alsRemote((await antwort.json()) as DriveItem)
    },

    async verschiebe(name, zielOrdner) {
      const zielId = await ordnerId(zielOrdner)
      try {
        await anfrage(dateiUrl(name), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentReference: { id: zielId },
            '@microsoft.graph.conflictBehavior': 'fail',
          }),
        })
        return 'verschoben'
      } catch (e) {
        if (e instanceof GraphFehler && e.status === 409) return 'vorhanden'
        throw e
      }
    },
  }
}
