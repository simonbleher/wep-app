// WEP-Menü „⋯“ → „Teilen“: erzeugt die .wep-Datei (Beta 5, Paket 2). Vorher: Schalter für Fotos und
// Bau-Excel (mit Größe) und der Hinweis, dass die Datei Personendaten enthält.
import { useState } from 'react'
import { Save, Share2 } from 'lucide-react'
import type { Wep } from '@/model'
import { lokalerStand } from '@/sicherung'
import { anhangGroessen, erstelleTeilen, groesseText, teilenDateiname } from '@/teilen'
import { Dialog, Meldung } from './ui'
import { useOhneExcel } from './ohneExcel'
import { kannTeilen, speichereDatei, speicherText, teileDatei } from './dateiSpeichern'

export function TeilenDialog({ wep, appVersion, onSchliessen }: { wep: Wep; appVersion: string; onSchliessen: () => void }) {
  const g = anhangGroessen(wep)
  const [mitFotos, setMitFotos] = useState(false)
  const [mitBau, setMitBau] = useState(false)
  const ohneExcel = useOhneExcel()
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<{ text: string; alarm?: boolean }>()
  const hatFotos = g.fotoAnzahl > 0
  const hatBau = !!wep.bauExcel

  async function los(weg: 'teilen' | 'speichern') {
    setLaeuft(true)
    setMeldung(undefined)
    try {
      const d = await erstelleTeilen(lokalerStand, wep.id, { mitFotos: mitFotos && hatFotos, mitBauExcel: mitBau && hatBau, appVersion })
      const fehlt = d.fotosOhneDatei + (d.bauExcelOhneDatei ? 1 : 0)
      const zusatz = fehlt
        ? ` ${fehlt === 1 ? 'Eine Datei fehlt' : `${fehlt} Dateien fehlen`} auf diesem Gerät (nur in OneDrive) und ${fehlt === 1 ? 'ist' : 'sind'} nicht enthalten.`
        : ''
      if (weg === 'teilen') {
        const e = await teileDatei(d.blob, d.dateiname)
        setMeldung({ text: e === 'geteilt' ? `${d.dateiname} wurde an das Teilen-Menü übergeben.${zusatz}` : 'Es wurde nichts geteilt (abgebrochen).' })
      } else {
        const e = await speichereDatei(d.blob, d.dateiname)
        setMeldung({ text: `${speicherText(e, d.dateiname)}.${zusatz}` })
      }
    } catch (e) {
      setMeldung({ text: `Das Teilen ist fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, alarm: true })
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Dialog titel="WEP teilen" onSchliessen={onSchliessen}>
      <p>
        Erzeugt die Datei <strong>{teilenDateiname(wep)}</strong> mit diesem WEP. Wer die App hat, kann sie öffnen und sich zeigen lassen, was neu ist.
      </p>
      <div>
        <label className="schalter-zeile" htmlFor="teilen-fotos">
          <span>
            Fotos mitschicken
            <span className="neben" style={{ display: 'block' }}>
              {hatFotos ? `${g.fotoAnzahl} ${g.fotoAnzahl === 1 ? 'Foto' : 'Fotos'}, ca. ${groesseText(g.fotos)}` : 'Dieses WEP hat keine Fotos'}
            </span>
          </span>
          <input id="teilen-fotos" type="checkbox" role="switch" className="schalter" checked={mitFotos && hatFotos} disabled={!hatFotos} onChange={(e) => setMitFotos(e.target.checked)} />
        </label>
        {!ohneExcel && (
        <label className="schalter-zeile" htmlFor="teilen-bau">
          <span>
            Bau-Excel mitschicken
            <span className="neben" style={{ display: 'block' }}>
              {hatBau ? `${wep.bauExcel?.name}, ca. ${groesseText(g.bauExcel)}` : 'Zu diesem WEP gehört keine Bau-Excel'}
            </span>
          </span>
          <input id="teilen-bau" type="checkbox" role="switch" className="schalter" checked={mitBau && hatBau} disabled={!hatBau} onChange={(e) => setMitBau(e.target.checked)} />
        </label>
        )}
      </div>
      <Meldung>
        <p>Die Datei enthält Personendaten (Unterpächter, Anlage, Parzelle). Gib sie nur an Personen weiter, die das WEP bearbeiten oder prüfen dürfen.</p>
      </Meldung>
      {meldung &&
        (meldung.alarm ? (
          <Meldung alarm>
            <p>{meldung.text}</p>
          </Meldung>
        ) : (
          <p className="neben" role="status">
            {meldung.text}
          </p>
        ))}
      <div className="dialog-knoepfe">
        <button type="button" className="knopf" onClick={onSchliessen}>
          Schließen
        </button>
        <button type="button" className="knopf" disabled={laeuft} onClick={() => void los('speichern')}>
          <Save size={20} aria-hidden="true" />
          Speichern unter …
        </button>
        {kannTeilen() && (
          <button type="button" className="knopf knopf-primaer" disabled={laeuft} onClick={() => void los('teilen')}>
            <Share2 size={20} aria-hidden="true" />
            Teilen …
          </button>
        )}
      </div>
    </Dialog>
  )
}
