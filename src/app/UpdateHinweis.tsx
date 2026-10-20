// Unaufdringlicher Hinweis „Update verfügbar“ (nur in der Android-App).
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

type UpdateModul = typeof import('@/android/update')

export function UpdateHinweis() {
  const nativ = Capacitor.isNativePlatform()
  const [modul, setModul] = useState<UpdateModul | null>(null)
  const [verfuegbar, setVerfuegbar] = useState<Awaited<ReturnType<UpdateModul['pruefeAufUpdate']>>['verfuegbar']>(null)

  useEffect(() => {
    if (!nativ) return
    let aktiv = true
    let ab: (() => void) | undefined
    void import('@/android/update').then((m) => {
      if (!aktiv) return
      setModul(m)
      setVerfuegbar(m.aktuellerUpdateStand()?.verfuegbar ?? null)
      ab = m.beobachteUpdate((s) => setVerfuegbar(s?.verfuegbar ?? null))
      void m.pruefeUndMerke(false)
    })
    return () => {
      aktiv = false
      ab?.()
    }
  }, [nativ])

  if (!nativ || !modul || !verfuegbar) return null
  return (
    <div className="update-hinweis" role="status">
      <span>Update verfügbar: Version {verfuegbar.versionName}</span>
      <button type="button" className="knopf" onClick={() => void modul.oeffneReleaseSeite(verfuegbar)}>
        Zur Release-Seite
      </button>
    </div>
  )
}
