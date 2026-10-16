// Kernlogik der Katalog-Suche (Bereich `katalog`). Alle exportierten Funktionen
// sind REIN und bekommen die Daten als Parameter (Dependency Injection) – sie
// lesen keine Dateien und kennen keine Pfade. Das hält sie offline-fähig und
// leicht testbar (siehe CLAUDE.md: Offline hat Vorrang).

import type {
  InvasiveArt,
  Position,
  SucheOptions,
  Treffer,
  TrefferGrund,
  Variante,
} from './types.js';
import { feldQualitaet, normalisiere } from './util.js';

// Feldgewichte (absteigend): Bezeichnung am stärksten, dann Arten-Namen,
// dann Kategorie, zuletzt die Varianten-Merkmale.
const GEWICHT = {
  bezeichnung: 1.0,
  art: 0.85,
  kategorie: 0.6,
  variante: 0.5,
} as const;

interface PositionsFeldTreffer {
  grund: Extract<TrefferGrund, 'bezeichnung' | 'kategorie' | 'art'>;
  score: number; // Gewicht × Qualität
  matchText: string;
}

/** Bester Feldtreffer eines Tokens auf Positionsebene (Bezeichnung/Arten/Kategorie). */
function bestePositionsFeld(position: Position, token: string): PositionsFeldTreffer {
  let best: PositionsFeldTreffer = {
    grund: 'bezeichnung',
    score: GEWICHT.bezeichnung * feldQualitaet(token, position.bezeichnung),
    matchText: position.bezeichnung,
  };

  for (const art of position.arten) {
    const score = GEWICHT.art * feldQualitaet(token, art);
    if (score > best.score) best = { grund: 'art', score, matchText: art };
  }

  const katScore = GEWICHT.kategorie * feldQualitaet(token, position.kategorie);
  if (katScore > best.score) {
    best = { grund: 'kategorie', score: katScore, matchText: position.kategorie };
  }

  return best;
}

interface VariantenTreffer {
  variante: Variante;
  qualitaet: number;
  matchText: string;
}

/** Bester Variantentreffer eines Tokens gegen die Diskriminator-Werte einer Position. */
function besteVariante(position: Position, token: string): VariantenTreffer | null {
  if (!position.varianten) return null;
  let best: VariantenTreffer | null = null;

  for (const variante of position.varianten) {
    const merkmale = [
      variante.form,
      variante.altersstufe,
      variante.groesse,
      variante.material,
      variante.ausfuehrung,
      variante.typ,
    ];
    for (const merkmal of merkmale) {
      if (!merkmal) continue;
      const qualitaet = feldQualitaet(token, merkmal);
      if (qualitaet > 0 && (!best || qualitaet > best.qualitaet)) {
        best = { variante, qualitaet, matchText: merkmal };
      }
    }
  }
  return best;
}

/**
 * Bewertet eine Position gegen alle Suchtokens. Gibt null zurück, wenn nicht
 * JEDES Token irgendwo (Positions- oder Variantenebene) trifft – so matcht
 * „Apfel Halbstamm“ nur das Obstgehölz und nicht Positionen, die bloß eines
 * der Wörter enthalten.
 *
 * Ein Token zählt dort, wo es am besten passt. Trifft ein Token ein
 * Varianten-Merkmal besser als die Positionsebene, wird diese konkrete Variante
 * als Treffer zurückgegeben (trefferGrund 'variante') – so wird aus
 * „Apfel Halbstamm“ das Obstgehölz mit der Halbstamm-Variante.
 */
function bewertePosition(position: Position, tokens: string[]): Treffer | null {
  let gesamtScore = 0;
  let bestesPosFeld: PositionsFeldTreffer | null = null;
  let bestVariante: VariantenTreffer | null = null;

  for (const token of tokens) {
    const posFeld = bestePositionsFeld(position, token);
    const variante = besteVariante(position, token);
    const varScore = variante ? GEWICHT.variante * variante.qualitaet : 0;
    const tokenScore = Math.max(posFeld.score, varScore);

    if (tokenScore <= 0) return null; // dieses Token trifft nirgends → kein Treffer

    gesamtScore += tokenScore;

    if (variante && varScore > posFeld.score) {
      // Token passt am besten auf ein Variantenmerkmal.
      if (!bestVariante || variante.qualitaet > bestVariante.qualitaet) {
        bestVariante = variante;
      }
    } else if (!bestesPosFeld || posFeld.score > bestesPosFeld.score) {
      bestesPosFeld = posFeld;
    }
  }

  if (gesamtScore <= 0) return null;

  if (bestVariante) {
    return {
      position,
      variante: bestVariante.variante,
      score: gesamtScore,
      trefferGrund: 'variante',
      matchText: bestVariante.matchText,
    };
  }

  // bestesPosFeld ist hier gesetzt, da mindestens ein Token positionsseitig traf.
  const feld = bestesPosFeld!;
  return {
    position,
    score: gesamtScore,
    trefferGrund: feld.grund,
    matchText: feld.matchText,
  };
}

/**
 * Sortierung der Trefferliste (Ranking):
 *   1. höherer score zuerst (höheres Feldgewicht und nähere/stärkere Treffer),
 *   2. bei Gleichstand höhere `relevanz` (Häufigkeit im Kleingarten),
 *   3. zuletzt alphabetisch nach `bezeichnung`.
 * Dadurch landet z. B. „Liguster“ als Arten-Treffer zunächst gleichauf bei
 * Hecke (relevanz 5) und Ziergehölz (relevanz 4); die relevanz-Stufe (2.) ordnet
 * dann Hecke vor Ziergehölz – ohne Sonderfall für einzelne Namen.
 */
function sortiere(a: Treffer, b: Treffer): number {
  return (
    b.score - a.score ||
    b.position.relevanz - a.position.relevanz ||
    a.position.bezeichnung.localeCompare(b.position.bezeichnung, 'de')
  );
}

/**
 * Liste ohne Suchbegriff: erst die zuletzt verwendeten Positionen in der
 * gegebenen Reihenfolge, dann der Rest nach relevanz absteigend, bei Gleichstand
 * alphabetisch nach bezeichnung.
 */
function listeOhneBegriff(positionen: Position[], options: SucheOptions): Treffer[] {
  const zuletzt = options.zuletztVerwendet ?? [];
  const treffer: Treffer[] = [];

  zuletzt.forEach((id, index) => {
    const position = positionen.find((p) => p.id === id);
    if (position) {
      treffer.push({
        position,
        score: 1000 - index, // bewahrt die vorgegebene Reihenfolge
        trefferGrund: 'zuletzt',
      });
    }
  });

  const rest = positionen
    .filter((p) => !zuletzt.includes(p.id))
    .sort(
      (a, b) =>
        b.relevanz - a.relevanz || a.bezeichnung.localeCompare(b.bezeichnung, 'de'),
    )
    .map<Treffer>((position) => ({
      position,
      score: position.relevanz,
      trefferGrund: 'relevanz',
    }));

  const alle = [...treffer, ...rest];
  return options.limit != null ? alle.slice(0, options.limit) : alle;
}

/**
 * Durchsucht den Katalog. Ohne Suchbegriff wird die komplette Liste nach
 * „zuletzt verwendet“ und `relevanz` sortiert zurückgegeben. Mit Suchbegriff
 * wird tippfehlertolerant über Bezeichnung, Arten, Kategorie und
 * Varianten-Merkmale gesucht.
 */
export function sucheKatalog(
  positionen: Position[],
  begriff: string,
  options: SucheOptions = {},
): Treffer[] {
  const query = begriff ? normalisiere(begriff) : '';
  if (!query) return listeOhneBegriff(positionen, options);

  const tokens = query.split(' ').filter(Boolean);
  const treffer: Treffer[] = [];
  for (const position of positionen) {
    const t = bewertePosition(position, tokens);
    if (t) treffer.push(t);
  }

  treffer.sort(sortiere);
  return options.limit != null ? treffer.slice(0, options.limit) : treffer;
}

/**
 * Prüft, ob `name` einer invasiven Art der Unionsliste entspricht. Vergleicht
 * tippfehlertolerant gegen deutschen, wissenschaftlichen, Synonym- und
 * englischen Namen (jeweils falls vorhanden). Nutzt dieselbe Normalisierung/
 * Toleranz wie die Suche. Gibt die gefundene Art oder null zurück.
 */
export function istInvasiv(arten: InvasiveArt[], name: string): InvasiveArt | null {
  const query = normalisiere(name);
  if (!query) return null;

  let best: InvasiveArt | null = null;
  let besteQualitaet = 0;

  for (const art of arten) {
    const felder = [art.deutsch, art.wissenschaftlich, art.synonym, art.englisch];
    for (const feld of felder) {
      if (!feld) continue;
      const qualitaet = feldQualitaet(query, feld);
      if (qualitaet > besteQualitaet) {
        besteQualitaet = qualitaet;
        best = art;
      }
    }
  }

  return besteQualitaet > 0 ? best : null;
}
