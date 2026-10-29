// Server-Modus (v2): Was Bau bzw. Grün an einem WEP ändert, wird in den Stand des Servers eingefügt – jeder nur in
// seinem Teil (docs/PLAN-V2.md). Reine Logik ohne Abhängigkeiten (Server und Tests nutzen dieselbe Datei).
//
// Grün-Teil: `gruen` (Außenanlagen, Aufwuchs, Beseitigung AA/Aufwuchs, Beschreibungen), `skizze` (Grün-Skizze),
// die Unterschrift für Grün und die Fotos an Grün-Positionen. Alles andere (Formalien, Bau-Teil, Parzelle, Grundriss,
// Bau-Excel …) gehört zum Bau-Teil. Fotos ohne Position gehören zum Bau-Teil; Grün darf neue hinzufügen.
import type { Foto, Wep } from '../model/types'
import type { Schreibrecht } from './rechte'

function gruenPositionen(...weps: (Wep | undefined)[]): Set<string> {
  const ids = new Set<string>()
  for (const w of weps) {
    if (!w?.gruen) continue
    for (const p of [...(w.gruen.aussenanlagen ?? []), ...(w.gruen.aufwuchs ?? []), ...(w.gruen.beseitigungAA ?? [])]) ids.add(p.id)
  }
  return ids
}

/** Fotos: der eigene Teil kommt von der App, der andere bleibt wie auf dem Server. */
function fotosZusammen(server: Wep, app: Wep, teil: 'bau' | 'gruen'): Foto[] | undefined {
  const gruenIds = gruenPositionen(server, app)
  const istGruen = (f: Foto) => Boolean(f.positionId && gruenIds.has(f.positionId))
  const serverFotos = server.fotos ?? []
  const appFotos = app.fotos ?? []
  const aufServer = new Set(serverFotos.map((f) => f.id))
  const eigene = (f: Foto) => (teil === 'gruen' ? istGruen(f) : !istGruen(f))
  // Behalten: was nicht zum eigenen Teil gehört (vom Server). Dazu: eigene Fotos aus der App; Grün darf zusätzlich neue
  // Fotos ohne Position hinzufügen (vorhandene ohne Position gehören zum Bau-Teil).
  const ergebnis = [
    ...serverFotos.filter((f) => !eigene(f)),
    ...appFotos.filter((f) => eigene(f) || (teil === 'gruen' && !f.positionId && !aufServer.has(f.id))),
  ]
  return ergebnis.length || server.fotos || app.fotos ? ergebnis : undefined
}

function unterschriften(server: Wep, app: Wep, teil: 'bau' | 'gruen'): Wep['unterschriften'] {
  const quelleGruen = teil === 'gruen' ? app : server
  const quelleBau = teil === 'gruen' ? server : app
  const u = { bau: quelleBau.unterschriften?.bau, gruen: quelleGruen.unterschriften?.gruen }
  const sauber = Object.fromEntries(Object.entries(u).filter(([, v]) => v)) as Wep['unterschriften']
  return sauber && Object.keys(sauber).length ? sauber : undefined
}

/** Ohne die Felder, die nur der Server setzt. */
export function ohneServerFelder(wep: Wep): Wep {
  const { ablauf: _ablauf, ...rest } = wep
  return rest
}

/** Felder des Bau-Teils (ohne Fotos und Unterschrift): Grün im eigenen Grün-WEP schreibt sie nicht. */
const BAU_FELDER = ['bau', 'grundriss', 'bauExcel'] as const

/** Eigenes Grün-WEP: alles aus der App außer dem Bau-Teil (der bleibt, wie er auf dem Server ist). */
function ohneBauTeil(server: Wep, app: Wep): Wep {
  const ergebnis: Wep = { ...app }
  const ziel = ergebnis as unknown as Record<string, unknown>
  for (const f of BAU_FELDER) {
    if (server[f] !== undefined) ziel[f] = server[f]
    else delete ziel[f]
  }
  const u = { bau: server.unterschriften?.bau, gruen: app.unterschriften?.gruen }
  const sauber = Object.fromEntries(Object.entries(u).filter(([, v]) => v)) as Wep['unterschriften']
  if (sauber && Object.keys(sauber).length) ergebnis.unterschriften = sauber
  else delete ergebnis.unterschriften
  return ergebnis
}

/**
 * Stand nach dem Speichern: bei 'alles' der Stand der App, bei 'bau'/'gruen' der Stand des Servers mit dem eigenen
 * Teil aus der App, bei 'ohne_bau' (eigenes Grün-WEP) alles aus der App außer dem Bau-Teil. Felder, die nur der Server
 * setzt (`ablauf`), kommen nie aus der App.
 */
export function mitEigenemTeil(server: Wep | undefined, app: Wep, recht: Exclude<Schreibrecht, null>): Wep {
  const a = ohneServerFelder(app)
  if (recht === 'alles' || !server) return a
  const s = ohneServerFelder(server)
  if (recht === 'ohne_bau') return ohneBauTeil(s, a)
  const ergebnis: Wep =
    recht === 'gruen'
      ? { ...s, gruen: a.gruen, skizze: a.skizze }
      : { ...a, gruen: s.gruen, skizze: s.skizze }
  const fotos = fotosZusammen(s, a, recht)
  const u = unterschriften(s, a, recht)
  if (fotos) ergebnis.fotos = fotos
  else delete ergebnis.fotos
  if (u) ergebnis.unterschriften = u
  else delete ergebnis.unterschriften
  if (!ergebnis.skizze) delete ergebnis.skizze
  return ergebnis
}

/**
 * Zusammenführen auf dem Server (eigenes Grün-WEP → abgegebenes Bau-WEP): Der Bau-Teil bleibt, wie er auf dem Server
 * steht; den Grün-Teil (Positionen, Grün-Skizze, Unterschrift Grün, Fotos zum Grün-Teil und neue Fotos) hat die App aus
 * dem eigenen WEP übernommen. Stammdaten gelten vom Bau-WEP – nur die Felder in `felder` (von Grün gewählt) kommen aus
 * dem eigenen WEP, und zwar mit dem Wert, den der Server dort kennt. Die Parzelle (Form) kommt vom Bau-WEP; hat es keine,
 * die aus dem Grün-WEP.
 */
export function zusammenfuehrungAufServer(bau: Wep, gruen: Wep, app: Wep, felder: readonly string[]): Wep {
  const neu = mitEigenemTeil(bau, app, 'gruen')
  const formalien = { ...neu.formalien } as unknown as Record<string, unknown>
  const quelle = gruen.formalien as unknown as Record<string, unknown>
  for (const f of felder) if (Object.prototype.hasOwnProperty.call(formalien, f) && quelle[f] !== undefined) formalien[f] = quelle[f]
  // Hat das Bau-WEP keine Parzelle (Form), gilt die aus dem Grün-WEP (Wert vom Server); sonst die von Bau
  const parzelle = bau.parzelle ?? gruen.parzelle
  return { ...neu, formalien: formalien as unknown as Wep['formalien'], ...(parzelle ? { parzelle } : {}) }
}
