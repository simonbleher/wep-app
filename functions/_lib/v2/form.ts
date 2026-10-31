// v2: Schlanke Formprüfung eines WEP vor dem Speichern (Fund M2, docs/SICHERHEITSPRUEFUNG-V2.md). Kein vollständiges
// Schema – nur so viel, dass ein WEP in falscher Form (z. B. `gruen` als Text, `formalien: null`) mit 400 abgelehnt wird,
// statt später die Ansicht von Bau und BV oder einen Schritt im Ablauf (500) zu brechen. Inhalte bleiben frei (nichts
// sperren, nur warnen); fehlende Teile sind erlaubt.
const istObjekt = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const leer = (v: unknown) => v === undefined || v === null

/** Höchstlänge eines einzelnen Textfelds der Formalien. */
const MAX_TEXT = 2000

/** Teile, die – wenn vorhanden – ein Objekt sein müssen (null zählt als „fehlt“). */
const OBJEKTE = ['bau', 'skizze', 'parzelle', 'grundriss', 'unterschriften', 'bauExcel'] as const
const GRUEN_LISTEN = ['aussenanlagen', 'aufwuchs', 'beseitigungAA'] as const

const zahlOderLeer = (v: unknown) => leer(v) || (typeof v === 'number' && Number.isFinite(v) && v >= 0)

/** Alter (Obstgehölz) bzw. Baum-Maß (Beseitigung „Baum fällen“): wenn vorhanden, Zahlen ≥ 0 und kurze Texte. */
function massFormOk(p: Record<string, unknown>): boolean {
  if (!zahlOderLeer(p.alterJahre)) return false
  if (!leer(p.baumform) && (typeof p.baumform !== 'string' || p.baumform.length > MAX_TEXT)) return false
  if (!leer(p.preisManuell) && typeof p.preisManuell !== 'boolean') return false
  if (!leer(p.nachAlter) && typeof p.nachAlter !== 'boolean') return false
  if (leer(p.baum)) return true
  if (!istObjekt(p.baum)) return false
  const b = p.baum
  return zahlOderLeer(b.stammumfangCm) && zahlOderLeer(b.durchmesserCm) && (leer(b.art) || (typeof b.art === 'string' && b.art.length <= MAX_TEXT))
}

/** Warum das WEP nicht die erwartete Form hat – oder undefined. */
export function wepFormFehler(w: unknown): string | undefined {
  if (!istObjekt(w)) return 'Das WEP fehlt.'
  if (w.formalien !== undefined) {
    if (!istObjekt(w.formalien)) return 'Die Formalien haben eine ungültige Form.'
    for (const [k, v] of Object.entries(w.formalien)) {
      if (leer(v) || typeof v === 'number') continue
      if (typeof v !== 'string') return `Formalien: „${k}“ hat eine ungültige Form.`
      if (v.length > MAX_TEXT) return `Formalien: „${k}“ ist zu lang.`
    }
  }
  if (w.gruen !== undefined) {
    if (!istObjekt(w.gruen)) return 'Der Grün-Teil hat eine ungültige Form.'
    for (const l of GRUEN_LISTEN) {
      const liste = w.gruen[l]
      if (liste === undefined) continue
      if (!Array.isArray(liste) || liste.some((p) => !istObjekt(p) || typeof p.id !== 'string')) return `Grün-Teil: „${l}“ hat eine ungültige Form.`
      // Maße der Bäume (src/gruen/baumMass.ts): fehlen dürfen sie, falsch geformt nicht
      if (liste.some((p) => !massFormOk(p as Record<string, unknown>))) return `Grün-Teil: „${l}“ enthält ein Maß in ungültiger Form.`
    }
    for (const t of ['beschreibungAussen', 'beschreibungAufwuchs']) if (!leer(w.gruen[t]) && typeof w.gruen[t] !== 'string') return `Grün-Teil: „${t}“ hat eine ungültige Form.`
  }
  for (const o of OBJEKTE) if (!leer(w[o]) && !istObjekt(w[o])) return `„${o}“ hat eine ungültige Form.`
  if (w.fotos !== undefined) {
    // Foto-Id wie der Dateiname in R2 (foto-<Id>.jpg)
    if (!Array.isArray(w.fotos) || w.fotos.some((f) => !istObjekt(f) || typeof f.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(f.id))) return 'Die Fotos haben eine ungültige Form.'
  }
  return undefined
}
