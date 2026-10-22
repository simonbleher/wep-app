// Bauklasse-Assistent: Material + Wanddicke → Bauklasse I.1–IV.3 und NHK 2015 (Richtlinie S. 4–5).
// Der Assistent macht nur einen Vorschlag; der Wertermittler kann den Typ in der Vorlage jederzeit selbst wählen.
import type { Bauteil, BauMaterial } from '../model'
import { NHK_TABELLE, type NhkEintrag } from './tabellen'

export const MATERIALIEN: { id: BauMaterial; text: string; hilfe: string }[] = [
  { id: 'stein', text: 'Stein', hilfe: 'Stein oder ähnliches Material (Bauklasse I und II)' },
  { id: 'holz-doppelwandig', text: 'Holz doppelwandig', hilfe: 'Ständer- oder Rahmenbau, beidseitig beplankt (Bauklasse III und IV)' },
  { id: 'blockhaus', text: 'Blockhaus', hilfe: 'Massive Holzbohlen (Bauklasse III und IV)' },
  { id: 'holz-einwandig', text: 'Holz einwandig', hilfe: 'Einfache Bretterwand (Bauklasse IV)' },
  { id: 'blech', text: 'Blech (Schuppen)', hilfe: 'Blechschuppen werden der Bauklasse IV zugeordnet (Richtlinie S. 19)' },
]

const holzEintrag = (typ: string) => NHK_TABELLE.find((e) => e.typ === typ)

/** Bis zu welcher Dicke (cm) gilt der Eintrag? Dickenangaben werden auf zwei Stellen gerundet. */
function liegtIn(e: NhkEintrag, dicke: number): boolean {
  const d = Math.round(dicke * 100) / 100
  return d >= e.von - 1e-9 && (e.bis === null || d <= e.bis + 1e-9)
}

/**
 * Sonderfälle bei der Zuordnung (für Hinweise in der Oberfläche):
 * - `luecke`: die Dicke passt in keine Zeile der Tabelle (z. B. Stein unter 10 cm)
 * - `einwandigUeber10`: einwandiges Holz über 10 cm kennt die Richtlinie nicht (Bauklasse III nur doppelwandig)
 */
export interface AssistentErgebnis extends NhkEintrag {
  grund: string
  hinweis?: string
}

/**
 * Bauklasse aus Angaben am Bauteil. `undefined` = keine Zuordnung möglich (Material oder Dicke fehlt, Dicke außerhalb
 * der Tabelle); der Export schreibt dann „fehlt“.
 */
export function bauklasseAusAngaben(b: Pick<Bauteil, 'material' | 'wanddickeCm' | 'typenlaube' | 'art'>): AssistentErgebnis | undefined {
  const iv1 = holzEintrag('Doppelwand bis 4,00 cm')!
  if (b.typenlaube) {
    return { ...iv1, grund: 'Typenlaube GL 10 bis GL 19 bzw. einfache Holzlaube bis 4 cm: immer Bauklasse IV.1 (Richtlinie S. 5, Fußnote)' }
  }
  if (b.material === 'blech') {
    return { ...holzEintrag('Doppelwand bis 4,00 cm')!, grund: 'Blechschuppen: Bauklasse IV (Richtlinie S. 19), hier IV.1', hinweis: 'Blechschuppen: bitte Stufe prüfen' }
  }
  const d = b.wanddickeCm
  if (!b.material || d === undefined || !(d > 0)) return undefined

  if (b.material === 'stein') {
    const e = NHK_TABELLE.filter((x) => x.material === 'stein').find((x) => liegtIn(x, d))
    return e ? { ...e, grund: `Stein, Wanddicke ${fmt(d)} cm → Bauklasse ${e.bauklasse} (Richtlinie S. 5)` } : undefined
  }
  if (b.material === 'blockhaus') {
    const e = NHK_TABELLE.filter((x) => x.material === 'blockhaus').find((x) => liegtIn(x, d))
    // 5,00 bis 5,99 cm: „ab 5,00 cm“ der Bauklasse IV; zwischen 4,99 und 5,00 liegt nichts
    return e ? { ...e, grund: `Blockhaus, Holzdicke ${fmt(d)} cm → Bauklasse ${e.bauklasse} (Richtlinie S. 5)` } : undefined
  }
  // Holz doppelt- oder einwandig
  const e = NHK_TABELLE.filter((x) => x.material === 'holz').find((x) => liegtIn(x, d))
  if (!e) return undefined
  if (b.material === 'holz-einwandig' && e.bauklasse.startsWith('III')) {
    const iv3 = holzEintrag('Doppelwand 8,01 - 10,00 cm')!
    return {
      ...iv3,
      grund: `Holz einwandig, ${fmt(d)} cm: Bauklasse III gibt es nur für doppelwandiges Holz, daher IV.3 (Richtlinie S. 4)`,
      hinweis: 'Einwandig über 10 cm kennt die Richtlinie nicht – bitte prüfen (Blockhaus?).',
    }
  }
  return { ...e, grund: `Holz ${b.material === 'holz-einwandig' ? 'einwandig' : 'doppelwandig'}, Wanddicke ${fmt(d)} cm → Bauklasse ${e.bauklasse} (Richtlinie S. 5)` }
}

function fmt(n: number): string {
  return String(n).replace('.', ',')
}

/** Warum der Assistent nichts vorschlagen kann (für die Oberfläche). */
export function assistentLuecke(b: Pick<Bauteil, 'material' | 'wanddickeCm' | 'typenlaube' | 'art'>): string | undefined {
  if (bauklasseAusAngaben(b)) return undefined
  if (!b.material) return 'Material wählen.'
  if (b.wanddickeCm === undefined || !(b.wanddickeCm > 0)) return 'Wanddicke in cm eingeben.'
  if (b.material === 'stein' && b.wanddickeCm < 10) return 'Stein unter 10 cm Wanddicke steht nicht in der Bewertungstabelle (Richtlinie S. 5) – Bauklasse „fehlt“.'
  return 'Für diese Wanddicke gibt es keine Zeile in der Bewertungstabelle (Richtlinie S. 5).'
}
