// Fotos verkleinern (Beta 3, Paket 4): längste Seite höchstens 2000 px, JPEG, Ziel unter etwa
// 500 KB, Ausrichtung (EXIF) korrigieren, Standortdaten und alle anderen Metadaten entfernen.
//
// Die Bildverarbeitung selbst (Dekodieren, Zeichnen, JPEG schreiben) liegt hinter dem kleinen
// Interface `Bilddienst`: im Browser über Canvas (browserBild.ts), in den Tests über
// @napi-rs/canvas. Dadurch ist die Logik hier – Größenberechnung, Drehung, Qualitätsstufen –
// ohne Browser testbar. Weil beim Zeichnen auf eine Leinwand nichts von den Metadaten der
// Quelldatei mitkommt, sind GPS-Position, Kameramodell usw. nach dem Verkleinern weg.

/** Längste Seite des gespeicherten Fotos (px). */
export const FOTO_MAX_SEITE = 2000
/** Zielgröße des gespeicherten Fotos (Bytes). */
export const FOTO_ZIEL_BYTES = 500 * 1024
/** Längste Seite des Vorschaubilds (px). */
export const VORSCHAU_MAX_SEITE = 360

/** JPEG-Qualitätsstufen, von gut nach kleiner; die erste, die unter dem Ziel bleibt, gilt. */
const QUALITAETEN = [0.82, 0.74, 0.66, 0.58, 0.5]
/** Hilft die kleinste Qualität nicht, wird das Bild schrittweise verkleinert. */
const VERKLEINERUNG = 0.8
const MAX_RUNDEN = 4

/** Das, was beim Zeichnen gebraucht wird (Teilmenge von CanvasRenderingContext2D). */
export interface Zeichner {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  drawImage(bild: never, dx: number, dy: number, dw: number, dh: number): void
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, b: number, h: number): void
}

export interface Leinwand {
  zeichner: Zeichner
  /** Aktueller Inhalt als JPEG (Qualität 0–1). */
  nachJpeg(qualitaet: number): Promise<Uint8Array>
}

export interface DekodiertesBild {
  /** Wird unverändert an `Zeichner.drawImage` gegeben. */
  bild: unknown
  breite: number
  hoehe: number
}

export interface Bilddienst {
  dekodiere(bytes: Uint8Array): Promise<DekodiertesBild>
  leinwand(breite: number, hoehe: number): Leinwand
  /**
   * Dreht der Decoder ein JPEG nach seiner EXIF-Angabe schon von selbst? (Moderne Browser tun
   * das; dann darf die Drehung nicht doppelt geschehen.) Siehe `erkenneAutoDrehung`.
   */
  dreheSelbst(): Promise<boolean>
}

export interface FotoErgebnis {
  jpeg: Uint8Array
  breite: number
  hoehe: number
  vorschau: Uint8Array
}

// ---------------------------------------------------------------------------
// EXIF
// ---------------------------------------------------------------------------

/**
 * Liest die Ausrichtung (EXIF-Tag 0x0112, Werte 1–8) eines JPEG. Liefert 1, wenn das Bild
 * keine Angabe hat, kein JPEG ist oder die Daten unlesbar sind.
 */
export function leseExifOrientierung(bytes: Uint8Array): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const len = bytes.byteLength
  if (len < 4 || dv.getUint16(0) !== 0xffd8) return 1
  let pos = 2
  while (pos + 4 <= len) {
    if (dv.getUint8(pos) !== 0xff) return 1
    const marker = dv.getUint8(pos + 1)
    if (marker === 0xff) {
      pos++ // Füllbytes
      continue
    }
    if (marker === 0xda || marker === 0xd9) return 1 // ab hier Bilddaten
    const segLen = dv.getUint16(pos + 2)
    if (marker === 0xe1 && pos + 10 <= len && dv.getUint32(pos + 4) === 0x45786966 /* "Exif" */) {
      return orientierungAusTiff(dv, pos + 10, Math.min(len, pos + 2 + segLen))
    }
    pos += 2 + segLen
  }
  return 1
}

function orientierungAusTiff(dv: DataView, tiff: number, ende: number): number {
  if (tiff + 8 > ende) return 1
  const bom = dv.getUint16(tiff)
  const klein = bom === 0x4949 // "II" = little endian
  if (!klein && bom !== 0x4d4d) return 1
  const u16 = (o: number) => dv.getUint16(o, klein)
  const u32 = (o: number) => dv.getUint32(o, klein)
  if (u16(tiff + 2) !== 42) return 1
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > ende) return 1
  const anzahl = u16(ifd)
  for (let i = 0; i < anzahl; i++) {
    const eintrag = ifd + 2 + i * 12
    if (eintrag + 12 > ende) return 1
    if (u16(eintrag) === 0x0112) {
      const wert = u16(eintrag + 8)
      return wert >= 1 && wert <= 8 ? wert : 1
    }
  }
  return 1
}

/** Orientierungen 5–8 vertauschen Breite und Höhe. */
export function vertauscht(orientierung: number): boolean {
  return orientierung >= 5 && orientierung <= 8
}

/** Zeichen-Transformation für die Orientierung; b und h sind Breite/Höhe des (skalierten) Quellbilds. */
export function orientierungsMatrix(o: number, b: number, h: number): [number, number, number, number, number, number] {
  switch (o) {
    case 2:
      return [-1, 0, 0, 1, b, 0]
    case 3:
      return [-1, 0, 0, -1, b, h]
    case 4:
      return [1, 0, 0, -1, 0, h]
    case 5:
      return [0, 1, 1, 0, 0, 0]
    case 6:
      return [0, 1, -1, 0, h, 0]
    case 7:
      return [0, -1, -1, 0, h, b]
    case 8:
      return [0, -1, 1, 0, 0, b]
    default:
      return [1, 0, 0, 1, 0, 0]
  }
}

/** Die (nach der Drehung angezeigte) Größe, begrenzt auf `maxSeite`; nie vergrößert. */
export function zielGroesse(breite: number, hoehe: number, maxSeite: number): { breite: number; hoehe: number } {
  const laenge = Math.max(breite, hoehe)
  const faktor = laenge > maxSeite ? maxSeite / laenge : 1
  return { breite: Math.max(1, Math.round(breite * faktor)), hoehe: Math.max(1, Math.round(hoehe * faktor)) }
}

/**
 * Prüft mit einem kleinen Probebild (JPEG mit Ausrichtung 6, 2 × 1 px roh), ob der Decoder
 * die EXIF-Drehung schon selbst anwendet: Dann kommt das Bild 1 × 2 px zurück.
 */
export async function erkenneAutoDrehung(dekodiere: (bytes: Uint8Array) => Promise<{ breite: number; hoehe: number }>): Promise<boolean> {
  try {
    const probe = await dekodiere(PROBE_JPEG_O6)
    return probe.breite === 1 && probe.hoehe === 2
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Verkleinern
// ---------------------------------------------------------------------------

async function zeichne(
  dienst: Bilddienst,
  quelle: DekodiertesBild,
  orientierung: number,
  ziel: { breite: number; hoehe: number },
): Promise<Leinwand> {
  const tausch = vertauscht(orientierung)
  // Größe des Quellbilds im Ziel (vor der Drehung)
  const qb = tausch ? ziel.hoehe : ziel.breite
  const qh = tausch ? ziel.breite : ziel.hoehe
  const l = dienst.leinwand(ziel.breite, ziel.hoehe)
  l.zeichner.setTransform(1, 0, 0, 1, 0, 0)
  l.zeichner.fillStyle = '#ffffff' // Transparenz (PNG) wird weiß
  l.zeichner.fillRect(0, 0, ziel.breite, ziel.hoehe)
  l.zeichner.setTransform(...orientierungsMatrix(orientierung, qb, qh))
  l.zeichner.drawImage(quelle.bild as never, 0, 0, qb, qh)
  return l
}

/**
 * Macht aus den Bytes eines Fotos (JPEG, PNG …) das gespeicherte Foto (≤ 2000 px, JPEG,
 * Ziel < 500 KB, richtig herum, ohne Metadaten) und das Vorschaubild.
 */
export async function erzeugeFoto(bytes: Uint8Array, dienst: Bilddienst): Promise<FotoErgebnis> {
  const exif = leseExifOrientierung(bytes)
  const quelle = await dienst.dekodiere(bytes)
  // Dreht der Decoder schon selbst, sind Breite/Höhe und Pixel bereits „richtig herum“.
  const orientierung = (await dienst.dreheSelbst()) ? 1 : exif
  const angezeigt = vertauscht(orientierung)
    ? { breite: quelle.hoehe, hoehe: quelle.breite }
    : { breite: quelle.breite, hoehe: quelle.hoehe }

  let seite = FOTO_MAX_SEITE
  let jpeg: Uint8Array = new Uint8Array(0)
  let groesse = zielGroesse(angezeigt.breite, angezeigt.hoehe, seite)
  for (let runde = 0; runde < MAX_RUNDEN; runde++) {
    groesse = zielGroesse(angezeigt.breite, angezeigt.hoehe, seite)
    const l = await zeichne(dienst, quelle, orientierung, groesse)
    for (const q of QUALITAETEN) {
      jpeg = await l.nachJpeg(q)
      if (jpeg.byteLength <= FOTO_ZIEL_BYTES) break
    }
    if (jpeg.byteLength <= FOTO_ZIEL_BYTES) break
    seite = Math.round(Math.min(seite, Math.max(groesse.breite, groesse.hoehe)) * VERKLEINERUNG)
  }

  const kleinZiel = zielGroesse(angezeigt.breite, angezeigt.hoehe, VORSCHAU_MAX_SEITE)
  const vorschau = await (await zeichne(dienst, quelle, orientierung, kleinZiel)).nachJpeg(0.7)
  return { jpeg, breite: groesse.breite, hoehe: groesse.hoehe, vorschau }
}

/** Nur das Vorschaubild zu einem schon verkleinerten Foto (z. B. nach dem Laden aus OneDrive). */
export async function erzeugeVorschau(bytes: Uint8Array, dienst: Bilddienst): Promise<Uint8Array> {
  const quelle = await dienst.dekodiere(bytes)
  const ziel = zielGroesse(quelle.breite, quelle.hoehe, VORSCHAU_MAX_SEITE)
  // Gespeicherte Fotos sind schon richtig herum und ohne EXIF
  return (await zeichne(dienst, quelle, 1, ziel)).nachJpeg(0.7)
}

/** Selbst erzeugtes Probebild: 2 × 1 px, EXIF-Ausrichtung 6 (Quelle: tools/fotos/probe.mjs). */
const PROBE_BASE64 = '/9j/4QAiRXhpZgAASUkqAAgAAAABABIBAwABAAAABgAAAAAAAAD/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAbEAEAAAcAAAAAAAAAAAAAAAAAAQIEBTVzsf/EABUBAQEAAAAAAAAAAAAAAAAAAAUI/8QAHBEAAAcBAQAAAAAAAAAAAAAAAAECAzRysQQF/9oADAMBAAIRAxEAPwCXbnkqvbP2ICsPOhM1ThA3vlvWVpj/2Q=='
export const PROBE_JPEG_O6: Uint8Array = Uint8Array.from(atob(PROBE_BASE64), (c) => c.charCodeAt(0))
