import { describe, expect, it } from 'vitest';
import {
  aendereEintrag,
  aktive,
  fuehreZusammen,
  gleicheEintraege,
  loescheEintrag,
  merkePosition,
  type EigenePosition,
} from './eigene.js';
import {
  aendereEigenePosition,
  loescheEigenePosition,
  merkeEigenePosition,
  type EigeneSpeicher,
  type EigeneStand,
} from './eigeneSpeicher.js';

const T1 = '2026-10-20T08:00:00.000Z';
const T2 = '2026-10-20T09:00:00.000Z';
const T3 = '2026-10-20T10:00:00.000Z';

const eintrag = (id: string, teil: Partial<EigenePosition> = {}): EigenePosition => ({
  id,
  abschnitt: 'aufwuchs',
  bezeichnung: `Pflanze ${id}`,
  einheit: 'Stück',
  geaendertAm: T1,
  ...teil,
});

describe('merkePosition', () => {
  it('legt einen neuen Eintrag an', () => {
    const liste = merkePosition([], { abschnitt: 'aufwuchs', bezeichnung: ' Zaubernuss ', einheit: 'Stück', einzelpreis: 40 }, T1, () => 'a');
    expect(liste).toEqual([{ id: 'a', abschnitt: 'aufwuchs', bezeichnung: 'Zaubernuss', einheit: 'Stück', einzelpreis: 40, geaendertAm: T1 }]);
  });

  it('dieselbe Position (Schreibweise egal) wird aktualisiert statt doppelt angelegt', () => {
    const start = [eintrag('a', { bezeichnung: 'Zaubernuss', einzelpreis: 40 })];
    const liste = merkePosition(start, { abschnitt: 'aufwuchs', bezeichnung: 'zaubernuss', einheit: 'Stück', einzelpreis: 45 }, T2);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id: 'a', einzelpreis: 45, geaendertAm: T2 });
  });

  it('ohne neuen Preis bleibt der gemerkte Preis; eine gelöschte Position kommt zurück', () => {
    const start = [eintrag('a', { bezeichnung: 'Zaubernuss', einzelpreis: 40, geloescht: true })];
    const liste = merkePosition(start, { abschnitt: 'aufwuchs', bezeichnung: 'Zaubernuss', einheit: 'Stück' }, T2);
    expect(liste[0]).toMatchObject({ einzelpreis: 40, geloescht: undefined });
    expect(aktive(liste)).toHaveLength(1);
  });

  it('gleiche Bezeichnung in anderem Abschnitt ist eine andere Position', () => {
    const start = [eintrag('a', { bezeichnung: 'Kübel' })];
    const liste = merkePosition(start, { abschnitt: 'aussenanlagen', bezeichnung: 'Kübel', einheit: 'Stück' }, T2, () => 'b');
    expect(liste).toHaveLength(2);
  });
});

describe('ändern und löschen', () => {
  it('ändern setzt die Änderungszeit; löschen lässt eine Marke stehen', () => {
    let liste = [eintrag('a'), eintrag('b')];
    liste = aendereEintrag(liste, 'a', { bezeichnung: 'Neu', einzelpreis: 5 }, T2);
    expect(liste[0]).toMatchObject({ bezeichnung: 'Neu', einzelpreis: 5, geaendertAm: T2 });
    liste = loescheEintrag(liste, 'b', T3);
    expect(liste[1]).toMatchObject({ geloescht: true, geaendertAm: T3 });
    expect(aktive(liste).map((e) => e.id)).toEqual(['a']);
    expect(aktive(liste, 'aussenanlagen')).toEqual([]);
  });
});

describe('fuehreZusammen', () => {
  it('je Eintrag gewinnt die neuere Änderung', () => {
    const lokal = [eintrag('a', { bezeichnung: 'lokal', geaendertAm: T2 }), eintrag('b', { bezeichnung: 'alt', geaendertAm: T1 })];
    const fremd = [eintrag('a', { bezeichnung: 'fremd', geaendertAm: T1 }), eintrag('b', { bezeichnung: 'neu', geaendertAm: T3 })];
    const z = fuehreZusammen(lokal, fremd);
    expect(z.find((e) => e.id === 'a')?.bezeichnung).toBe('lokal');
    expect(z.find((e) => e.id === 'b')?.bezeichnung).toBe('neu');
  });

  it('Einträge von nur einer Seite bleiben erhalten', () => {
    const z = fuehreZusammen([eintrag('a')], [eintrag('b')]);
    expect(z.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('eine neuere Löschung gewinnt, eine ältere nicht; bei Gleichstand gewinnt „gelöscht“', () => {
    expect(fuehreZusammen([eintrag('a', { geaendertAm: T1 })], [eintrag('a', { geloescht: true, geaendertAm: T2 })])[0].geloescht).toBe(true);
    expect(fuehreZusammen([eintrag('a', { geaendertAm: T3 })], [eintrag('a', { geloescht: true, geaendertAm: T2 })])[0].geloescht).toBeUndefined();
    expect(fuehreZusammen([eintrag('a')], [eintrag('a', { geloescht: true })])[0].geloescht).toBe(true);
    expect(fuehreZusammen([eintrag('a', { geloescht: true })], [eintrag('a')])[0].geloescht).toBe(true);
  });

  it('gleicheEintraege ignoriert die Reihenfolge', () => {
    expect(gleicheEintraege([eintrag('a'), eintrag('b')], [eintrag('b'), eintrag('a')])).toBe(true);
    expect(gleicheEintraege([eintrag('a')], [eintrag('a', { einzelpreis: 1 })])).toBe(false);
  });
});

describe('Speicher-Funktionen', () => {
  const speicher = (): EigeneSpeicher & { stand: EigeneStand } => {
    const s = {
      stand: { eintraege: [] } as EigeneStand,
      lade: () => structuredClone(s.stand),
      speichere: (n: EigeneStand) => void (s.stand = structuredClone(n)),
    };
    return s;
  };

  it('Änderungen markieren den Stand als „wartet auf Abgleich“', () => {
    const sp = speicher();
    const a = merkeEigenePosition({ abschnitt: 'aufwuchs', bezeichnung: 'Zaubernuss', einheit: 'Stück' }, sp, () => T1);
    expect(a.wartet).toBe(true);
    const id = a.eintraege[0].id;
    sp.stand.wartet = false;
    aendereEigenePosition(id, { einzelpreis: 12 }, sp, () => T2);
    expect(sp.stand).toMatchObject({ wartet: true });
    expect(sp.stand.eintraege[0].einzelpreis).toBe(12);
    sp.stand.wartet = false;
    loescheEigenePosition(id, sp, () => T3);
    expect(sp.stand.wartet).toBe(true);
    expect(sp.stand.eintraege[0].geloescht).toBe(true);
  });
});
