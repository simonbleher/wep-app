// Regelhinweise für eine WEP-Position.
//
// Sammelt alle relevanten Hinweise: Regeltext aus dem Katalog, Invasiv-Warnung,
// Flächen-Limits (Rasen/Wiese, versiegelte Fläche). Hinweise blockieren NIEMALS
// – sie werden dem Wertermittler nur angezeigt (CLAUDE.md: „Nichts sperren,
// nur warnen").

import type { Hinweis, Position, Wep } from '@/model'
// Position und InvasiveArt aus @/katalog, da sie von sucheKatalog/istInvasiv verwendet werden
import type { Position as KatalogPosition, InvasiveArt, Problempflanze } from '@/katalog'
import { findeProblempflanze, istInvasiv } from '@/katalog'
import { alterHinweise } from './baumMass'

/** Ein Regelhinweis ist strukturell identisch mit Hinweis. */
export type Regelhinweis = Hinweis

/** Katalog-IDs, unter denen ein Baum einen Wert hat – dort kein Hinweis „wird entfernt“. */
const BAUM_ERLAUBT_IDS = new Set(['aw-baum-geschuetzt', 'aw-obstgehoelz', 'aw-hecke', 'aw-nadelgehoelz-solitaer'])

/** Katalog-IDs mit einer Flächenbegrenzung auf 100 m² (Rasen, Wiese). */
const RASEN_WIESE_IDS = new Set(['aw-rasen', 'aw-wiese'])

/** Katalog-IDs, für die die Versiegelungsgrenze gilt (Wege- und Platzbelag). */
const VERSIEGELT_IDS = new Set(['aa-wegebelag'])

/**
 * Berechnet alle Regelhinweise für eine Position.
 *
 * Reine Funktion – Katalog- und Invasiv-Daten werden als Parameter übergeben
 * (Dependency Injection für Tests und Offline-Betrieb).
 *
 * @param position        - Die bewertete WEP-Position
 * @param wep             - Das übergeordnete WEP (für Parzellenfläche)
 * @param katalogPositionen - Alle Positionen aus data/katalog.json
 * @param invasiveArten   - Alle invasiven Arten aus data/invasive.json
 * @param problempflanzen - Weitere Problempflanzen aus data/problempflanzen.json
 */
export function berechneRegelhinweise(
  position: Position,
  wep: Wep,
  katalogPositionen: KatalogPosition[],
  invasiveArten: InvasiveArt[],
  problempflanzen: Problempflanze[] = [],
): Regelhinweis[] {
  const hinweise: Regelhinweis[] = []

  // 1. Regeltext aus dem Katalog
  if (position.katalogId) {
    const katalogPos = katalogPositionen.find((p) => p.id === position.katalogId)
    if (katalogPos && katalogPos.regeln) {
      hinweise.push({ schwere: 'info', text: katalogPos.regeln })
    }
  }

  // 2. Invasive Art: Bezeichnung gegen Unionsliste prüfen
  const invasiv = istInvasiv(invasiveArten, position.bezeichnung)
  if (invasiv) {
    const name = invasiv.deutsch || invasiv.wissenschaftlich
    hinweise.push({
      schwere: 'warnung',
      text:
        `„${name}" steht auf der Unionsliste invasiver Arten und ist zu entfernen. ` +
        'Beseitigungskosten in Abschnitt „Beseitigung" eintragen.',
      beseitigung: beseitigungsVorschlag(position, name),
    })
  }

  // 2b. Problempflanze (Richtlinie oder Praxis); eine Art der Unionsliste ist oben schon gemeldet
  const gefunden = invasiv ? null : findeProblempflanze(problempflanzen, position.bezeichnung)
  // Bäume, die als Katalogposition mit eigenem Wert erfasst sind (geschützter Baum, Obst, Hecke, Solitär), bleiben ohne Hinweis
  const problem = gefunden?.regel === 'baum-entfernen' && position.katalogId && BAUM_ERLAUBT_IDS.has(position.katalogId) ? null : gefunden
  if (problem) {
    const name = problem.deutsch.split('/')[0]!.trim()
    // Für „Baum fällen“: die Art, wie sie in der Position steht („Bergahorn“), ohne Zusätze
    const art = position.bezeichnung.split(/[,(]/)[0]!.trim() || name
    const text =
      problem.regel === 'baum-entfernen'
        ? `„${art}" wird entfernt – nicht geschützte Laub- und Nadelbäume haben im Aufwuchs keinen Wert. Bitte als Beseitigung ` +
          'erfassen („Baum fällen“). Ist der Baum nach der Baumschutzverordnung geschützt, „Geschützter Baum“ wählen (1,00 €).'
        : problem.regel === 'nadel-gross'
        ? `„${name}" ist ein Nadelgehölz, das ausgewachsen die Wuchshöhe von 2,5 bzw. 4 m (je Vertragslage) ` +
          'überschreiten kann. Es wird auch klein oder im Jungstadium nicht abgeschätzt und muss entfernt werden ' +
          `(BewRL S. ${problem.quelle.seite ?? 17}). Beseitigungskosten in Abschnitt „Beseitigung" eintragen.`
        : `„${name}" gilt als problematisch (${problem.gruppe}); die Richtlinie nennt die Art nicht. ` +
          'Zur Prüfung: Entfernen und Beseitigungskosten in Abschnitt „Beseitigung" eintragen, falls nötig.'
    const vorschlag = beseitigungsVorschlag(position, name)
    // Bäume: Der Knopf öffnet die Vorlage „Baum fällen“ mit der Art
    if (problem.regel === 'baum-entfernen' || problem.regel === 'nadel-gross') vorschlag.baum = { art }
    hinweise.push({ schwere: 'warnung', text, beseitigung: vorschlag })
  }

  // 2c. Obstgehölze: Alter als Pflichtmaß für den Vorschlag
  hinweise.push(...alterHinweise(position))

  // 3. Rasen / Wiese: max. 100 m²
  if (position.katalogId && RASEN_WIESE_IDS.has(position.katalogId) && position.anzahl > 100) {
    hinweise.push({
      schwere: 'warnung',
      text: `Rasen/Wiese: Nur bis max. 100 m² bewertet (BewRL S. 18). ` +
        `Eingetragen: ${position.anzahl} m².`,
    })
  }

  // 4. Versiegelte Fläche: max. 6 % von (Parzellenfläche − 24 m² Baugrundlage)
  if (position.katalogId && VERSIEGELT_IDS.has(position.katalogId)) {
    const parzelle = wep.formalien.parzellenflaecheM2
    if (parzelle > 24) {
      const erlaubt = (parzelle - 24) * 0.06
      if (position.anzahl > erlaubt) {
        hinweise.push({
          schwere: 'warnung',
          text:
            `Versiegelte Fläche: Max. ${erlaubt.toFixed(1)} m² erlaubt ` +
            `(6 % von ${parzelle - 24} m² Restfläche). ` +
            `Eingetragen: ${position.anzahl} m².`,
        })
      }
    }
  }

  return hinweise
}

/** Vorbelegung für die Beseitigung: Gegenstand, Menge und Einheit der Position (den Preis trägt der Wertermittler ein). */
function beseitigungsVorschlag(position: Position, name: string): NonNullable<Regelhinweis['beseitigung']> {
  return {
    gegenstand: position.bezeichnung.trim() || name,
    einheit: position.einheit,
    menge: position.anzahl,
  }
}
