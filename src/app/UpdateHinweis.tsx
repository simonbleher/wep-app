// Unaufdringliche Update-Anzeigen (nur in der Android-App):
// - UpdateHinweis: „Neue App-Version – jetzt installieren“, wenn der native Teil neu ist.
//   Tippen lädt die APK in der App und öffnet den Android-Installer.
// - UpdateStandZeilen (Profil): laufende Version/Commit, Stand der letzten Prüfung.
// Live-Updates des Web-Teils laufen still im Hintergrund und brauchen keinen Hinweis.
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { kurzCommit, type VersionInfo } from '@/android/update'

type DienstModul = typeof import('@/android/updateDienst')
type Stand = ReturnType<DienstModul['aktuellerUpdateStand']>

function useUpdateStand(): { dienst: DienstModul | null; stand: Stand } {
  const nativ = Capacitor.isNativePlatform()
  const [dienst, setDienst] = useState<DienstModul | null>(null)
  const [stand, setStand] = useState<Stand>(null)

  useEffect(() => {
    if (!nativ) return
    let aktiv = true
    let ab: (() => void) | undefined
    void import('@/android/updateDienst').then((m) => {
      if (!aktiv) return
      setDienst(m)
      setStand(m.aktuellerUpdateStand())
      ab = m.beobachteUpdate(setStand)
      void m.pruefeUndMerke(false)
    })
    return () => {
      aktiv = false
      ab?.()
    }
  }, [nativ])

  return { dienst, stand }
}

export function UpdateHinweis() {
  const { dienst, stand } = useUpdateStand()
  const [laeuft, setLaeuft] = useState(false)
  const [prozent, setProzent] = useState<number | null>(null)
  const [fehler, setFehler] = useState('')

  if (!dienst || stand?.art !== 'nativ') return null

  async function installieren() {
    if (!dienst) return
    setLaeuft(true)
    setFehler('')
    setProzent(0)
    try {
      await dienst.installiereNativ((f) => setProzent(f.gesamt > 0 ? Math.round((f.geladen / f.gesamt) * 100) : null))
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
      setProzent(null)
    }
  }

  return (
    <>
      <div className="update-hinweis" role="status">
        <span>
          {laeuft ? (prozent === null ? 'Wird geladen …' : `Wird geladen … ${prozent} %`) : 'Neue App-Version'}
        </span>
        <button type="button" className="knopf" disabled={laeuft} onClick={() => void installieren()}>
          Jetzt installieren
        </button>
      </div>
      {fehler && (
        <p className="update-fehler" role="alert">
          {fehler}
        </p>
      )}
    </>
  )
}

function zeitText(iso: string): string {
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

/** Zeilen für „Über die App“: Web-Teil (Commit), App-Hülle, Stand der letzten Prüfung. */
export function UpdateStandZeilen() {
  const { dienst, stand } = useUpdateStand()
  const [web, setWeb] = useState<VersionInfo | null>(null)
  const [huelle, setHuelle] = useState<number | null>(null)

  useEffect(() => {
    if (!dienst) return
    let aktiv = true
    void dienst.installierteVersion().then((v) => aktiv && setWeb(v)).catch(() => undefined)
    void dienst.nativeVersion().then((n) => aktiv && setHuelle(n)).catch(() => undefined)
    return () => {
      aktiv = false
    }
  }, [dienst])

  return (
    <>
      <div>
        <dt>Stand der App</dt>
        <dd>
          {web ? `Commit ${kurzCommit(web.commit)}${web.gebautAm ? `, gebaut ${zeitText(web.gebautAm)}` : ''}` : '–'}
          {huelle !== null ? ` · App-Teil ${huelle}` : ''}
        </dd>
      </div>
      <div>
        <dt>Letzte Prüfung</dt>
        <dd>{stand ? `${zeitText(stand.zeit)} – ${stand.meldung}` : 'noch nicht geprüft'}</dd>
      </div>
    </>
  )
}
