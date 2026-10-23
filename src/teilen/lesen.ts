// WEP-Datei lesen: prüft die Datei und stellt sie wie eine Sicherung mit einem einzigen WEP dar,
// damit Vorschau und Einspielen der Sicherung (src/sicherung) unverändert genutzt werden können.
import JSZip from 'jszip'
import { SICHERUNG_FORMAT, SICHERUNG_JSON, type GeleseneSicherung, type SicherungsDatei } from '@/sicherung'
import { TEILEN_FORMAT, TEILEN_JSON, TEILEN_MAX_BYTES, TeilenFehler, type TeilenDatei } from './types'

export interface GeleseneTeilen {
  daten: TeilenDatei
  /** Dieselbe Datei in der Gestalt, die die Sicherungslogik versteht. */
  sicherung: GeleseneSicherung
}

const WEP_ID = /^\d{4}-\d{3,6}$/
const FOTO_ID = /^[A-Za-z0-9_-]{1,64}$/

const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** Grobe Prüfung, damit eine fremde oder halbe Datei nicht erst später in der Oberfläche abstürzt. */
function pruefeWep(w: unknown): string | undefined {
  if (!istObjekt(w)) return 'Das WEP in der Datei fehlt.'
  if (typeof w.id !== 'string' || !WEP_ID.test(w.id)) return 'Die Vorgangs-Nr. des WEP ist ungültig.'
  if (!istObjekt(w.formalien)) return 'Die Formalien des WEP fehlen.'
  const g = w.gruen
  if (!istObjekt(g) || !Array.isArray(g.aussenanlagen) || !Array.isArray(g.aufwuchs) || !Array.isArray(g.beseitigungAA)) {
    return 'Der Grün-Teil des WEP ist unvollständig.'
  }
  if (w.fotos !== undefined && (!Array.isArray(w.fotos) || w.fotos.some((f) => !istObjekt(f) || typeof f.id !== 'string' || !FOTO_ID.test(f.id)))) {
    return 'Die Fotoliste des WEP ist ungültig.'
  }
  return undefined
}

/** Liest eine `.wep`-Datei. Wirft einen `TeilenFehler` mit verständlichem Text, wenn sie nicht passt. */
export async function leseTeilen(quelle: Blob | Uint8Array | ArrayBuffer): Promise<GeleseneTeilen> {
  const groesse = quelle instanceof Blob ? quelle.size : quelle.byteLength
  if (groesse > TEILEN_MAX_BYTES) throw new TeilenFehler('Die Datei ist zu groß für eine WEP-Datei.')
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(quelle instanceof Blob ? await quelle.arrayBuffer() : quelle)
  } catch {
    throw new TeilenFehler('Das ist keine WEP-Datei (keine gültige ZIP-Datei).')
  }
  const eintrag = zip.file(TEILEN_JSON)
  if (!eintrag) {
    throw new TeilenFehler(
      zip.file(SICHERUNG_JSON)
        ? 'Das ist eine Sicherung, keine einzelne WEP-Datei. Sicherungen spielst du unter Profil → Sicherung ein.'
        : 'Das ist keine WEP-Datei (wep.json fehlt).',
    )
  }
  let daten: TeilenDatei
  try {
    daten = JSON.parse(await eintrag.async('string')) as TeilenDatei
  } catch {
    throw new TeilenFehler('Die WEP-Datei ist beschädigt (wep.json ist nicht lesbar).')
  }
  if (!istObjekt(daten) || typeof daten.format !== 'string' || !daten.format.startsWith('wep-teilen/')) {
    throw new TeilenFehler('Das ist keine WEP-Datei.')
  }
  if (daten.format !== TEILEN_FORMAT) {
    throw new TeilenFehler(
      `Die Datei hat das Format „${daten.format}“. Diese App-Version kennt nur „${TEILEN_FORMAT}“ – bitte die App aktualisieren.`,
    )
  }
  const problem = pruefeWep(daten.wep)
  if (problem) throw new TeilenFehler(`Die WEP-Datei ist beschädigt: ${problem}`)

  const wep = daten.wep
  const sauber: TeilenDatei = {
    ...daten,
    fotos: Array.isArray(daten.fotos) ? daten.fotos.filter((f) => f && typeof f.id === 'string' && FOTO_ID.test(f.id)) : [],
    enthaelt: daten.enthaelt ?? { fotos: false, bauExcel: false },
  }
  const bytes = async (pfad: string) => {
    const f = zip.file(pfad)
    return f ? await f.async('uint8array') : undefined
  }
  const alsSicherung: SicherungsDatei = {
    format: SICHERUNG_FORMAT,
    erstelltAm: String(daten.erstelltAm ?? ''),
    appVersion: String(daten.appVersion ?? ''),
    weps: [{ wep, geaendertAm: daten.geaendertAm }],
    papierkorb: [],
    eigenePositionen: [],
    profil: { profil: { name: '', rolle: 'gruen', standardAnlage: '' } },
    enthaelt: sauber.enthaelt,
    fotos: sauber.fotos.map((f) => ({ wepId: wep.id, id: f.id })),
    bauExcel: wep.bauExcel && zip.file('bau.xlsx') ? [{ wepId: wep.id }] : [],
  }
  return {
    daten: sauber,
    sicherung: {
      daten: alsSicherung,
      foto: (_wepId, fotoId) => bytes(`fotos/${fotoId}.jpg`),
      bauExcel: () => bytes('bau.xlsx'),
    },
  }
}
