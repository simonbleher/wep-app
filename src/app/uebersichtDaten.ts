// Zahlen für den Reiter „Übersicht“ und die BV-Kontrollseite: genau die des übersichtlichen PDF (`erzeugeWepProtokoll`),
// also derselbe Excel-Export mit derselben Quelle (Bau-Excel oder leere Vorlage) und derselben Vorbereitung des Bau-Teils.
import { hatBauTeil, type Rolle, type Wep } from '@/model'
import type { Protokoll } from '@/pdf'
import { bauFuerExport } from './bauHelfer'
import { ladeExportQuelle, type ExportQuelle } from './exportQuelle'

export interface ProtokollOptionen {
  profilIndex?: Record<string, number>
  /** Basis-Excel; ohne Angabe wie beim Export dieses Geräts (Bau-Excel am WEP, sonst die Vorlage). */
  quelle?: () => Promise<ExportQuelle>
}

export async function erstelleProtokoll(wep: Wep, rolle: Rolle, opt: ProtokollOptionen = {}): Promise<Protokoll> {
  const quelle = await (opt.quelle ?? (() => ladeExportQuelle(wep, rolle === 'bau')))()
  const wepFuerExport = hatBauTeil(rolle) ? bauFuerExport(wep, opt.profilIndex) : wep
  // Die PDF-Bausteine (Rechenwerk, Mappe) laden erst hier nach
  const { erzeugeWepProtokoll } = await import('@/pdf')
  return erzeugeWepProtokoll({
    wep: wepFuerExport,
    quelle: quelle.buffer,
    hatBauExcel: quelle.hatBauExcel,
    rolle,
    exportOptionen: { profilIndex: opt.profilIndex, formalienAbgeglichen: wep.bauExcel?.abgeglichen === true },
  })
}
