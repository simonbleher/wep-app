// Rolle und Export-Quelle eines eingegangenen WEP – wie auf dem Gerät des Wertermittlers, damit Übersicht und PDF der
// Kontrollseite dieselben Zahlen zeigen: die mitgeschickte Bau-Excel (außer bei reinen Bau-WEPs), sonst die leere Vorlage.
import { wepRolle, type Rolle } from '@/model'
import { exportRolle } from '@/export/ohneBau'
import type { ExportQuelle } from '@/app/exportQuelle'
import type { BvEingang } from './eingang'
import { ladeBauExcel } from './speicher'

export function bvRolle(e: BvEingang): Rolle {
  return exportRolle(e.wep, wepRolle(e.wep))
}

export function bvQuelle(e: BvEingang): () => Promise<ExportQuelle> {
  return async () => {
    if (e.hatBauExcel && bvRolle(e) !== 'bau') {
      const bau = await ladeBauExcel(e.id)
      if (bau) return { buffer: await bau.arrayBuffer(), hatBauExcel: true }
    }
    const resp = await fetch('/WEP_Vorlage.xlsx')
    if (!resp.ok) throw new Error(`Vorlage nicht gefunden: ${resp.statusText}`)
    return { buffer: await resp.arrayBuffer(), hatBauExcel: false }
  }
}
