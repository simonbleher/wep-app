// Microsoft-Graph-Zugriff auf den App-Ordner im privaten OneDrive.
//
// Mit der Berechtigung Files.ReadWrite.AppFolder sieht die App nur ihren eigenen
// Ordner „Apps/<App-Name>“ – nicht das restliche OneDrive. Darin gibt es
// daten/ (WEP-Dateien, profil.json), Exporte/ (fertige Excel-Dateien) und LIESMICH.txt.
import type { GraphClient, RemoteDatei } from './types'

const LAUFWERK = 'https://graph.microsoft.com/v1.0/me/drive'
const BASIS = `${LAUFWERK}/special/approot`

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
      let detail = ''
      try {
        const body = (await antwort.json()) as { error?: { code?: string; message?: string } }
        if (body.error) detail = ` – ${[body.error.code, body.error.message].filter(Boolean).join(': ')}`
      } catch {
        // kein JSON im Fehler
      }
      throw new GraphFehler(
        antwort.status,
        `OneDrive-Fehler ${antwort.status} bei ${init.method ?? 'GET'} ${url}${detail}`,
      )
    }
    return antwort
  }

  const dateiUrl = (name: string) => `${BASIS}:/${pfad(ordner, name)}:`
  const kinderUrl = ordner ? `${BASIS}:/${pfad(ordner)}:/children` : `${BASIS}/children`

  /** Id eines Ordners im App-Ordner oder undefined, wenn er (noch) fehlt. */
  async function vorhandeneOrdnerId(name: string): Promise<string | undefined> {
    try {
      const r = await anfrage(`${BASIS}:/${pfad(name)}?$select=id`)
      return ((await r.json()) as DriveItem).id as string
    } catch (e) {
      if (e instanceof GraphFehler && e.status === 404) return undefined
      throw e
    }
  }

  /**
   * Id des Ordners im App-Ordner; legt ihn an, wenn er fehlt.
   *
   * Hinweis: `POST …/special/approot/children` lehnt OneDrive (privat) mit 400 ab.
   * Deshalb über die echte Id des App-Ordners anlegen (`/me/drive/items/{id}/children`).
   * Klappt auch das nicht, legen wir den Ordner indirekt an: Ein Upload per Pfad
   * erzeugt fehlende Ordner automatisch; die Hilfsdatei wird danach gelöscht.
   */
  async function ordnerId(name: string): Promise<string> {
    const vorhanden = await vorhandeneOrdnerId(name)
    if (vorhanden) return vorhanden

    // Verschachtelt ('daten/papierkorb'): erst den übergeordneten Ordner sicherstellen
    const teile = name.split('/')
    const eigenerName = teile.pop() as string
    const elternId =
      teile.length > 0
        ? await ordnerId(teile.join('/'))
        : (((await (await anfrage(`${BASIS}?$select=id`)).json()) as DriveItem).id as string)
    try {
      const r = await anfrage(`${LAUFWERK}/items/${encodeURIComponent(elternId)}/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eigenerName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      })
      return ((await r.json()) as DriveItem).id as string
    } catch (e) {
      if (!(e instanceof GraphFehler)) throw e
      // 409: gleichzeitig von einem anderen Gerät angelegt → einfach nachschlagen
      if (e.status === 409) {
        const id = await vorhandeneOrdnerId(name)
        if (id) return id
      }
      if (e.status !== 400 && e.status !== 409) throw e
    }

    // Rückfall: Ordner über einen Upload per Pfad anlegen lassen
    const hilfe = `${BASIS}:/${pfad(name, '.ordner-anlegen')}:`
    await anfrage(`${hilfe}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: '',
    })
    try {
      await anfrage(hilfe, { method: 'DELETE' })
    } catch {
      // Hilfsdatei bleibt im Zweifel liegen – stört nicht
    }
    const id = await vorhandeneOrdnerId(name)
    if (!id) throw new GraphFehler(404, `OneDrive-Ordner „${name}“ konnte nicht angelegt werden`)
    return id
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

    async loesche(name) {
      try {
        await anfrage(dateiUrl(name), { method: 'DELETE' })
      } catch (e) {
        if (e instanceof GraphFehler && e.status === 404) return // schon weg
        throw e
      }
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
