// Entwickleroptionen im Profil (Standard beide aus): „Mit Excel arbeiten“ (gespeichert als `ohneExcel`) und
// „PDF-Export anzeigen“ – nur für den Fall, dass die BV-Kontrollseite ausfällt.
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

/** `true`: PDF-Export für Wertermittler eingeblendet (Notfall-Schalter, Standard aus). */
export function usePdfExport(): boolean {
  return useSyncExternalStore(abonniere, () => ladeGeraeteEinstellungen().pdfExport, () => false)
}
