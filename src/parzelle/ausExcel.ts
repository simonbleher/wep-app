/**
 * Parzelle aus der Bau-Excel übernehmen (Beta 6, Paket 1): die Form „Grundstück“ im Blatt „Skizze Bau“.
 *
 * Eine von Hand gezeichnete Bau-Skizze hat keine echten Maße. Übernommen wird deshalb nur die Gestalt (Ecken in beliebigen
 * Einheiten, ein achsenparalleles Rechteck als „rechteckig“); die Längen trägt der Wertermittler ein – die App sagt, was fehlt.
 */
import { leseBauSkizze } from '../export/bauSkizzeLesen'
import { grundstueckForm } from '../skizze/grundlage'
import type { Parzelle } from './types'

const r1 = (n: number) => Math.round(n * 10) / 10

export interface ParzelleAusExcel {
  /** Die Parzelle aus der Form „Grundstück“; fehlt, wenn die Bau-Excel keins enthält. */
  parzelle?: Parzelle
  /** Kurzer Text für die Meldung an den Nutzer. */
  hinweis: string
}

export async function parzelleAusBauExcel(excel: ArrayBuffer | Uint8Array, jetzt: string): Promise<ParzelleAusExcel> {
  const lesen = await leseBauSkizze(excel)
  if (!lesen.blattVorhanden) return { hinweis: 'In der Bau-Excel fehlt das Blatt „Skizze Bau“; eine Parzelle wurde nicht übernommen.' }
  const gs = grundstueckForm(lesen)
  if (!gs?.punkte || gs.punkte.length < 3) {
    return { hinweis: 'In „Skizze Bau“ der Bau-Excel ist kein Grundstück gezeichnet; eine Parzelle wurde nicht übernommen.' }
  }
  const xs = gs.punkte.map((p) => p.x)
  const ys = gs.punkte.map((p) => p.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const gross = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1
  const f = 100 / gross
  const ecken = gs.punkte.map((p) => ({ x: r1((p.x - x0) * f), y: r1((p.y - y0) * f) }))
  const toleranz = gross * 0.01
  const achsenparallel =
    gs.punkte.length === 4 &&
    gs.punkte.every((p, i) => {
      const q = gs.punkte![(i + 1) % 4]
      return Math.abs(p.x - q.x) < toleranz || Math.abs(p.y - q.y) < toleranz
    })
  const parzelle: Parzelle = {
    // Ecken bleiben auch beim Rechteck erhalten: sie geben das Seitenverhältnis für den Vorschlag aus der Vertragsfläche
    form: achsenparallel ? 'rechteck' : 'frei',
    ecken,
    ...(achsenparallel ? {} : { seiten: ecken.map(() => null) }),
    angelegtVon: 'excel',
    angelegtAm: jetzt,
  }
  return {
    parzelle,
    hinweis: `Die Form „Grundstück“ aus der Bau-Excel ist als Parzelle übernommen (${achsenparallel ? 'rechteckig' : `${ecken.length} Ecken`}). Die Maße in Metern fehlen noch – im Reiter „Skizze Bau“ oder „Skizze Grün“ eintragen.`,
  }
}
