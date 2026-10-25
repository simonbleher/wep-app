// Vorgangs-Nr.: vergibt der BV, wird immer eingetragen (die App zählt nicht mehr selbst hoch). Fehlt sie, warnt die App
// überall, sperrt aber nichts („Nummer noch nicht bekannt“ auf der Parzelle ohne Netz). Gibt es sie auf diesem Gerät
// schon, steht ein Hinweis da.
import { useEffect, useId, useState } from 'react'
import { gleicheVorgangsNr, vorgangsNrVon, type Wep } from '@/model'
import { alleWeps } from './db'
import { Dialog, Meldung } from './ui'

/** WEPs auf diesem Gerät (für den Hinweis „gibt es schon“); lädt einmal. */
function useAlleWeps(): Wep[] {
  const [weps, setWeps] = useState<Wep[]>([])
  useEffect(() => {
    let aktiv = true
    void alleWeps()
      .then((w) => aktiv && setWeps(w))
      .catch(() => undefined)
    return () => {
      aktiv = false
    }
  }, [])
  return weps
}

/** Hinweis, wenn die Nummer schon bei einem anderen WEP steht. */
export function doppeltText(nr: string, weps: readonly Wep[], ausser?: string): string | undefined {
  const andere = gleicheVorgangsNr(nr, weps, ausser)
  if (!andere.length) return undefined
  const w = andere[0]
  const was = [w.formalien.kleingartenanlage.trim(), w.formalien.parzelle.trim() && `Parzelle ${w.formalien.parzelle.trim()}`].filter(Boolean).join(', ')
  return `Die Vorgangs-Nr. ${nr.trim()} gibt es auf diesem Gerät schon${was ? ` (${was})` : ''}${andere.length > 1 ? ` und noch ${andere.length - 1}-mal` : ''}. Bitte prüfen.`
}

/** Feld in den Formalien: mit Hinweis „fehlt“ und „gibt es schon“. */
export function VorgangsNrFeld({ wep, onChange }: { wep: Wep; onChange: (v: string) => void }) {
  const id = useId()
  const weps = useAlleWeps()
  const wert = wep.formalien.vorgangsNr ?? ''
  const fehlt = !vorgangsNrVon(wep)
  const doppelt = doppeltText(wert, weps, wep.id)
  return (
    <div className="feld">
      <label className="label" htmlFor={id}>
        Vorgangs-Nr. (vom BV)
      </label>
      <input id={id} className="eingabe" value={wert} onChange={(e) => onChange(e.target.value)} aria-describedby={fehlt || doppelt ? `${id}-hinweis` : undefined} />
      {(fehlt || doppelt) && (
        <div id={`${id}-hinweis`}>
          <Meldung>
            <p>{fehlt ? 'Die Vorgangs-Nr. fehlt noch. Bitte die Nummer vom BV eintragen, bevor das Protokoll abgegeben wird.' : doppelt}</p>
          </Meldung>
        </div>
      )}
    </div>
  )
}

/** „Neues WEP“: fragt zuerst nach der Vorgangs-Nr.; „Nummer noch nicht bekannt“ legt das WEP ohne an (mit Hinweis). */
export function NeuesWepDialog({ onAnlegen, onAbbrechen }: { onAnlegen: (vorgangsNr: string) => void; onAbbrechen: () => void }) {
  const id = useId()
  const weps = useAlleWeps()
  const [nr, setNr] = useState('')
  const doppelt = doppeltText(nr, weps)
  return (
    <Dialog titel="Neues WEP" onSchliessen={onAbbrechen}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (nr.trim()) onAnlegen(nr.trim())
        }}
      >
        <div className="feld">
          <label className="label" htmlFor={id}>
            Vorgangs-Nr. (vom BV)
          </label>
          <input id={id} className="eingabe" value={nr} autoFocus onChange={(e) => setNr(e.target.value)} placeholder="z. B. 2026-152" />
        </div>
        {doppelt && (
          <Meldung>
            <p>{doppelt}</p>
          </Meldung>
        )}
        <p className="neben">Ist die Nummer noch nicht bekannt, kann sie später unter „Formalien“ eingetragen werden. Bis dahin weist die App darauf hin.</p>
        <div className="dialog-knoepfe">
          <button type="button" className="knopf" onClick={() => onAnlegen('')}>
            Nummer noch nicht bekannt
          </button>
          <button type="submit" className="knopf knopf-primaer" disabled={!nr.trim()}>
            Anlegen
          </button>
        </div>
      </form>
    </Dialog>
  )
}
