import { describe, it, expect } from 'vitest';
import katalogData from '../../data/katalog.json';
import invasiveData from '../../data/invasive.json';
import { sucheKatalog, istInvasiv } from './suche.js';
import type { InvasiveArt, Katalog } from './types.js';
import { alsKatalogPosition, type EigenerAbschnitt } from './eigene.js';

// Echte Projektdaten laden (siehe data/README.md). Die JSON-Imports werden auf
// die Katalog-Typen gecastet, da der Einheiten-Enum im JSON als string vorliegt.
const positionen = (katalogData as unknown as Katalog).positionen;
const invasive = (invasiveData as unknown as { arten: InvasiveArt[] }).arten;

describe('sucheKatalog – Arten-Namen', () => {
  it('"Apfel" liefert das Obstgehölz als Top-Treffer', () => {
    const treffer = sucheKatalog(positionen, 'Apfel');
    expect(treffer[0].position.id).toBe('aw-obstgehoelz');
  });

  it('"Liguster" liefert erst die Hecke, dann das Ziergehölz', () => {
    const treffer = sucheKatalog(positionen, 'Liguster');
    expect(treffer[0].position.id).toBe('aw-hecke');
    expect(treffer[1].position.id).toBe('aw-ziergehoelz');
    // Grundlage des Rankings: gleicher Arten-Treffer, relevanz entscheidet.
    expect(treffer[0].position.relevanz).toBe(5);
    expect(treffer[1].position.relevanz).toBe(4);
  });
});

describe('sucheKatalog – konkrete Variante', () => {
  it('"Apfel Halbstamm" liefert das Obstgehölz mit der Halbstamm-Variante', () => {
    const treffer = sucheKatalog(positionen, 'Apfel Halbstamm');
    expect(treffer[0].position.id).toBe('aw-obstgehoelz');
    expect(treffer[0].trefferGrund).toBe('variante');
    expect(treffer[0].variante?.form).toBe('Halbstamm');
  });
});

describe('sucheKatalog – Variante typ (K3: Ökologische Objekte)', () => {
  it('"Insektenhotel" findet das Ökologische Objekt als Top-Treffer', () => {
    const treffer = sucheKatalog(positionen, 'Insektenhotel');
    expect(treffer[0].position.id).toBe('aa-oekologisches-objekt');
    expect(treffer[0].trefferGrund).toBe('variante');
    expect(treffer[0].variante?.typ).toBe('Insektenhotel');
  });

  it('"Benjeshecke" findet das Ökologische Objekt als Top-Treffer', () => {
    const treffer = sucheKatalog(positionen, 'Benjeshecke');
    expect(treffer[0].position.id).toBe('aa-oekologisches-objekt');
    expect(treffer[0].trefferGrund).toBe('variante');
  });

  it('"Totholz" findet das Ökologische Objekt als Top-Treffer', () => {
    const treffer = sucheKatalog(positionen, 'Totholz');
    expect(treffer[0].position.id).toBe('aa-oekologisches-objekt');
    expect(treffer[0].trefferGrund).toBe('variante');
  });
});

describe('sucheKatalog – Tippfehler-Toleranz', () => {
  it('Tippfehler im Arten-Namen ("Ligustar") findet trotzdem die Hecke zuerst', () => {
    const treffer = sucheKatalog(positionen, 'Ligustar');
    expect(treffer.map((t) => t.position.id)).toContain('aw-hecke');
    expect(treffer[0].position.id).toBe('aw-hecke');
  });

  it('Tippfehler in der Bezeichnung ("Hochbet") findet das Hochbeet', () => {
    const treffer = sucheKatalog(positionen, 'Hochbet');
    expect(treffer[0].position.id).toBe('aa-hochbeet');
  });

  it('Umlaut-Faltung: "Stuetzmauer" findet "Stützmauer"', () => {
    const treffer = sucheKatalog(positionen, 'Stuetzmauer');
    expect(treffer[0].position.id).toBe('aa-stuetzmauer');
  });
});

describe('sucheKatalog – Alltags-Synonyme', () => {
  it('"Regentonne" liefert den Regenwasserauffangbehälter als Top-Treffer', () => {
    const treffer = sucheKatalog(positionen, 'Regentonne');
    expect(treffer[0].position.id).toBe('aa-regenwasserbehaelter');
  });

  it('"Gartenweg" liefert den Wege- und Platzbelag als Top-Treffer', () => {
    const treffer = sucheKatalog(positionen, 'Gartenweg');
    expect(treffer[0].position.id).toBe('aa-wegebelag');
  });
});

describe('sucheKatalog – schwaches Fuzzy-Rauschen verwerfen', () => {
  it('"Tulpen" findet die Knollen/Zwiebeln-Position, nicht die Einfriedung', () => {
    const treffer = sucheKatalog(positionen, 'Tulpen');
    expect(treffer[0].position.id).toMatch(/^aw-knollen-zwiebeln/);
    expect(treffer.map((t) => t.position.id)).not.toContain('aa-einfriedung');
  });

  it('"Rasen" findet die Rasen-Position, nicht die Rose', () => {
    const treffer = sucheKatalog(positionen, 'Rasen');
    expect(treffer[0].position.id).toBe('aw-rasen');
    expect(treffer.map((t) => t.position.id)).not.toContain('aw-rose');
  });
});

describe('sucheKatalog – ohne Suchbegriff', () => {
  it('leerer Begriff liefert alle Positionen, nach relevanz absteigend', () => {
    const treffer = sucheKatalog(positionen, '');
    expect(treffer.length).toBe(positionen.length);
    expect(treffer[0].position.relevanz).toBe(5);
    for (let i = 1; i < treffer.length; i++) {
      expect(treffer[i - 1].position.relevanz).toBeGreaterThanOrEqual(
        treffer[i].position.relevanz,
      );
    }
  });

  it('zuletzt verwendete ID steht vorn, mit trefferGrund "zuletzt"', () => {
    const treffer = sucheKatalog(positionen, '', { zuletztVerwendet: ['aa-stufe'] });
    expect(treffer[0].position.id).toBe('aa-stufe');
    expect(treffer[0].trefferGrund).toBe('zuletzt');
  });

  it('mehrere zuletzt verwendete IDs behalten ihre Reihenfolge', () => {
    const treffer = sucheKatalog(positionen, '', {
      zuletztVerwendet: ['aa-stufe', 'aw-rose'],
    });
    expect(treffer[0].position.id).toBe('aa-stufe');
    expect(treffer[1].position.id).toBe('aw-rose');
  });
});

describe('sucheKatalog – limit', () => {
  it('limit begrenzt die leere Liste', () => {
    const treffer = sucheKatalog(positionen, '', { limit: 5 });
    expect(treffer.length).toBe(5);
  });

  it('limit begrenzt auch die Suchtrefferliste', () => {
    const treffer = sucheKatalog(positionen, 'Liguster', { limit: 1 });
    expect(treffer.length).toBe(1);
    expect(treffer[0].position.id).toBe('aw-hecke');
  });
});

describe('istInvasiv', () => {
  it('erkennt eine invasive Art am deutschen Namen', () => {
    expect(istInvasiv(invasive, 'Götterbaum')?.id).toBe('ailanthus-altissima');
  });

  it('erkennt eine invasive Art am wissenschaftlichen Namen', () => {
    expect(istInvasiv(invasive, 'Ailanthus altissima')?.id).toBe('ailanthus-altissima');
  });

  it('erkennt eine invasive Art am Synonym', () => {
    // Persicaria perfoliata, Synonym "Polygonum perfoliatum".
    expect(istInvasiv(invasive, 'Polygonum perfoliatum')?.id).toBe('persicaria-perfoliata');
  });

  it('gibt für eine klar nicht-invasive Gartenpflanze null zurück', () => {
    expect(istInvasiv(invasive, 'Apfel')).toBeNull();
  });

  it('Umlaut-Faltung: "Goetterbaum" erkennt den Götterbaum', () => {
    expect(istInvasiv(invasive, 'Goetterbaum')?.id).toBe('ailanthus-altissima');
  });

  it('Tippfehler ("Götterbaun") erkennt den Götterbaum trotzdem', () => {
    expect(istInvasiv(invasive, 'Götterbaun')?.id).toBe('ailanthus-altissima');
  });

  it('kein Fehlalarm: "Japanischer Staudenknöterich" matcht NICHT den "Japanischer Hopfen"', () => {
    const treffer = istInvasiv(invasive, 'Japanischer Staudenknöterich');
    // Der Staudenknöterich (Reynoutria/Fallopia japonica) steht nicht auf der
    // Unionsliste in invasive.json – daher darf kein Treffer entstehen und auf
    // keinen Fall der falsche "Japanischer Hopfen".
    expect(treffer?.id).not.toBe('humulus-scandens');
    const staudenknoeterich = invasive.find((a) =>
      a.deutsch.toLowerCase().includes('staudenknöterich'),
    );
    expect(treffer).toBe(staudenknoeterich ?? null);
  });

  it('"Japanischer Ahorn" ist nicht invasiv und liefert null', () => {
    expect(istInvasiv(invasive, 'Japanischer Ahorn')).toBeNull();
  });
});

describe('sucheKatalog – eigene Positionen', () => {
  const eigene = (bezeichnung: string, abschnitt: EigenerAbschnitt = 'aufwuchs') =>
    alsKatalogPosition({
      id: bezeichnung.toLowerCase(),
      abschnitt,
      bezeichnung,
      einheit: 'Stück',
      geaendertAm: '2026-10-20T08:00:00.000Z',
    });
  const aufwuchs = positionen.filter((p) => p.abschnitt === 'III. Aufwuchs');

  it('steht bei gleicher Güte vor dem Katalogtreffer', () => {
    // „Rasen“ ist auch eine Katalogposition; die eigene mit demselben Namen gewinnt den Gleichstand.
    const treffer = sucheKatalog([...aufwuchs, eigene('Rasen')], 'Rasen');
    expect(treffer[0].position.eigen).toBe(true);
    expect(treffer[0].score).toBe(treffer[1].score);
    expect(treffer[1].position.id).toBe('aw-rasen');
  });

  it('verdrängt keinen besseren Katalogtreffer', () => {
    // Exakter Katalog-Treffer „Rasen“ schlägt die eigene „Rasenkante“ (nur Präfix-Treffer).
    const treffer = sucheKatalog([...aufwuchs, eigene('Rasenkante')], 'Rasen');
    expect(treffer[0].position.id).toBe('aw-rasen');
    expect(treffer.find((t) => t.position.eigen)).toBeDefined();
  });

  it('findet eine eigene Position über ihre Bezeichnung (tippfehlertolerant)', () => {
    const treffer = sucheKatalog([...aufwuchs, eigene('Zaubernuss')], 'Zaubernus');
    expect(treffer[0].position.eigen).toBe(true);
    expect(treffer[0].position.bezeichnung).toBe('Zaubernuss');
  });

  it('ohne Suchbegriff: nach „zuletzt verwendet“ die eigenen, dann der Katalog', () => {
    const treffer = sucheKatalog([...aufwuchs, eigene('Zaubernuss')], '', { zuletztVerwendet: ['aw-rasen'] });
    expect(treffer[0].position.id).toBe('aw-rasen');
    expect(treffer[1].position.eigen).toBe(true);
  });
});
