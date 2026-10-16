import { describe, it, expect } from 'vitest';
import katalogData from '../../data/katalog.json';
import invasiveData from '../../data/invasive.json';
import { sucheKatalog, istInvasiv } from './suche.js';
import type { InvasiveArt, Katalog } from './types.js';

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
