// Android- und Windows-App im Server-Modus (Paket 8): Hinweis auf WEPs aus der Zeit vor dem Server. Sie bleiben in
// der v1-Datenbank auf dem Gerät und werden nicht automatisch übernommen. Übernahme in zwei Schritten: hier als
// Sicherung speichern, dann unter Profil → Sicherung einspielen – der nächste Abgleich lädt sie auf den Server.
import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { DB_NAME_V1 } from '@/app/db'
import { ICON, Meldung } from '@/app/ui'
import { speichereDatei, speicherText } from '@/app/dateiSpeichern'
import { erstelleSicherung, sicherungsDateiname } from '@/sicherung'
import { altbestandQuelle, zaehleAltbestand } from '@/sicherung/altbestand'

const AUSGEBLENDET = 'wep-v2-altbestand-ausgeblendet'

function ausgeblendet(): boolean {
  try {
    return localStorage.getItem(AUSGEBLENDET) === '1'
  } catch {
    return false
  }
}

/** `startseite`: einmaliger Hinweis (ausblendbar); sonst die Zeile im Profil, solange es alte WEPs gibt. */
export function Altbestand({ startseite = false }: { startseite?: boolean }) {
  const [anzahl, setAnzahl] = useState(0)
  const [weg, setWeg] = useState(() => startseite && ausgeblendet())
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState('')

  useEffect(() => {
    if (weg) return
    let aktiv = true
    void zaehleAltbestand(DB_NAME_V1).then((n) => aktiv && setAnzahl(n))
    return () => {
      aktiv = false
    }
  }, [weg])

  if (weg || anzahl === 0) return null

  async function speichern() {
    setLaeuft(true)
    setMeldung('')
    try {
      const quelle = await altbestandQuelle(DB_NAME_V1)
      if (!quelle) throw new Error('Die WEPs aus der Zeit vor dem Server sind nicht mehr lesbar.')
      const s = await erstelleSicherung(quelle, { mitFotos: true, mitBauExcel: true, appVersion: __APP_VERSION__ })
      const name = sicherungsDateiname(new Date().toISOString()).replace('WEP-Sicherung', 'WEP-Sicherung-vor-Server')
      setMeldung(speicherText(await speichereDatei(s.blob, name), name))
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Meldung>
      <p>
        Auf diesem Gerät liegen noch {anzahl === 1 ? '1 WEP' : `${anzahl} WEPs`} aus der App ohne Server. Sie bleiben erhalten, werden aber nicht
        automatisch übernommen.
      </p>
      <p>
        Übernehmen: 1. „Als Sicherung speichern“, 2. unter Profil → Sicherung „Sicherung einspielen“ und die Datei wählen. Beim nächsten Abgleich
        kommen die WEPs auf den Server.
      </p>
      <div className="knopf-reihe">
        <button type="button" className="knopf" disabled={laeuft} onClick={() => void speichern()}>
          <Download {...ICON} />
          Als Sicherung speichern
        </button>
        {startseite && (
          <button
            type="button"
            className="knopf"
            onClick={() => {
              try {
                localStorage.setItem(AUSGEBLENDET, '1')
              } catch {
                /* dann kommt der Hinweis beim nächsten Start wieder */
              }
              setWeg(true)
            }}
          >
            <X {...ICON} />
            Ausblenden
          </button>
        )}
      </div>
      {meldung && <p role="status">{meldung}</p>}
    </Meldung>
  )
}
