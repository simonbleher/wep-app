/**
 * XML-Patcher für XLSX-Sheets.
 *
 * Ansatz: XLSX ist ein ZIP-Archiv. Wir laden es mit JSZip, lesen die
 * betroffenen Worksheet-XMLs als Text, patchen einzelne Zellen per
 * regulären Ausdrücken und schreiben sie zurück. Bau-Blätter werden
 * nicht angefasst.
 *
 * Warum kein ExcelJS / SheetJS?  → docs/ENTSCHEIDUNGEN.md
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type CellValue = string | number | null

export interface CellPatch {
  /** Zell-Adresse, z. B. "E3" oder "A15" */
  cell: string
  value: CellValue
}

// ---------------------------------------------------------------------------
// XML-Hilfsfunktionen
// ---------------------------------------------------------------------------

/** Maskiert Sonderzeichen für XML-Inline-Strings. */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Leerzeichen am Anfang oder Ende (z. B. „Stein 17,50 - 23,99 cm “ in der Vorlage) brauchen xml:space="preserve". */
function preserve(s: string): string {
  return s !== s.trim() ? ' xml:space="preserve"' : ''
}

/**
 * Liest den aktuellen Textwert einer Zelle aus einem Worksheet-XML.
 * Gibt `null` zurück wenn die Zelle leer oder nicht vorhanden ist.
 *
 * Unterstützte Typen:
 * - inlineStr:  `<c ... t="inlineStr"><is><t>...</t></is></c>`
 * - Zahl/leer:  `<c ...><v>...</v></c>` oder `<c .../>`
 * - Shared str: `t="s"` – Index in sharedStrings.xml; wir lesen hier nur
 *               den numerischen Index, nicht den aufgelösten Wert.
 *   (Für die Prüfung „ist die Zelle in der Bau-Excel belegt?" reicht es
 *   zu wissen, ob irgendetwas drinsteht.)
 */
export function readCellRawValue(xml: string, cell: string): string | null {
  // Escape cell für Regex (z. B. "E3" → kein Sonderzeichen, aber sicher)
  const escapedCell = cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Suche nach dem <c r="CELL" ...>...</c> Element.
  // WICHTIG: Die erste Alternative verwendet (?<!/)> damit self-closing Zellen
  // (<c r="X" .../>) NICHT fälschlich von der ersten Alternative gematcht werden.
  // Ohne den negative lookbehind würde [^>]* auch das '/' in '/>' fressen und
  // dann '>' matchen, was den nachfolgenden Zell-Inhalt verschluckt.
  const cellPattern = new RegExp(
    `<c\\s[^>]*r="${escapedCell}"[^>]*(?<!/)>([\\s\\S]*?)</c>|` +
      `<c\\s[^>]*r="${escapedCell}"[^>]*/>`
  )
  const match = xml.match(cellPattern)
  if (!match) return null

  const cellXml = match[0]

  // Leere self-closing Zelle?
  if (cellXml.endsWith('/>')) return null

  // InlineStr?
  const inlineMatch = cellXml.match(/<is><t(?:[^>]*)>([\s\S]*?)<\/t><\/is>/)
  if (inlineMatch) return inlineMatch[1] || null

  // Wert (Zahl oder Shared-String-Index)?
  const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/)
  if (vMatch) return vMatch[1] || null

  return null
}

/**
 * Schreibt einen neuen Wert in eine Zelle eines Worksheet-XMLs.
 *
 * - Zahlen werden als `<v>` Element gespeichert (kein Typ-Attribut).
 * - Strings werden als Inline-String gespeichert (`t="inlineStr"`),
 *   damit keine Änderung an sharedStrings.xml nötig ist.
 * - `null` löscht den Inhalt (leere Zelle, Stil bleibt erhalten).
 *
 * Das vorhandene Style-Attribut (`s="NNN"`) wird beibehalten.
 * Formeln (Spalte L, K) werden NICHT berührt – diese Funktion ändert
 * ausschließlich Zellen, die als Input-Parameter übergeben werden.
 */
export function patchCell(
  xml: string,
  cell: string,
  value: CellValue,
): string {
  const escapedCell = cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Suche das bestehende <c ...> Element.
  // Gleicher negative lookbehind wie in readCellRawValue: (?<!/)> verhindert,
  // dass self-closing Zellen (<c ... />) von der ersten Alternative gematcht
  // werden und dabei nachfolgenden Inhalt bis zum nächsten </c> verschlucken.
  const cellPattern = new RegExp(
    `<c\\s[^>]*r="${escapedCell}"[^>]*(?<!/)>[\\s\\S]*?</c>|` +
      `<c\\s[^>]*r="${escapedCell}"[^>]*/>`,
    'g'
  )

  let found = false
  const newXml = xml.replace(cellPattern, (match) => {
    found = true

    // Vorhandenes style-Attribut extrahieren
    const styleMatch = match.match(/\bs="(\d+)"/)
    const style = styleMatch ? ` s="${styleMatch[1]}"` : ''

    // Vorhandenes r-Attribut (wird übernommen)
    const rAttr = ` r="${cell}"`

    // Weitere Attribute, die wir beibehalten wollen
    // (z. B. keine, wir schreiben die Zelle neu)

    if (value === null || value === '') {
      // Leere Zelle
      return `<c${rAttr}${style}/>`
    }

    if (typeof value === 'number') {
      return `<c${rAttr}${style}><v>${value}</v></c>`
    }

    // String als Inline-String
    return `<c${rAttr}${style} t="inlineStr"><is><t${preserve(value)}>${xmlEscape(value)}</t></is></c>`
  })

  if (!found) {
    // Zelle existiert nicht → in die richtige Zeile einfügen
    return insertCell(newXml, cell, value)
  }

  return newXml
}

/**
 * Fügt eine Zelle in eine Zeile ein, wenn sie noch nicht existiert.
 * Zellen müssen in einer Zeile nach Spalte sortiert sein.
 */
function insertCell(xml: string, cell: string, value: CellValue): string {
  const { row, col } = parseCellAddress(cell)
  const colIndex = colToIndex(col)

  // Finde die korrekte Zeile
  const rowPattern = new RegExp(
    `(<row[^>]*r="${row}"[^>]*>)([\\s\\S]*?)(</row>)`
  )
  const rowMatch = xml.match(rowPattern)

  if (!rowMatch) {
    // Zeile existiert auch nicht – selten in der Vorlage, ignorieren
    return xml
  }

  const [fullMatch, rowOpen, rowContent, rowClose] = rowMatch

  // Neues Zell-Element erzeugen
  let newCellXml: string
  if (value === null || value === '') {
    newCellXml = `<c r="${cell}"/>`
  } else if (typeof value === 'number') {
    newCellXml = `<c r="${cell}"><v>${value}</v></c>`
  } else {
    newCellXml = `<c r="${cell}" t="inlineStr"><is><t${preserve(value)}>${xmlEscape(value)}</t></is></c>`
  }

  // Position in der Zeile finden (nach Spaltenindex sortiert einfügen)
  // Suche alle vorhandenen Zellen in der Zeile
  const existingCells = rowContent.matchAll(/<c\s[^>]*r="([A-Z]+)(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)

  let insertBefore: string | null = null
  for (const m of existingCells) {
    const existingColIdx = colToIndex(m[1])
    if (existingColIdx > colIndex) {
      insertBefore = m[0]
      break
    }
  }

  let newRowContent: string
  if (insertBefore) {
    newRowContent = rowContent.replace(insertBefore, newCellXml + insertBefore)
  } else {
    newRowContent = rowContent + newCellXml
  }

  return xml.replace(fullMatch, rowOpen + newRowContent + rowClose)
}

// ---------------------------------------------------------------------------
// Adress-Hilfsfunktionen
// ---------------------------------------------------------------------------

interface CellAddress {
  col: string // z. B. "E"
  row: number // z. B. 3
}

/** Zerlegt "E3" → { col: "E", row: 3 } */
export function parseCellAddress(cell: string): CellAddress {
  const match = cell.match(/^([A-Z]+)(\d+)$/)
  if (!match)
    throw new Error(`Ungültige Zell-Adresse: ${cell}`)
  return { col: match[1], row: parseInt(match[2], 10) }
}

/** Konvertiert Spaltenbuchstaben in 0-basierten Index (A=0, Z=25, AA=26 …) */
export function colToIndex(col: string): number {
  let index = 0
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64)
  }
  return index
}

// ---------------------------------------------------------------------------
// Batch-Patching
// ---------------------------------------------------------------------------

/**
 * Wendet mehrere Zell-Patches auf ein Worksheet-XML an.
 * Reihenfolge der Patches wird eingehalten.
 */
export function patchCells(xml: string, patches: CellPatch[]): string {
  let result = xml
  for (const patch of patches) {
    result = patchCell(result, patch.cell, patch.value)
  }
  return result
}

// ---------------------------------------------------------------------------
// Formeln
// ---------------------------------------------------------------------------

/**
 * Setzt die Formel einer Zelle (z. B. `$H$32`, ohne „=“); Stil bleibt, ein gespeicherter Zwischenwert entfällt (Excel
 * und LibreOffice rechnen beim Öffnen). `formelXml` kann auch ein fertiges `<f …/>`-Element sein (gemeinsame Formeln).
 * Gibt `null` zurück, wenn die Zelle nicht existiert.
 */
export function patchFormel(xml: string, cell: string, formel: string): string | null {
  const escapedCell = cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const cellPattern = new RegExp(
    `<c\\s[^>]*r="${escapedCell}"[^>]*(?<!/)>[\\s\\S]*?</c>|<c\\s[^>]*r="${escapedCell}"[^>]*/>`,
  )
  const m = xml.match(cellPattern)
  if (!m) return null
  const style = m[0].match(/\bs="(\d+)"/)
  const f = formel.startsWith('<f') ? formel : `<f>${xmlEscape(formel)}</f>`
  return xml.replace(cellPattern, `<c r="${cell}"${style ? ` s="${style[1]}"` : ''}>${f}</c>`)
}

/** Formel einer Zelle (Text ohne „=“) oder `null`. */
export function readCellFormula(xml: string, cell: string): string | null {
  const escapedCell = cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = xml.match(new RegExp(`<c\\s[^>]*r="${escapedCell}"[^>]*(?<!/)>([\\s\\S]*?)</c>`))
  const f = m && /<f\b[^>]*>([^<]*)<\/f>/.exec(m[1])
  return f ? f[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : null
}
