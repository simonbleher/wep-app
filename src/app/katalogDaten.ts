// Statische Katalog-Daten der Erfassung (werden einmalig beim Modulladen gelesen).
import type { InvasiveListe, Katalog } from '@/katalog'
import katalogRaw from '../../data/katalog.json'
import invasiveRaw from '../../data/invasive.json'

export const KATALOG_POSITIONEN = (katalogRaw as unknown as Katalog).positionen
export const INVASIVE_ARTEN = (invasiveRaw as unknown as InvasiveListe).arten

export type Abschnitt = 'aussenanlagen' | 'aufwuchs'

export const ABSCHNITT_TITEL: Record<Abschnitt, string> = {
  aussenanlagen: 'Außenanlagen',
  aufwuchs: 'Aufwuchs',
}
