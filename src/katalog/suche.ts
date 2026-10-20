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
import { feldQualitaet, levenshtein, normalisiere } from './util.js';

// Feldgewichte (absteigend): Bezeichnung am stärksten, dann Arten-Namen und
// Alltags-Synonyme (gleiche Stufe), dann Kategorie, zuletzt die Varianten-Merkmale.
const GEWICHT = {
  bezeichnung: 1.0,
  art: 0.85,
  synonym: 0.85,
  kategorie: 0.6,
  variante: 0.5,
} as const;

/**
 * Mindest-Trefferqualität (reine Qualität, ungewichtet) für einen ernsthaften
 * Treffer. Exakte, Präfix- und Teilstring-Treffer liegen klar darüber (≥ 0,75),
 * ebenso enge Tippfehler-Treffer mit nur einem Edit (0,72). Schwache Fuzzy-
 * Treffer mit zwei Edits (0,62) werden verworfen – so taucht z. B. „Tulpen“
 * nicht mehr über „Türen“ bei der Einfriedung und „Rasen“ nicht mehr über „Rose“
 * auf, während „Ligustar“ → Liguster (ein Edit) weiterhin durchkommt.
 */
const MIN_QUALITAET = 0.7;

interface PositionsFeldTreffer {
  grund: Extract<TrefferGrund, 'bezeichnung' | 'kategorie' | 'art' | 'synonym'>;
  score: number; // Gewicht × Qualität
  qualitaet: number; // reine Trefferqualität [0,1], ohne Feldgewicht
  matchText: string;
}

/**
 * Bester Feldtreffer eines Tokens auf Positionsebene
 * (Bezeichnung/Arten/Synonyme/Kategorie).
 */
function bestePositionsFeld(position: Position, token: string): PositionsFeldTreffer {
  const bezQ = feldQualitaet(token, position.bezeichnung);
  let best: PositionsFeldTreffer = {
    grund: 'bezeichnung',
    score: GEWICHT.bezeichnung * bezQ,
    qualitaet: bezQ,
    matchText: position.bezeichnung,
  };

  for (const art of position.arten) {
    const qualitaet = feldQualitaet(token, art);
    const score = GEWICHT.art * qualitaet;
    if (score > best.score) best = { grund: 'art', score, qualitaet, matchText: art };
  }

  for (const synonym of position.synonyme ?? []) {
    const qualitaet = feldQualitaet(token, synonym);
    const score = GEWICHT.synonym * qualitaet;
    if (score > best.score) best = { grund: 'synonym', score, qualitaet, matchText: synonym };
  }

  const katQ = feldQualitaet(token, position.kategorie);
  const katScore = GEWICHT.kategorie * katQ;
  if (katScore > best.score) {
    best = { grund: 'kategorie', score: katScore, qualitaet: katQ, matchText: position.kategorie };
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
  let besteQualitaet = 0;
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
      besteQualitaet = Math.max(besteQualitaet, variante.qualitaet);
      if (!bestVariante || variante.qualitaet > bestVariante.qualitaet) {
        bestVariante = variante;
      }
    } else {
      besteQualitaet = Math.max(besteQualitaet, posFeld.qualitaet);
      if (!bestesPosFeld || posFeld.score > bestesPosFeld.score) {
        bestesPosFeld = posFeld;
      }
    }
  }

  if (gesamtScore <= 0) return null;

  // Schwaches Fuzzy-Rauschen verwerfen: Wenn selbst der beste Treffer dieser
  // Position nur ein schwacher Tippfehler-Treffer unterhalb der Mindestqualität
  // ist, ist die Position kein ernsthafter Kandidat (siehe MIN_QUALITAET).
  if (besteQualitaet < MIN_QUALITAET) return null;

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
 *   2. bei Gleichstand eigene (gemerkte) Positionen vor Katalogpositionen,
 *   3. dann höhere `relevanz` (Häufigkeit im Kleingarten),
 *   4. zuletzt alphabetisch nach `bezeichnung`.
 * Dadurch landet z. B. „Liguster“ als Arten-Treffer zunächst gleichauf bei
 * Hecke (relevanz 5) und Ziergehölz (relevanz 4); die relevanz-Stufe (2.) ordnet
 * dann Hecke vor Ziergehölz – ohne Sonderfall für einzelne Namen.
 */
function sortiere(a: Treffer, b: Treffer): number {
  return (
    b.score - a.score ||
    Number(!!b.position.eigen) - Number(!!a.position.eigen) ||
    b.position.relevanz - a.position.relevanz ||
    a.position.bezeichnung.localeCompare(b.position.bezeichnung, 'de')
  );
}

/**
 * Liste ohne Suchbegriff: erst die zuletzt verwendeten Positionen in der
 * gegebenen Reihenfolge, dann die eigenen, dann der Rest nach relevanz absteigend, bei Gleichstand
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
        Number(!!b.eigen) - Number(!!a.eigen) ||
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
 * wird tippfehlertolerant über Bezeichnung, Arten, Alltags-Synonyme, Kategorie
 * und Varianten-Merkmale gesucht. Schwache Fuzzy-Treffer unterhalb von
 * MIN_QUALITAET werden verworfen.
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
 * Enge Tippfehler-Schwelle NUR für die Invasiv-Prüfung: deutlich strenger als
 * die allgemeine Suche. Kurze Namen dulden genau einen Edit, lange Namen
 * (ab ~17 Zeichen) höchstens zwei – gedeckelt bei 2. So bleibt eine leichte
 * Verschreibung eines echten Namens erkennbar, ohne dass ganze Wörter „erfunden“
 * werden dürfen.
 */
function invasivSchwelle(laenge: number): number {
  return Math.min(2, Math.max(1, Math.floor(laenge * 0.12)));
}

/**
 * Trefferqualität des GANZEN (normalisierten) Suchnamens gegen EINEN ganzen
 * (normalisierten) Zielnamen, Wert in [0, 1]. Bewusst ohne Einzelwort-Fuzzy:
 * Gleichheit > Präfix (beidseitig) > enger Tippfehler auf dem gesamten Namen.
 * Dadurch kann ein einzelnes geteiltes Wort eines mehrwortigen Suchbegriffs
 * NICHT auf einen anderen mehrwortigen Eintrag matchen (z. B. „Japanischer
 * Staudenknöterich“ nicht auf „Japanischer Hopfen“).
 */
export function ganzerNameQualitaet(query: string, ziel: string): number {
  if (!query || !ziel) return 0;
  if (query === ziel) return 1;
  if (ziel.startsWith(query) && query.length >= 3) return 0.9;
  if (query.startsWith(ziel) && ziel.length >= 3) return 0.85;
  const d = levenshtein(query, ziel);
  if (d <= invasivSchwelle(ziel.length)) return 0.7;
  return 0;
}

/**
 * Beste Qualität des ganzen Suchnamens gegen ein Feld. Ein Feld kann mehrere
 * gleichwertige Namen per „/“ enthalten (z. B. „Riesenbärenklau / Herkules-
 * staude“); diese werden als eigenständige GANZE Namen behandelt – aber niemals
 * Wort für Wort gefuzzt.
 */
function invasivFeldQualitaet(query: string, feldtext: string): number {
  const ziel = normalisiere(feldtext);
  if (!query || !ziel) return 0;

  let best = 0;
  for (const name of ziel.split('/')) {
    const kandidat = name.trim();
    if (!kandidat) continue;
    best = Math.max(best, ganzerNameQualitaet(query, kandidat));
    if (best === 1) break;
  }
  return best;
}

/**
 * Prüft, ob `name` einer invasiven Art der Unionsliste entspricht. Vergleicht
 * den GANZEN normalisierten Namen gegen deutschen, wissenschaftlichen, Synonym-
 * und englischen Namen (jeweils falls vorhanden). Exakte oder Präfix-Treffer
 * gewinnen; Tippfehler sind nur auf dem ganzen Namen und nur innerhalb einer
 * engen Schwelle erlaubt (siehe invasivSchwelle). Es wird bewusst NICHT pro
 * Einzelwort gefuzzt, damit ein geteiltes Wort eines mehrwortigen Namens (z. B.
 * „Japanischer …“) keinen Fehlalarm auf einem anderen mehrwortigen Eintrag
 * auslöst – ein falscher Invasiv-Hinweis ist schlimmer als keiner. Gibt die
 * gefundene Art oder null zurück.
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
      const qualitaet = invasivFeldQualitaet(query, feld);
      if (qualitaet > besteQualitaet) {
        besteQualitaet = qualitaet;
        best = art;
      }
    }
  }

  return besteQualitaet > 0 ? best : null;
}
