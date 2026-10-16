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
import { feldTreffer, levenshtein, normalisiere, schwelle } from './util.js';

// Feldgewichte (absteigend): Bezeichnung am stärksten, dann Arten-Namen und
// Synonyme (gleich gewichtet), dann Kategorie, zuletzt die Varianten-Merkmale.
const GEWICHT = {
  bezeichnung: 1.0,
  art: 0.85,
  kategorie: 0.6,
  variante: 0.5,
} as const;

/**
 * Mindest-Rohqualität, ab der ein reiner Tippfehler-Treffer (Levenshtein) als
 * belastbar gilt. Schwächere Fuzzy-Treffer (z. B. „Tulpen“ ~ „Türen“,
 * „Rasen“ ~ „Rose“) werden verworfen, SOBALD es für die Anfrage stärkere
 * Gleich-/Präfix-/Teilstring-Treffer gibt – sie würden die Liste nur verwässern.
 * d = 1 ergibt 0,72 (bleibt erhalten), d = 2 ergibt 0,62 (gilt als schwach).
 */
const FUZZY_MINDESTQUALITAET = 0.7;

interface PositionsFeldTreffer {
  grund: Extract<TrefferGrund, 'bezeichnung' | 'kategorie' | 'art'>;
  score: number; // Gewicht × Qualität
  qualitaet: number; // rohe Feldqualität [0, 1]
  fuzzy: boolean; // beste Übereinstimmung nur per Tippfehlertoleranz
  matchText: string;
}

/**
 * Bester Feldtreffer eines Tokens auf Positionsebene (Bezeichnung, Arten,
 * Synonyme, Kategorie). Synonyme werden wie Arten gewichtet und als
 * trefferGrund 'art' geführt.
 */
function bestePositionsFeld(position: Position, token: string): PositionsFeldTreffer {
  const bez = feldTreffer(token, position.bezeichnung);
  let best: PositionsFeldTreffer = {
    grund: 'bezeichnung',
    score: GEWICHT.bezeichnung * bez.qualitaet,
    qualitaet: bez.qualitaet,
    fuzzy: bez.fuzzy,
    matchText: position.bezeichnung,
  };

  for (const art of [...position.arten, ...(position.synonyme ?? [])]) {
    const t = feldTreffer(token, art);
    const score = GEWICHT.art * t.qualitaet;
    if (score > best.score) {
      best = { grund: 'art', score, qualitaet: t.qualitaet, fuzzy: t.fuzzy, matchText: art };
    }
  }

  const kat = feldTreffer(token, position.kategorie);
  const katScore = GEWICHT.kategorie * kat.qualitaet;
  if (katScore > best.score) {
    best = {
      grund: 'kategorie',
      score: katScore,
      qualitaet: kat.qualitaet,
      fuzzy: kat.fuzzy,
      matchText: position.kategorie,
    };
  }

  return best;
}

interface VariantenTreffer {
  variante: Variante;
  qualitaet: number;
  fuzzy: boolean;
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
      const t = feldTreffer(token, merkmal);
      if (t.qualitaet > 0 && (!best || t.qualitaet > best.qualitaet)) {
        best = { variante, qualitaet: t.qualitaet, fuzzy: t.fuzzy, matchText: merkmal };
      }
    }
  }
  return best;
}

/**
 * Interner Treffer mit zusätzlichen Kennzeichen für die Nachfilterung:
 * `stark` = enthält mindestens einen Gleich-/Präfix-/Teilstring-Treffer;
 * `schwachFuzzy` = reiner, schwacher Tippfehler-Treffer (verwerfbar, sobald es
 * für die Anfrage starke Treffer gibt). Beide Felder sind rein intern und
 * gehören nicht zur öffentlichen {@link Treffer}-API.
 */
interface BewerteterTreffer extends Treffer {
  stark: boolean;
  schwachFuzzy: boolean;
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
function bewertePosition(position: Position, tokens: string[]): BewerteterTreffer | null {
  let gesamtScore = 0;
  let bestesPosFeld: PositionsFeldTreffer | null = null;
  let bestVariante: VariantenTreffer | null = null;
  // „stark“ = mindestens ein Token traf irgendwo per Gleichheit/Präfix/Teilstring
  // (nicht nur per Tippfehlertoleranz).
  let stark = false;

  for (const token of tokens) {
    const posFeld = bestePositionsFeld(position, token);
    const variante = besteVariante(position, token);
    const varScore = variante ? GEWICHT.variante * variante.qualitaet : 0;
    const tokenScore = Math.max(posFeld.score, varScore);

    if (tokenScore <= 0) return null; // dieses Token trifft nirgends → kein Treffer

    gesamtScore += tokenScore;

    if (variante && varScore > posFeld.score) {
      // Token passt am besten auf ein Variantenmerkmal.
      if (!variante.fuzzy) stark = true;
      if (!bestVariante || variante.qualitaet > bestVariante.qualitaet) {
        bestVariante = variante;
      }
    } else {
      if (!posFeld.fuzzy) stark = true;
      if (!bestesPosFeld || posFeld.score > bestesPosFeld.score) {
        bestesPosFeld = posFeld;
      }
    }
  }

  if (gesamtScore <= 0) return null;

  // Repräsentativer Treffer (bestimmt trefferGrund/matchText): ein reiner,
  // schwacher Fuzzy-Treffer (ohne jeden starken Treffer) ist verwerfbar.
  const repFuzzyQualitaet = bestVariante
    ? bestVariante.fuzzy
      ? bestVariante.qualitaet
      : 1
    : bestesPosFeld!.fuzzy
      ? bestesPosFeld!.qualitaet
      : 1;
  const schwachFuzzy = !stark && repFuzzyQualitaet < FUZZY_MINDESTQUALITAET;

  if (bestVariante) {
    return {
      position,
      variante: bestVariante.variante,
      score: gesamtScore,
      trefferGrund: 'variante',
      matchText: bestVariante.matchText,
      stark,
      schwachFuzzy,
    };
  }

  // bestesPosFeld ist hier gesetzt, da mindestens ein Token positionsseitig traf.
  const feld = bestesPosFeld!;
  return {
    position,
    score: gesamtScore,
    trefferGrund: feld.grund,
    matchText: feld.matchText,
    stark,
    schwachFuzzy,
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
  const bewertet: BewerteterTreffer[] = [];
  for (const position of positionen) {
    const t = bewertePosition(position, tokens);
    if (t) bewertet.push(t);
  }

  // Gibt es für die Anfrage starke Treffer (Gleichheit/Präfix/Teilstring), werden
  // schwache Fuzzy-Treffer verworfen. Fehlen starke Treffer völlig, bleibt die
  // Tippfehlertoleranz voll erhalten (z. B. „Ligustar“ → Hecke).
  const gibtStarke = bewertet.some((t) => t.stark);
  const treffer: Treffer[] = bewertet
    .filter((t) => !(gibtStarke && t.schwachFuzzy))
    // interne Kennzeichen entfernen, nur die öffentliche Treffer-Form zurückgeben
    .map(({ stark: _stark, schwachFuzzy: _schwachFuzzy, ...rest }) => rest);

  treffer.sort(sortiere);
  return options.limit != null ? treffer.slice(0, options.limit) : treffer;
}

/**
 * Trefferqualität des Suchbegriffs gegen EINEN invasiven Feldnamen. Bewusst
 * STRENGER als die Katalogsuche: Verglichen wird gegen den GANZEN normalisierten
 * Namen (Gleichheit, Teilstring, enge Levenshtein-Toleranz), NICHT Wort für Wort.
 * So löst ein einzelnes geteiltes Wort wie „Japanischer“ (in „Japanischer
 * Hopfen“ vs. „Japanischer Ahorn/Staudenknöterich“) keinen Fehlalarm aus –
 * ein falscher Invasiv-Hinweis ist schlimmer als keiner.
 */
function invasivQualitaet(query: string, feldtext: string): number {
  const ziel = normalisiere(feldtext);
  if (!query || !ziel) return 0;
  if (ziel === query) return 1;
  // Teilstring des GANZEN Namens, z. B. „Herkulesstaude“ in
  // „Riesenbärenklau / Herkulesstaude“. Kurze Fragmente ausgeschlossen.
  if (query.length >= 4 && ziel.includes(query)) return 0.9;
  if (query.length >= 4 && ziel.length >= 4 && query.includes(ziel)) return 0.85;
  // Tippfehlertoleranz NUR gegen den ganzen Namen mit enger Schwelle
  // (längenabhängig), damit „Götterbaun“ noch den Götterbaum erkennt, aber
  // „Japanischer Staudenknöterich“ nicht fälschlich „Japanischer Hopfen“ trifft.
  const d = levenshtein(query, ziel);
  if (d <= schwelle(Math.min(query.length, ziel.length))) {
    return Math.max(0.5, 0.72 - (d - 1) * 0.1);
  }
  return 0;
}

/**
 * Prüft, ob `name` einer invasiven Art der Unionsliste entspricht. Vergleicht
 * gegen deutschen, wissenschaftlichen, Synonym- und englischen Namen (jeweils
 * falls vorhanden). Gleichheit und Teilstring des vollen Namens greifen immer;
 * Tippfehlertoleranz nur eng gegen den ganzen Namen (siehe
 * {@link invasivQualitaet}). Gibt die gefundene Art oder null zurück.
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
      const qualitaet = invasivQualitaet(query, feld);
      if (qualitaet > besteQualitaet) {
        besteQualitaet = qualitaet;
        best = art;
      }
    }
  }

  return besteQualitaet > 0 ? best : null;
}
