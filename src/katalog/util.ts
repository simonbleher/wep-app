// Interne Hilfsfunktionen für Normalisierung und Tippfehler-Toleranz.
// Bewusst klein und ohne Abhängigkeiten gehalten, damit die Suche offline läuft
// und leicht testbar ist.

/**
 * Normalisiert Text einheitlich für Suche und Vergleich:
 * Kleinschreibung, deutsche Umlaute/ß gefaltet (ä→ae, ö→oe, ü→ue, ß→ss),
 * Mehrfach-Leerzeichen zu einem, getrimmt. So matchen „Höhe“ und „Hoehe“.
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Zerlegt normalisierten Text in einzelne Wörter (Satzzeichen trennen). */
export function woerter(normalisierterText: string): string[] {
  return normalisierterText.split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Levenshtein-Editierdistanz (Anzahl Einfügungen/Löschungen/Ersetzungen)
 * zwischen zwei Zeichenketten. Klassische DP-Implementierung.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let vorherige = Array.from({ length: b.length + 1 }, (_, i) => i);
  let aktuelle = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    aktuelle[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      aktuelle[j] = Math.min(
        aktuelle[j - 1] + 1, // Einfügung
        vorherige[j] + 1, // Löschung
        vorherige[j - 1] + kosten, // Ersetzung
      );
    }
    [vorherige, aktuelle] = [aktuelle, vorherige];
  }
  return vorherige[b.length];
}

/**
 * Längenabhängige Toleranzschwelle: kurze Wörter vertragen weniger Tippfehler.
 * ≤4 Zeichen → 1 Edit, sonst bis zu 2 Edits.
 */
export function schwelle(laenge: number): number {
  return laenge <= 4 ? 1 : 2;
}

/**
 * Ergebnis einer Trefferbewertung: die Qualität in [0, 1] plus die Information,
 * ob die beste Übereinstimmung NUR über die Levenshtein-Tippfehlertoleranz
 * zustande kam (`fuzzy: true`) oder über einen starken Treffer (Gleichheit,
 * Präfix oder Teilstring; `fuzzy: false`). Diese Unterscheidung braucht die
 * Suche, um schwache Fuzzy-Treffer bei vorhandenen starken Treffern zu verwerfen.
 */
export interface FeldTreffer {
  qualitaet: number;
  fuzzy: boolean;
}

/**
 * Trefferqualität eines Suchtokens gegen ein einzelnes Zielwort, Wert in [0, 1]:
 * Gleichheit > Präfix > Teilstring > Tippfehler (Levenshtein innerhalb Schwelle).
 * Nur der Tippfehler-Zweig liefert `fuzzy: true`. Beide Eingaben sind bereits
 * normalisiert.
 */
function wortTreffer(token: string, wort: string): FeldTreffer {
  if (!token || !wort) return { qualitaet: 0, fuzzy: false };
  if (token === wort) return { qualitaet: 1, fuzzy: false };
  if (wort.startsWith(token) && token.length >= 2) return { qualitaet: 0.9, fuzzy: false };
  // Suchbegriff länger als das Zielwort, Zielwort ist Präfix (z. B. „apfelbaum“ → „apfel“).
  if (token.startsWith(wort) && wort.length >= 2) return { qualitaet: 0.85, fuzzy: false };
  if (wort.includes(token) && token.length >= 3) return { qualitaet: 0.75, fuzzy: false };
  const d = levenshtein(token, wort);
  if (d <= schwelle(token.length)) {
    return { qualitaet: Math.max(0.5, 0.72 - (d - 1) * 0.1), fuzzy: true };
  }
  return { qualitaet: 0, fuzzy: false };
}

/**
 * Bester Treffer (Qualität + Fuzzy-Kennzeichen) eines bereits normalisierten
 * Suchtokens gegen einen (rohen) Feldtext. Prüft den ganzen Text (Gleichheit/
 * Präfix/Teilstring) und jedes einzelne Wort (zusätzlich tippfehlertolerant).
 */
export function feldTreffer(token: string, feldtext: string): FeldTreffer {
  const ziel = normalisiere(feldtext);
  if (!token || !ziel) return { qualitaet: 0, fuzzy: false };

  let best: FeldTreffer = { qualitaet: 0, fuzzy: false };
  if (ziel === token) best = { qualitaet: 1, fuzzy: false };
  else if (ziel.startsWith(token) && token.length >= 2) best = { qualitaet: 0.9, fuzzy: false };
  else if (ziel.includes(token) && token.length >= 3) best = { qualitaet: 0.75, fuzzy: false };

  for (const wort of woerter(ziel)) {
    if (best.qualitaet === 1) break;
    const kandidat = wortTreffer(token, wort);
    if (kandidat.qualitaet > best.qualitaet) best = kandidat;
  }
  return best;
}

/**
 * Beste Trefferqualität eines bereits normalisierten Suchtokens gegen einen
 * (rohen) Feldtext, Wert in [0, 1]. Dünne Hülle um {@link feldTreffer}.
 */
export function feldQualitaet(token: string, feldtext: string): number {
  return feldTreffer(token, feldtext).qualitaet;
}
