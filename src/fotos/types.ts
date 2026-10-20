// Lokale Ablage der Fotos (IndexedDB). Die Angaben zum Foto (Position, Text, Größe …) stehen im
// WEP selbst (`Wep.fotos`) und werden mit ihm abgeglichen; hier liegen nur die Bilddateien.

/**
 * Verwaltungseintrag zu einem Foto auf diesem Gerät (IndexedDB-Store „fotos“). Er enthält nur
 * das kleine Vorschaubild; die große Datei liegt getrennt im Store „fotoDaten“, damit die Liste
 * schnell lädt.
 */
export interface FotoRecord {
  /** `<WEP-id>/<Foto-id>` */
  key: string
  wepId: string
  id: string
  /** Kleines Vorschaubild (JPEG, ca. 360 px); fehlt, solange das Foto noch nicht geladen ist. */
  vorschau?: Blob
  /** Die Bilddatei liegt auf diesem Gerät (sonst nur in OneDrive). */
  hatDatei: boolean
  /** Das Foto liegt nach unserem Wissen in OneDrive. */
  hochgeladen: boolean
  /** Vom Nutzer gelöscht (ISO); die Datei in OneDrive wird beim nächsten Abgleich entfernt. */
  geloescht?: string
  erstelltAm: string
}

export interface FotoDatei {
  key: string
  blob: Blob
}

export function fotoKey(wepId: string, id: string): string {
  return `${wepId}/${id}`
}

/** Dateiname in OneDrive. */
export function fotoDateiName(id: string): string {
  return `${id}.jpg`
}

/** Foto-Id aus einem Dateinamen in OneDrive (`<id>.jpg`), sonst null. */
export function fotoIdAusName(name: string): string | null {
  return name.endsWith('.jpg') ? name.slice(0, -'.jpg'.length) : null
}
