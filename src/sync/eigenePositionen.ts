// Abgleich der eigenen Positionen mit daten/eigene-positionen.json.
//
// Eine Datei für alle Geräte, ohne Konflikt-Kopien: Je Eintrag gewinnt die neuere Änderung.
// Gelöschte Einträge stehen als Marke (`geloescht`) in der Datei, damit ein Gerät, das den
// Eintrag noch kennt, ihn nicht wieder anlegt.
import { fuehreZusammen, gleicheEintraege, lokaleEigene, type EigenePosition, type EigeneSpeicher } from '@/katalog'
import { EIGENE_DATEI } from './ordner'
import type { GraphClient } from './types'

export interface EigeneDatei {
  format: 'wep-eigene-positionen/1'
  geaendertAm: string
  geraet: string
  eintraege: EigenePosition[]
}

export type EigeneErgebnis = 'hochgeladen' | 'geladen' | 'beides' | 'unveraendert'

function entpacke(inhalt: string): EigeneDatei {
  const d = JSON.parse(inhalt) as Partial<EigeneDatei>
  if (d.format !== 'wep-eigene-positionen/1' || !Array.isArray(d.eintraege)) {
    throw new Error('Unbekanntes Format der eigenen Positionen')
  }
  return d as EigeneDatei
}

/** `client` ist der Client für den Ordner daten/. */
export async function synchronisiereEigenePositionen(opt: {
  client: GraphClient
  speicher?: EigeneSpeicher
  geraet: string
  jetzt?: () => string
}): Promise<EigeneErgebnis> {
  const speicher = opt.speicher ?? lokaleEigene
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const stand = speicher.lade()
  const remote = (await opt.client.liste()).find((d) => d.name === EIGENE_DATEI)

  const remoteGeaendert = remote !== undefined && remote.eTag !== stand.remoteETag
  if (!remoteGeaendert && !stand.wartet && (remote || stand.eintraege.length === 0)) return 'unveraendert'

  // Zusammenführen, sobald die Datei sich geändert hat – so heilt sich auch ein Überschreiben
  // durch ein anderes Gerät beim nächsten Abgleich.
  const fremd = remote && remoteGeaendert ? entpacke(await opt.client.lade(EIGENE_DATEI)).eintraege : undefined
  const zusammen = fremd ? fuehreZusammen(stand.eintraege, fremd) : stand.eintraege

  const lokalNeu = !gleicheEintraege(zusammen, stand.eintraege)
  const hochladen = !remote || !!stand.wartet || (fremd !== undefined && !gleicheEintraege(zusammen, fremd))

  let eTag = remote?.eTag
  if (hochladen) {
    const datei: EigeneDatei = {
      format: 'wep-eigene-positionen/1',
      geaendertAm: jetzt(),
      geraet: opt.geraet,
      eintraege: zusammen,
    }
    eTag = (await opt.client.schreibe(EIGENE_DATEI, JSON.stringify(datei, null, 2))).eTag
  }
  speicher.speichere({ eintraege: zusammen, remoteETag: eTag, letzterSyncAm: jetzt() })

  return hochladen && lokalNeu ? 'beides' : hochladen ? 'hochgeladen' : lokalNeu ? 'geladen' : 'unveraendert'
}
