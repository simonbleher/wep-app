// Server-Modus (v2): Admin-Seite „Konten verwalten“ – freigeben, sperren, löschen, Rollen vergeben, offene Sitzungen
// (Browser, Android-App, Windows-App) sehen und alle abmelden.
// Ein Wertermittler ist Bau ODER Grün; BV und Admin kommen zusätzlich dazu. Der Server prüft alles noch einmal.
import { useCallback, useEffect, useId, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { HauptSeitenleiste, ICON, Kopf, Laedt, Meldung, Rueckfrage, zeitDe } from '@/app/ui'
import { aendereKonto, ladeKonten, ladeWarnungen, type KontoAktion } from './api'
import { GERAET_TEXT, ROLLEN_TEXT, STATUS_TEXT, rollenFehler, type ServerKonto, type ServerRolle } from './typen'

interface Props {
  ich: ServerKonto
  onZurueck: () => void
  onProfil: () => void
}

type Wertermittler = '' | 'bau' | 'gruen'

/** Anbieter und bei Microsoft der Tenant – damit ein Konto aus einem fremden Tenant auffällt (Fund M3). */
function anbieterText(k: ServerKonto): string {
  if (k.anbieter === 'google') return 'Google'
  if (!k.tenant) return 'Microsoft'
  return k.tenant === 'persoenlich' ? 'Microsoft (persönliches Konto)' : `Microsoft (Tenant ${k.tenant})`
}

export function KontenVerwalten({ ich, onZurueck, onProfil }: Props) {
  const [konten, setKonten] = useState<ServerKonto[]>()
  const [fehler, setFehler] = useState('')
  const [loeschen, setLoeschen] = useState<ServerKonto>()
  const [warnungen, setWarnungen] = useState<string[]>([])

  const laden = useCallback(async () => {
    setFehler('')
    try {
      setKonten(await ladeKonten())
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void laden()
    ladeWarnungen()
      .then(setWarnungen)
      .catch(() => undefined)
  }, [laden])

  async function aktion(k: ServerKonto, a: KontoAktion) {
    setFehler('')
    try {
      setKonten(await aendereKonto(k.id, a))
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  const zurueck = (
    <button type="button" className="zurueck" onClick={onZurueck}>
      <ChevronLeft {...ICON} />
      Profil
    </button>
  )

  return (
    <div className="rahmen">
      <HauptSeitenleiste aktiv="profil" onProtokolle={onZurueck} onProfil={onProfil} />
      <main className="inhalt">
        <Kopf links={zurueck} titel="Konten" />
        <header className="seitenkopf">
          <h1 className="h1">Konten verwalten</h1>
        </header>
        <p className="neben block">
          Neue Konten entstehen bei der ersten Anmeldung und warten auf Freigabe. Ein Wertermittler ist entweder Bau oder Grün; BV und Admin kommen
          bei Bedarf dazu. Name und eine als „unbestätigt“ markierte Adresse kann jede Person selbst wählen – vor dem Freigeben bitte prüfen, wer
          das Konto ist.
        </p>
        {warnungen.map((w) => (
          <Meldung key={w}>
            <p>{w}</p>
          </Meldung>
        ))}
        {fehler && (
          <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
        )}
        {!konten ? (
          !fehler && <Laedt />
        ) : (
          <ul className="liste konten-liste" aria-label="Konten">
            {konten.map((k) => (
              <KontoZeile key={k.id} konto={k} selbst={k.id === ich.id} onAktion={(a) => void aktion(k, a)} onLoeschen={() => setLoeschen(k)} />
            ))}
          </ul>
        )}
        {loeschen && (
          <Rueckfrage
            titel={`${loeschen.name || loeschen.email} löschen?`}
            text="Das Konto verschwindet und alle Sitzungen enden. Meldet sich die Person wieder an, entsteht ein neues Konto, das auf Freigabe wartet."
            bestaetigen="Löschen"
            onAbbrechen={() => setLoeschen(undefined)}
            onBestaetigen={() => {
              const k = loeschen
              setLoeschen(undefined)
              void aktion(k, { aktion: 'loeschen' })
            }}
          />
        )}
      </main>
    </div>
  )
}

function KontoZeile({ konto, selbst, onAktion, onLoeschen }: { konto: ServerKonto; selbst: boolean; onAktion: (a: KontoAktion) => void; onLoeschen: () => void }) {
  const id = useId()
  const wertermittler: Wertermittler = konto.rollen.includes('bau') ? 'bau' : konto.rollen.includes('gruen') ? 'gruen' : ''
  const zusatz = (r: ServerRolle) => konto.rollen.includes(r)

  function setzeRollen(w: Wertermittler, bv: boolean, admin: boolean) {
    const rollen: ServerRolle[] = [...(w ? [w] : []), ...(bv ? ['bv' as const] : []), ...(admin ? ['admin' as const] : [])]
    if (!rollenFehler(rollen)) onAktion({ aktion: 'rollen', rollen })
  }

  return (
    <li className="konto-zeile">
      <div className="konto-kopf">
        <span className="zeile-titel">
          {konto.name || konto.email}
          {selbst ? ' (du)' : ''}
        </span>
        <span className={`konto-status konto-status-${konto.status}`}>{STATUS_TEXT[konto.status]}</span>
      </div>
      <span className="neben">
        {konto.email}
        {konto.email && konto.emailBestaetigt === false && <strong className="konto-unbestaetigt"> (unbestätigt)</strong>} · {anbieterText(konto)}
        {konto.letzteAnmeldung ? ` · zuletzt angemeldet ${zeitDe(konto.letzteAnmeldung)}` : ''}
      </span>
      {konto.sitzungen && konto.sitzungen.length > 0 && (
        <span className="neben">Angemeldet auf: {konto.sitzungen.map((s) => GERAET_TEXT[s.geraet]).join(', ')}</span>
      )}
      <div className="konto-rollen">
        <label htmlFor={`${id}-wm`}>
          Wertermittler
          <select id={`${id}-wm`} className="eingabe" value={wertermittler} onChange={(e) => setzeRollen(e.target.value as Wertermittler, zusatz('bv'), zusatz('admin'))}>
            <option value="">keiner</option>
            <option value="bau">{ROLLEN_TEXT.bau}</option>
            <option value="gruen">{ROLLEN_TEXT.gruen}</option>
          </select>
        </label>
        <label className="konto-haken">
          <input type="checkbox" checked={zusatz('bv')} onChange={(e) => setzeRollen(wertermittler, e.target.checked, zusatz('admin'))} />
          {ROLLEN_TEXT.bv}
        </label>
        <label className="konto-haken">
          <input type="checkbox" checked={zusatz('admin')} disabled={selbst} onChange={(e) => setzeRollen(wertermittler, zusatz('bv'), e.target.checked)} />
          {ROLLEN_TEXT.admin}
        </label>
      </div>
      {konto.status === 'freigegeben' && konto.rollen.length === 0 && <p className="neben">Noch ohne Rolle: Das Konto kann sich anmelden, aber noch nichts bearbeiten.</p>}
      {!selbst && (
        <div className="knopf-reihe">
          {konto.status !== 'freigegeben' && (
            <button type="button" className="knopf knopf-primaer" onClick={() => onAktion({ aktion: 'freigeben' })}>
              Freigeben
            </button>
          )}
          {konto.status !== 'gesperrt' && (
            <button type="button" className="knopf" onClick={() => onAktion({ aktion: 'sperren' })}>
              Sperren
            </button>
          )}
          {konto.sitzungen && konto.sitzungen.length > 0 && (
            <button type="button" className="knopf" onClick={() => onAktion({ aktion: 'abmelden' })}>
              Überall abmelden
            </button>
          )}
          <button type="button" className="knopf knopf-loeschen" onClick={onLoeschen}>
            Löschen
          </button>
        </div>
      )}
    </li>
  )
}
