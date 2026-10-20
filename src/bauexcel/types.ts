// Lokale Ablage der Bau-Excel (IndexedDB). Die Angaben zur Datei (Name, Größe, Version) stehen im WEP
// selbst (`Wep.bauExcel`) und werden mit ihm abgeglichen; hier liegt nur die Datei dieses Geräts.

/** Verwaltungseintrag zur Bau-Excel eines WEP auf diesem Gerät (Store „bauExcel“, Schlüssel = WEP-id). */
export interface BauExcelRecord {
  wepId: string
  /** Kennung des Inhalts (`Wep.bauExcel.version`), zu der die Datei auf diesem Gerät gehört. */
  version: string
  /** Die Datei liegt auf diesem Gerät (sonst nur in OneDrive). */
  hatDatei: boolean
  /** Diese Fassung liegt nach unserem Wissen in OneDrive. */
  hochgeladen: boolean
  /** Vom Nutzer entfernt (ISO); die Datei in OneDrive wird beim nächsten Abgleich gelöscht. */
  geloescht?: string
  erstelltAm: string
}

/** Lokale Ablage der Bau-Excel-Dateien (in der App IndexedDB, in Tests im Speicher). */
export interface BauExcelSpeicher {
  alleRecords(): Promise<BauExcelRecord[]>
  ladeDatei(wepId: string): Promise<Blob | undefined>
  setzeRecord(r: BauExcelRecord): Promise<void>
  /** Legt Eintrag (und Datei) an bzw. ersetzt sie. */
  speichere(r: BauExcelRecord, blob?: Blob): Promise<void>
  /** Entfernt Eintrag und Datei von diesem Gerät. */
  entferne(wepId: string): Promise<void>
  /** Löschmarke setzen, Datei von diesem Gerät entfernen (die Datei in OneDrive geht beim Abgleich). */
  markiereGeloescht(wepId: string, zeit: string): Promise<void>
}

/** Dateiname in OneDrive: daten/bau/<Vorgangs-Nr>.xlsx */
export function bauExcelDateiName(wepId: string): string {
  return `${wepId}.xlsx`
}

/** Vorgangs-Nr. aus dem Dateinamen in OneDrive, sonst null. */
export function wepIdAusBauName(name: string): string | null {
  return name.endsWith('.xlsx') ? name.slice(0, -'.xlsx'.length) : null
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
