// Lokale Ablage der eigenen Positionen (localStorage, wie das Profil) samt Abgleich-Stand.
// Der Abgleich selbst steht in src/sync/eigenePositionen.ts.
import {
  aendereEintrag,
  loescheEintrag,
  merkePosition,
  type EigenePosition,
  type EigenerAbschnitt,
} from './eigene.js';

/** Eigene Positionen samt Abgleich-Stand, wie sie lokal liegen. */
export interface EigeneStand {
  /** Aktive und gelöschte Einträge (gelöscht = Marke für den Abgleich). */
  eintraege: EigenePosition[];
  /** Es gibt lokale Änderungen, die noch nicht in OneDrive sind. */
  wartet?: boolean;
  /** eTag von daten/eigene-positionen.json beim letzten Abgleich. */
  remoteETag?: string;
  letzterSyncAm?: string;
}

export interface EigeneSpeicher {
  lade(): EigeneStand;
  speichere(stand: EigeneStand): void;
}

const KEY = 'wep-eigene-positionen';

/** Eigene Positionen im localStorage dieses Geräts. */
export const lokaleEigene: EigeneSpeicher = {
  lade() {
    try {
      const roh = localStorage.getItem(KEY);
      if (roh) {
        const d = JSON.parse(roh) as Partial<EigeneStand>;
        return { ...d, eintraege: Array.isArray(d.eintraege) ? d.eintraege : [] };
      }
    } catch {
      /* kaputter oder gesperrter Speicher → leere Liste */
    }
    return { eintraege: [] };
  },
  speichere(stand) {
    try {
      localStorage.setItem(KEY, JSON.stringify(stand));
    } catch {
      /* ohne Speicher werden eigene Positionen eben nicht gemerkt */
    }
  },
};

const jetztIso = () => new Date().toISOString();

function aendere(
  f: (eintraege: EigenePosition[]) => EigenePosition[],
  speicher: EigeneSpeicher,
): EigeneStand {
  const alt = speicher.lade();
  const neu: EigeneStand = { ...alt, eintraege: f(alt.eintraege), wartet: true };
  speicher.speichere(neu);
  return neu;
}

/** Merkt eine Freitext-Position (oder aktualisiert die gleiche) und markiert sie für den Abgleich. */
export function merkeEigenePosition(
  neu: { abschnitt: EigenerAbschnitt; bezeichnung: string; einheit: string; einzelpreis?: number },
  speicher: EigeneSpeicher = lokaleEigene,
  jetzt: () => string = jetztIso,
): EigeneStand {
  return aendere((e) => merkePosition(e, neu, jetzt()), speicher);
}

export function aendereEigenePosition(
  id: string,
  aenderung: Partial<Pick<EigenePosition, 'abschnitt' | 'bezeichnung' | 'einheit' | 'einzelpreis'>>,
  speicher: EigeneSpeicher = lokaleEigene,
  jetzt: () => string = jetztIso,
): EigeneStand {
  return aendere((e) => aendereEintrag(e, id, aenderung, jetzt()), speicher);
}

export function loescheEigenePosition(
  id: string,
  speicher: EigeneSpeicher = lokaleEigene,
  jetzt: () => string = jetztIso,
): EigeneStand {
  return aendere((e) => loescheEintrag(e, id, jetzt()), speicher);
}
