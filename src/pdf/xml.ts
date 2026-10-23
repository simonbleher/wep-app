/**
 * Kleiner XML-Leser für die Blätter der Arbeitsmappe (läuft im Browser und in Node-Tests, ohne DOMParser).
 *
 * Gelesen wird nur, was das PDF braucht: Elemente, Attribute und Text. Namensräume werden ignoriert
 * (`x14ac:dyDescent` bleibt ein Attributname), Kommentare und Verarbeitungsanweisungen übersprungen.
 */

export interface XmlKnoten {
  name: string
  attr: Record<string, string>
  kinder: XmlKnoten[]
  text: string
}

const ENTITAETEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function entschaerfe(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITAETEN[e] ?? m
  })
}

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export function leseXml(xml: string): XmlKnoten {
  const wurzel: XmlKnoten = { name: '#doc', attr: {}, kinder: [], text: '' }
  const stapel: XmlKnoten[] = [wurzel]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s/>!?]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const oben = stapel[stapel.length - 1]
    if (m[1] !== undefined) {
      oben.text += m[1]
    } else if (m[6] !== undefined) {
      oben.text += entschaerfe(m[6])
    } else if (m[3] !== undefined) {
      if (m[2]) {
        if (stapel.length > 1) stapel.pop()
        continue
      }
      const attr: Record<string, string> = {}
      ATTR.lastIndex = 0
      let a: RegExpExecArray | null
      while ((a = ATTR.exec(m[4]))) attr[a[1]] = entschaerfe(a[2] ?? a[3] ?? '')
      const k: XmlKnoten = { name: m[3], attr, kinder: [], text: '' }
      oben.kinder.push(k)
      if (!m[5]) stapel.push(k)
    }
  }
  return wurzel.kinder[0] ?? wurzel
}

/** Erstes Kind mit diesem Namen. */
export const kind = (k: XmlKnoten | undefined, name: string): XmlKnoten | undefined => k?.kinder.find((x) => x.name === name)
/** Alle Kinder mit diesem Namen. */
export const kinder = (k: XmlKnoten | undefined, name: string): XmlKnoten[] => k?.kinder.filter((x) => x.name === name) ?? []
/** Text aller Nachkommen (für `<si><r><t>…`). */
export function volltext(k: XmlKnoten): string {
  return k.text + k.kinder.map(volltext).join('')
}
