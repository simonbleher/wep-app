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

/**
 * Stand nach dem Speichern: bei 'alles' der Stand der App, bei 'bau'/'gruen' der Stand des Servers mit dem eigenen
 * Teil aus der App. Felder, die nur der Server setzt (`ablauf`), kommen nie aus der App.
 */
export function mitEigenemTeil(server: Wep | undefined, app: Wep, recht: Exclude<Schreibrecht, null>): Wep {
  const a = ohneServerFelder(app)
  if (recht === 'alles' || !server) return a
  const s = ohneServerFelder(server)
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
