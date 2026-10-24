// Einstellung „Ohne Excel arbeiten“ (Profil → Dieses Gerät, Standard: an): blendet alle Excel-Funktionen aus.
import { useSyncExternalStore } from 'react'
import { GERAET_GEAENDERT, ladeGeraeteEinstellungen } from '@/profil'

function abonniere(fn: () => void): () => void {
  window.addEventListener(GERAET_GEAENDERT, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(GERAET_GEAENDERT, fn)
    window.removeEventListener('storage', fn)
  }
}

/** `true`: Excel-Funktionen sind ausgeblendet (Standard). */
export function useOhneExcel(): boolean {
  return useSyncExternalStore(abonniere, () => ladeGeraeteEinstellungen().ohneExcel, () => true)
}
