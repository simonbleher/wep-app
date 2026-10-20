// Eigene Positionen: Freitext-Positionen, die sich der Wertermittler merkt (Beta 3, Paket 3).
// Reine Funktionen ohne Speicher – Ablage siehe eigeneSpeicher.ts, Abgleich src/sync/eigenePositionen.ts.
import type { Position } from './types.js';
import { normalisiere } from './util.js';

export type EigenerAbschnitt = 'aussenanlagen' | 'aufwuchs';

/** Präfix der Suchtreffer-ID, damit eigene Positionen nie mit Katalog-IDs kollidieren. */
export const EIGEN_PRAEFIX = 'eigen-';

export interface EigenePosition {
  id: string;
  abschnitt: EigenerAbschnitt;
  bezeichnung: string;
  einheit: string;
  /** Zuletzt verwendeter Einzelpreis in EUR; fehlt, wenn keiner gemerkt wurde. */
  einzelpreis?: number;
  /** Letzte Änderung (ISO). Je Eintrag gewinnt die neuere Änderung. */
  geaendertAm: string;
  /** Gelöscht: bleibt als Marke erhalten, damit ein anderes Gerät den Eintrag nicht zurückbringt. */
  geloescht?: boolean;
}

const KATALOG_ABSCHNITT: Record<EigenerAbschnitt, string> = {
  aussenanlagen: 'II. Außenanlagen',
  aufwuchs: 'III. Aufwuchs',
};

export function neueEigeneId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Nur die vorhandenen (nicht gelöschten) Einträge, optional eines Abschnitts. */
export function aktive(eintraege: EigenePosition[], abschnitt?: EigenerAbschnitt): EigenePosition[] {
  return eintraege.filter((e) => !e.geloescht && (!abschnitt || e.abschnitt === abschnitt));
}

/** Eine eigene Position in der Form des Katalogs, damit die Suche beides gleich behandelt. */
export function alsKatalogPosition(e: EigenePosition): Position {
  return {
    id: EIGEN_PRAEFIX + e.id,
    abschnitt: KATALOG_ABSCHNITT[e.abschnitt],
    kategorie: 'Eigene Position',
    bezeichnung: e.bezeichnung,
    einheit: e.einheit as Position['einheit'],
    seite: 0,
    regeln: '',
    arten: [],
    relevanz: 0,
    eigen: true,
  };
}

function schluessel(e: Pick<EigenePosition, 'abschnitt' | 'bezeichnung' | 'einheit'>): string {
  return `${e.abschnitt}|${normalisiere(e.bezeichnung)}|${normalisiere(e.einheit)}`;
}

/**
 * Merkt eine Position: gibt es dieselbe (Abschnitt, Bezeichnung, Einheit) schon, wird nur der
 * Preis aktualisiert, sonst entsteht ein neuer Eintrag. Eine zuvor gelöschte Position kommt so
 * wieder zurück. Liefert die neue Liste.
 */
export function merkePosition(
  eintraege: EigenePosition[],
  neu: { abschnitt: EigenerAbschnitt; bezeichnung: string; einheit: string; einzelpreis?: number },
  jetzt: string,
  neueId: () => string = neueEigeneId,
): EigenePosition[] {
  const bezeichnung = neu.bezeichnung.trim();
  const vorhanden = eintraege.find((e) => schluessel(e) === schluessel({ ...neu, bezeichnung }));
  if (vorhanden) {
    return eintraege.map((e) =>
      e === vorhanden
        ? {
            ...e,
            einzelpreis: neu.einzelpreis ?? e.einzelpreis,
            geloescht: undefined,
            geaendertAm: jetzt,
          }
        : e,
    );
  }
  return [...eintraege, { ...neu, bezeichnung, id: neueId(), geaendertAm: jetzt }];
}

/** Ändert einen Eintrag (Bezeichnung, Einheit, Preis, Abschnitt). */
export function aendereEintrag(
  eintraege: EigenePosition[],
  id: string,
  aenderung: Partial<Pick<EigenePosition, 'abschnitt' | 'bezeichnung' | 'einheit' | 'einzelpreis'>>,
  jetzt: string,
): EigenePosition[] {
  return eintraege.map((e) => (e.id === id ? { ...e, ...aenderung, geaendertAm: jetzt } : e));
}

/** Löscht einen Eintrag (bleibt als Marke mit Zeitpunkt stehen). */
export function loescheEintrag(eintraege: EigenePosition[], id: string, jetzt: string): EigenePosition[] {
  return eintraege.map((e) => (e.id === id ? { ...e, geloescht: true, geaendertAm: jetzt } : e));
}

/**
 * Führt zwei Fassungen zusammen: je Eintrag gewinnt die neuere Änderung. Bei gleicher Zeit
 * gewinnt „gelöscht“, sonst die lokale Fassung. Ein Eintrag, der nur auf einer Seite vorkommt,
 * bleibt erhalten. Die Reihenfolge folgt `lokal`, neue Einträge der anderen Seite kommen dahinter.
 */
export function fuehreZusammen(lokal: EigenePosition[], fremd: EigenePosition[]): EigenePosition[] {
  const fremdNachId = new Map(fremd.map((e) => [e.id, e]));
  const ergebnis = lokal.map((l) => {
    const f = fremdNachId.get(l.id);
    if (!f) return l;
    if (f.geaendertAm > l.geaendertAm) return f;
    if (f.geaendertAm === l.geaendertAm && f.geloescht && !l.geloescht) return f;
    return l;
  });
  const lokalIds = new Set(lokal.map((l) => l.id));
  return [...ergebnis, ...fremd.filter((f) => !lokalIds.has(f.id))];
}

/** Sind beide Listen inhaltlich gleich (unabhängig von der Reihenfolge)? */
export function gleicheEintraege(a: EigenePosition[], b: EigenePosition[]): boolean {
  if (a.length !== b.length) return false;
  const nachId = new Map(b.map((e) => [e.id, e]));
  return a.every((e) => {
    const g = nachId.get(e.id);
    return (
      !!g &&
      g.abschnitt === e.abschnitt &&
      g.bezeichnung === e.bezeichnung &&
      g.einheit === e.einheit &&
      g.einzelpreis === e.einzelpreis &&
      g.geaendertAm === e.geaendertAm &&
      !!g.geloescht === !!e.geloescht
    );
  });
}
