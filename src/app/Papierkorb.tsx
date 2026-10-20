// Papierkorb (Beta 3, Paket 2): gelöschte WEPs, 30 Tage lang. Wiederherstellen holt ein WEP auf
// allen Geräten zurück; „Endgültig löschen“ (mit Rückfrage) entfernt es überall. Was länger als
// 30 Tage hier liegt, wird beim Öffnen und bei jedem Abgleich endgültig gelöscht.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, RotateCcw, Trash2 } from 'lucide-react'
import type { Konto } from '@/konto'
import {
  PAPIERKORB_TAGE,
  ladePapierkorb,
  loescheEndgueltig,
  raeumePapierkorbAuf,
  stelleWiederHer,
  verbleibendeTage,
} from '@/sync/aktionen'
import type { PapierkorbEintrag } from '@/sync/types'
import { wepTitel } from './Startseite'
import { StatusZeile, useAbgleich } from './SyncLeiste'
import { HauptSeitenleiste, ICON, Kopf, Laedt, LeerZustand, Meldung, Rueckfrage, zeitDe } from './ui'

interface Props {
  konto: Konto | null
  verfuegbar: boolean
  onZurueck: () => void
  onProfil: () => void
  /** Öffnet ein wiederhergestelltes WEP. */
  onOeffnen: (wepId: string) => void
}

function restText(tage: number): string {
  if (tage <= 0) return 'wird beim nächsten Abgleich endgültig gelöscht'
  return tage === 1 ? 'noch 1 Tag' : `noch ${tage} Tage`
}

export function Papierkorb({ konto, verfuegbar, onZurueck, onProfil, onOeffnen }: Props) {
  const [eintraege, setEintraege] = useState<PapierkorbEintrag[]>([])
  const [geladen, setGeladen] = useState(false)
  const [frage, setFrage] = useState<PapierkorbEintrag | null>(null)
  const [meldung, setMeldung] = useState('')

  const neuLaden = useCallback(() => {
    void raeumePapierkorbAuf()
      .then(() => ladePapierkorb())
      .then((liste) => {
        setEintraege(liste)
        setGeladen(true)
      })
  }, [])

  useEffect(neuLaden, [neuLaden])
  const abgleich = useAbgleich(konto, neuLaden)
  const status = <StatusZeile konto={konto} verfuegbar={verfuegbar} abgleich={abgleich} />

  async function wiederherstellen(e: PapierkorbEintrag) {
    const r = await stelleWiederHer(e.id)
    neuLaden()
    if (!r) return
    if (r.neueNummer) {
      setMeldung(`Die Nummer ${e.id} ist inzwischen vergeben. Das WEP ist jetzt unter ${r.id} wiederhergestellt; das Original bleibt im Papierkorb.`)
    } else {
      onOeffnen(r.id)
    }
  }

  async function endgueltig(e: PapierkorbEintrag) {
    setFrage(null)
    await loescheEndgueltig(e.id)
    neuLaden()
  }

  const zurueck = (
    <button type="button" className="zurueck" onClick={onZurueck}>
      <ChevronLeft {...ICON} />
      Protokolle
    </button>
  )
  const jetzt = new Date().toISOString()

  return (
    <div className="rahmen">
      <HauptSeitenleiste
        aktiv="papierkorb"
        onProtokolle={onZurueck}
        onPapierkorb={() => undefined}
        onProfil={onProfil}
        fuss={verfuegbar ? status : undefined}
      />

      <main className="inhalt">
        <Kopf links={zurueck} titel="Papierkorb" />
        <header className="seitenkopf nur-tablet">
          <h1 className="h1">Papierkorb</h1>
        </header>

        <div className="nur-handy block">{status}</div>

        <p className="neben block">
          Gelöschte Protokolle bleiben {PAPIERKORB_TAGE} Tage hier und können wiederhergestellt werden. Danach werden sie endgültig
          gelöscht{konto ? ' – auf allen deinen Geräten' : ''}.
        </p>

        {meldung && (
          <Meldung>
            <p>{meldung}</p>
          </Meldung>
        )}

        {!geladen ? (
          <Laedt />
        ) : eintraege.length === 0 ? (
          <LeerZustand icon={Trash2} titel="Der Papierkorb ist leer" text="Gelöschte Protokolle erscheinen hier." />
        ) : (
          <ul className="liste" aria-label="Papierkorb">
            {eintraege.map((e) => {
              const titel = wepTitel(e.wep)
              return (
                <li key={e.id} className="papierkorb-zeile">
                  <span className="zeile-text">
                    <span className={titel ? 'zeile-titel' : 'zeile-titel leer'}>{titel || 'ohne Bezeichnung'}</span>
                    <span className="neben">
                      {e.id} · gelöscht {zeitDe(e.geloeschtAm)} · {restText(verbleibendeTage(e.geloeschtAm, jetzt))}
                    </span>
                  </span>
                  <span className="knopf-reihe">
                    <button type="button" className="knopf" onClick={() => void wiederherstellen(e)}>
                      <RotateCcw {...ICON} />
                      Wiederherstellen
                    </button>
                    <button type="button" className="knopf knopf-loeschen" onClick={() => setFrage(e)}>
                      <Trash2 {...ICON} />
                      Endgültig löschen
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {frage && (
        <Rueckfrage
          titel={`WEP ${frage.id} endgültig löschen?`}
          text={`${wepTitel(frage.wep) ? `„${wepTitel(frage.wep)}“ wird` : 'Das Protokoll wird'} unwiderruflich gelöscht${konto ? ', auch in OneDrive und auf deinen anderen Geräten' : ''}. Das lässt sich nicht rückgängig machen.`}
          bestaetigen="Endgültig löschen"
          onAbbrechen={() => setFrage(null)}
          onBestaetigen={() => void endgueltig(frage)}
        />
      )}
    </div>
  )
}
